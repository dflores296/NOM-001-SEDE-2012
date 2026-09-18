#!/usr/bin/env python3
"""
Verificación del corpus. Falla con código distinto de cero si el parseo se
degrada, para que un cambio en los patrones no llegue al sitio publicado.

    python3 tools/check_corpus.py data/

Los umbrales son deliberadamente cercanos a los valores actuales: la norma no
cambia, así que cualquier variación significa que el parser se rompió.
"""
import json, os, re, sys
from collections import Counter

# La captura manual de las tablas es la fuente de verdad; esto la protege.
from huella import desalineadas, discrepancias, sin_congelar

MIN = {
    'articulos': 151,
    'secciones': 2890,
    'incisos': 7000,
    'definiciones': 185,
    'cobertura_pct': 99.5,
}

# Tablas: umbrales aparte, porque su reconstrucción es aproximada por
# naturaleza y conviene vigilar que no se degrade, no que sea perfecta.
MIN_TABLAS = 200
MIN_TABLAS_FIABLES = 130


ABC = 'abcdefghijklmnopqrstuvwxyz'

# Huecos de numeración que trae el propio DOF. Se listan uno por uno, con lo
# que dice el PDF, porque la diferencia entre un salto impreso y un inciso que
# el parser perdió no se puede deducir del corpus: en los dos casos falta una
# letra. Contrastados contra el PDF; si alguno se "arregla" solo, es que el
# parser empezó a inventar.
HUECOS_DEL_DOF = {
    # 225-30 y 230-2 anuncian en su propio encabezado los incisos que tienen:
    # "a no ser que se permita en las disposiciones de (a), (c), (d) y (e)".
    '225-30': ['b'],
    '230-2': ['b'],
    # 240-4(d) anuncia en su propio texto que la protección "no debe exceder
    # lo exigido por (1) a (7)" y solo imprime 1, 2, 3, 5 y 7. No es una
    # renumeración: FALTA CONTENIDO. Los cinco impresos son todos de cobre
    # —18, 16, 14, 12 y 10 AWG— y los dos huecos caen entre 14 y 12 y entre 12
    # y 10, es decir intercalados en la serie, no al final. Quien consulte esta
    # sección para un conductor que no sea de cobre no encontrará su renglón, y
    # no porque el parser lo perdiera. Errata del DOF del mismo tipo que las de
    # la Tabla 220-42 y la 430-250.
    '240-4(d)': [4, 6],
}


def walk(n):
    yield n
    for c in n.get('children', []):
        yield from walk(c)


