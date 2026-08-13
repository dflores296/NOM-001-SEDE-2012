#!/usr/bin/env python3
"""
Verificación del corpus. Falla con código distinto de cero si el parseo se
degrada, para que un cambio en los patrones no llegue al sitio publicado.

    python3 tools/check_corpus.py data/

Los umbrales son deliberadamente cercanos a los valores actuales: la norma no
cambia, así que cualquier variación significa que el parser se rompió.
"""
import json, os, sys
from collections import Counter

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


def walk(n):
    yield n
    for c in n.get('children', []):
        yield from walk(c)


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