def huecos_de_numeracion(nodo):
    """Incisos que faltan en medio de una enumeración.

    Es el detector que habría cazado solo lo del 800-113, donde el inciso (e)
    colgaba de (d) porque el DOF lo imprime «e).» con un punto de más: la
    sección se quedaba con a, b, c, d, f... y ese salto es la huella que deja
    un inciso mal colocado. Con la misma señal aparecieron 200-10(b), que
    estaba enterrado dentro de una Excepción; 220-14(j), que el DOF imprime
    «J)» en mayúscula; 690-31(d), cuyo texto se había perdido dentro de la zona
    de una tabla; y 504-30(a)(2)(2) y (3), impresos a media línea.

    No mira el PDF: solo comprueba que entre el primer y el último rótulo de
    cada lista no falte ninguno. Un salto no siempre es un error —el DOF tiene
    tres—, y por eso van en HUECOS_DEL_DOF con su razón.
    """
    falta = []
    for n in walk(nodo):
        hijos = n.get('children') or []
        if len(hijos) < 2:
            continue
        suf = [h['id'][len(n['id']):] if h['id'].startswith(n['id']) else None
               for h in hijos]
        if not all(suf):
            continue
        nums = [re.fullmatch(r'\((\d+)\)', x) for x in suf]
        if all(nums):
            v = [int(m.group(1)) for m in nums]
            hay = [x for x in range(v[0], v[-1] + 1) if x not in v]
        else:
            lets = [re.fullmatch(r'\(([a-z])\)|([a-z])\.', x) for x in suf]
            if not all(lets):
                continue
            v = [(m.group(1) or m.group(2)) for m in lets]
            if ABC.index(v[0]) > ABC.index(v[-1]):
                continue
            hay = [x for x in ABC[ABC.index(v[0]):ABC.index(v[-1]) + 1]
                   if x not in v]
        hay = [x for x in hay if x not in HUECOS_DEL_DOF.get(n['id'], [])]
        if hay:
            falta.append('%s (falta %s)' % (n['id'],
                                            ', '.join(str(x) for x in hay)))
    return falta


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else 'data'
    val = json.load(open(os.path.join(d, 'validacion.json')))
    corpus = json.load(open(os.path.join(d, 'corpus.json')))
    grafo = json.load(open(os.path.join(d, 'grafo.json')))

    fails = []

    for k, floor in MIN.items():
        got = val.get(k, 0)
        if got < floor:
            fails.append('%s = %s, se esperaba >= %s' % (k, got, floor))

    if val['articulos'] != val['articulos_esperados']:
        fails.append('artículos del cuerpo (%d) != artículos del índice (%d)'
                     % (val['articulos'], val['articulos_esperados']))

    if grafo['meta']['referencias_rotas'] != 0:
        fails.append('%d referencias rotas en el grafo'
                     % grafo['meta']['referencias_rotas'])

    # Una sección sin texto, hijos ni definiciones casi siempre es un título
    # que se tragó su propio cuerpo (le pasó a 340-6: faltaba el punto que
    # separa título de texto en el PDF y el regex normal consumió la frase
    # entera como título). Sin este check la próxima regresión así pasa
    # inadvertida: no baja ninguna cifra de cobertura, porque las palabras
    # siguen estando, solo que mal repartidas.
    if val.get('secciones_vacias'):
        fails.append('%d secciones vacías: %s'
                     % (len(val['secciones_vacias']), val['secciones_vacias'][:10]))

    # ids duplicados: romperían la búsqueda y los enlaces profundos
    ids = Counter()
    for a in corpus['articles']:
        for s in a['sections']:
            for n in walk(s):
                ids[n['id']] += 1
    dups = [i for i, c in ids.items() if c > 1]
    if dups:
        fails.append('ids duplicados: %s' % dups[:10])

    # las secciones de un artículo deben ir en orden creciente
    for a in corpus['articles']:
        nums = [int(s['id'].split('-')[1]) for s in a['sections']]
        if any(nums[i] <= nums[i - 1] for i in range(1, len(nums))):
            fails.append('artículo %d: secciones fuera de orden' % a['num'])

    # Incisos perdidos: un salto en la numeración es la única señal que deja un
    # inciso que se quedó dentro de una nota, de una excepción o de la zona de
    # una tabla. Ninguna cifra de cobertura lo delata, porque las palabras
    # siguen en el corpus, solo que colgando del nodo equivocado --o, en el
    # caso de 690-31(d), ya no están en ninguna parte.
    saltos = []
    for a in corpus['articles']:
        for s_ in a['sections']:
            saltos.extend(huecos_de_numeracion(s_))
    if saltos:
        fails.append('%d hueco(s) de numeración; si el DOF los imprime así, '
                     'anótalos en HUECOS_DEL_DOF con la cita: %s'
                     % (len(saltos), ', '.join(saltos[:8])))

    tpath = os.path.join(d, 'tablas.json')
    if os.path.exists(tpath):
        tabs = json.load(open(tpath))
        if len(tabs) < MIN_TABLAS:
            fails.append('tablas = %d, se esperaban >= %d' % (len(tabs), MIN_TABLAS))
        fiables = sum(1 for t in tabs if t['quality'] >= 0.95)
        if fiables < MIN_TABLAS_FIABLES:
            fails.append('tablas de alta confianza = %d, se esperaban >= %d'
                         % (fiables, MIN_TABLAS_FIABLES))
        sin_grid = [t['id'] for t in tabs if t['cols'] < 2]
        if len(sin_grid) > 12:
            fails.append('%d tablas quedaron en una sola columna' % len(sin_grid))

        # Cada fila debe cubrir exactamente las columnas de la tabla, contando
        # los colspan y los rowspan que bajan de las filas de arriba. Una fila
        # que se pasa o que deja un hueco desalinea el resto de la tabla en el
        # navegador, y eso en una tabla de ampacidades es un valor mal leído.
        malformadas = []
        for t in tabs:
            n = t['cols']
            pend = [0] * n
            for i, row in enumerate(t['rows']):
                occ = [p > 0 for p in pend]
                col = 0
                for c in row:
                    while col < n and occ[col]:
                        col += 1
                    cs, rs = c.get('cs', 1), c.get('rs', 1)
                    if col + cs > n:
                        malformadas.append('%s fila %d' % (t['id'], i))
                        break
                    for x in range(col, col + cs):
                        occ[x] = True
                        if rs > 1:
                            pend[x] = rs
                    col += cs
                if sum(occ) != n:
                    malformadas.append('%s fila %d' % (t['id'], i))
                pend = [max(0, p - 1) for p in pend]
        if malformadas:
            fails.append('%d filas de tabla mal formadas: %s'
                         % (len(malformadas), malformadas[:6]))

        # Una columna sin un solo dato en toda la tabla es un corte inventado,
        # no una columna del original. Aparecían cuando el reparto elegido era
        # el que más columnas producía: la 220-56, de dos columnas, llegó a
        # publicarse con cuatro y dos de ellas vacías.
        vacias = []
        for t in tabs:
            n = t['cols']
            ocupada = [False] * n
            for row in t['rows']:
                col = 0
                for c in row:
                    cs = c.get('cs', 1)
                    if c['t'].strip():
                        for x in range(col, min(col + cs, n)):
                            ocupada[x] = True
                    col += cs
            faltan = [i for i, o in enumerate(ocupada) if not o]
            if faltan:
                vacias.append('%s col %s' % (t['id'], faltan))
        if vacias:
            fails.append('%d tablas con columnas vacías: %s'
                         % (len(vacias), vacias[:6]))

        # La captura manual es la fuente de verdad y aquí se comprueba, aparte
        # de lo que ya verifica build_tables, que siga intacta. Son dos cosas
        # distintas: que la tabla verificada traiga sus propias celdas (y no las
        # herede del reconstructor), y que su contenido publicado siga siendo el
        # que se selló. Lo de arriba valida la FORMA de las tablas —anchos de
        # fila, columnas vacías—; esto valida el CONTENIDO, que es lo que costó
        # contrastar contra el PDF celda por celda.
        rpath = os.path.join(d, 'tablas_revisadas.json')
        if os.path.exists(rpath):
            revs = json.load(open(rpath, encoding='utf-8'))
            flojas = sin_congelar(revs)
            if flojas:
                fails.append(
                    '%d tabla(s) marcadas verificada sin congelar sus celdas '
                    '(publicarían lo que produzca el reconstructor, con la '
                    'insignia puesta): %s'
                    % (len(flojas), ', '.join('%s (falta %s)' % (t, '/'.join(f))
                                              for t, f in flojas[:6])))
            malas = discrepancias(tabs, revs)
            if malas:
                fails.append(
                    '%d tabla(s) verificadas cambiaron respecto a su huella; '
                    'si es deliberado, acéptalo con build_tables.py --sellar: %s'
                    % (len(malas), ', '.join(t for t, _, _ in malas[:6])))
            # La huella certifica tablas.json, que es derivado; una edición de
            # tablas_revisadas.json sin reconstruir no la movería. Esto compara
            # los dos archivos directamente y delata esa desincronización.
            desal = desalineadas(tabs, revs)
            if desal:
                fails.append(
                    '%d tabla(s) revisadas no coinciden con lo publicado '
                    '(¿falta regenerar tablas.json?): %s'
                    % (len(desal), ', '.join('%s (%s)' % (t, '/'.join(c))
                                             for t, c in desal[:6])))

    if fails:
        print('VERIFICACIÓN FALLIDA')
        for f in fails:
            print('  - %s' % f)
        sys.exit(1)

    msg = ('Verificación correcta: %d artículos, %d secciones, %d incisos, '
           'cobertura %.2f%%, 0 referencias rotas.'
           % (val['articulos'], val['secciones'], val['incisos'],
              val['cobertura_pct']))
    if os.path.exists(tpath):
        msg += ('\n  Tablas: %d reconstruidas, %d de alta confianza.'
                % (len(tabs), fiables))
    print(msg)


if __name__ == '__main__':
    main()
