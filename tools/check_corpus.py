#!/usr/bin/env python3
"""
Verificación del corpus. Falla con código distinto de cero si el parseo se
degrada, para que un cambio en los patrones no llegue al sitio publicado.

    python3 tools/check_corpus.py data/

Los umbrales son deliberadamente cercanos a los valores actuales: la norma no
cambia, así que cualquier variación significa que el parser se rompió.
"""
import hashlib, json, os, re, sys
from collections import Counter

# La captura manual de las tablas es la fuente de verdad; esto la protege.
from huella import desalineadas, discrepancias, sin_congelar
# Las ocho formas con que el DOF cita el Apéndice A se reducen con la misma
# clave canónica que usa el grafo; escribirla dos veces sería empezar a
# comprobar otra cosa.
from build_graph import RE_AP_FIG, RE_AP_TBL, clave_apendice

MIN = {
    'articulos': 151,
    'secciones': 2890,
    'incisos': 7000,
    'definiciones': 185,
    'cobertura_pct': 99.5,
    # Las figuras se contaban y no se comprobaban nunca: una regresión que
    # dejara 12 de 59 salía en verde y publicaba artículos sin su diagrama.
    'imagenes': 59,
    'figuras': 45,
    'figuras_numeradas': 51,
    # La región de cierre: 7 hitos (Capítulo 10, Títulos 6 a 8, Apéndices A a
    # C) y sus bloques. Antes no existía y sus 38 páginas caían dentro de
    # 924-24 sin que ninguna cifra lo delatara.
    'cierre_bloques': 120,
    'cierre_lineas': 165,
}

# Los siete hitos de la región de cierre. Que falte uno significa que el
# documento dejó de parsearse donde debía: se exige la lista completa y no un
# conteo, porque perder el Apéndice C --el de las tablas de ocupación en tubo
# conduit-- y ganar un Título repetido daría el mismo número.
HITOS_CIERRE = ['capitulo-10', 'titulo-6', 'titulo-7', 'titulo-8',
                'apendice-A', 'apendice-B', 'apendice-C']

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


# La única cita del Apéndice A que no lleva a ninguna parte, y por qué.
FIGURAS_AUSENTES_DEL_DOF = {
    # El texto la cita cuatro veces --una para explicar cómo modificar la
    # ampacidad en bancos de ductos-- y el DOF no la imprime: el Apéndice A
    # trae cuatro imágenes, en las páginas 762 a 765, y son la (2), (3), (4) y
    # la (5). No es una figura que la extracción perdiera; en esas páginas no
    # hay ninguna imagen más.
    'B.310.15(B)(2)(1)': 'el DOF no imprime esta figura (págs. 762-765)',
}


# Una celda con tres o más números sueltos dentro es casi siempre una columna
# entera aplanada, que es como se publicaban las tablas de ampacidad del
# Apéndice A antes de contrastarlas. Estas son las que de verdad imprime así el
# DOF, contrastadas contra el PDF.
# `None` es la tabla entera; una tupla, solo esas columnas.
CELDAS_APILADAS = {
    # La Tabla 400-4 pone en una sola celda los espesores que corresponden a
    # los tramos de calibre de la celda de al lado: "8 - 2 | 1 - 4/0 | 250"
    # frente a "1.52 2.03 2.41". Son tres renglones 64, 67 y 117.
    '400-4': None,
    # La columna «Sección» de los listados del Apéndice B es una LISTA de
    # referencias por diseño, impresa una por renglón: la NMX-J-604-ANCE-2008
    # remite a "4.4.2", "110" y "240" (pág. 769). Las otras tres tablas del
    # listado tienen celdas iguales y hoy no calzan con el patrón solo porque
    # sus referencias llevan guion ("550-5 550-23 555-3"); si alguna cambiara,
    # su columna 2 va aquí por la misma razón y no por hacer pasar el check.
    'B1.2': (2,),
}

# Un número, con su decimal y su llamada al pie, tres veces o más seguidas y
# nada más. No admite coma ni guion a propósito: "2 501-9 000" es un rango y
# "500, 501, 502 503" es una lista de artículos, y las dos son celdas legítimas
# de tablas ya contrastadas.
RE_CELDA_COLAPSADA = re.compile(r'\d[\d.]*\*{0,2}(?:\s+\d[\d.]*\*{0,2}){2,}')


def celdas_colapsadas(tabs):
    """Tablas verificadas con una columna entera metida en una celda.

    Es el defecto que tenían las nueve tablas del Apéndice A: la rejilla
    dibujada del PDF solo traza una línea cada grupo de calibres, el
    reconstructor le creyó a la rejilla antes que a las palabras y cada celda
    acabó con "14 12 10 8" dentro. La cobertura no lo ve --el texto está
    publicado-- y la calidad tampoco lo delata siempre: la (2)(7) salía con
    0.95 y tenía seis celdas así.

    Solo mira las verificadas: una tabla sin contrastar ya lo avisa con su
    insignia, y hoy la C-2 tiene 116 celdas de estas esperando su ronda.
    """
    malas = []
    for t in tabs:
        if not t.get('verificada'):
            continue
        libres = CELDAS_APILADAS.get(t['id'], ())
        if libres is None:
            continue
        hits = [c.get('t') for fila in t['rows']
                for i, c in enumerate(fila)
                if i not in libres
                and RE_CELDA_COLAPSADA.fullmatch((c.get('t') or '').strip())]
        if hits:
            malas.append('%s (%d: %s)' % (t['id'], len(hits), hits[0][:30]))
    if not malas:
        return []
    return ['%d tabla(s) verificadas tienen una columna aplanada dentro de una '
            'celda: %s. Si el DOF de verdad la imprime así, va en '
            'CELDAS_APILADAS con sus renglones'
            % (len(malas), ', '.join(malas[:6]))]


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


# El titulo de una tabla se arma pegando los renglones del PDF, y ahi se cuela
# lo que nadie ve leyendo celdas: el de la 220-55 salia con su cola repetida
# cuatro veces, y tres de la familia 310-60 se quedaban a media frase. Lo
# encontro un lector de casualidad, con 226 titulos publicados. Estas dos
# comprobaciones lo vuelven trabajo del build.

# Un titulo completo no termina en preposicion, articulo, conjuncion ni guion.
# La coma NO cuenta: el de la Tabla 610-14(a) acaba en coma en el propio DOF
# —"...regimen de trabajo de corta duracion,"— y reproducirlo es lo correcto.
RE_COLGADO = re.compile(
    r'(?:\b(?:de|del|la|el|los|las|en|con|para|y|o|a|al|por|que|se|su|un|una'
    r'|seg[uú]n|sobre|entre|hasta|desde)|[-–—:])$', re.I)


def cola_repetida(t, minimo=25):
    """El sufijo mas largo que aparece mas de una vez en el titulo."""
    for n in range(len(t) // 2, minimo, -1):
        if t.count(t[-n:]) > 1:
            return t[-n:]
    return None


def titulos_sospechosos(tabs):
    """(duplicados, colgados) entre los titulos publicados."""
    dup, colg = [], []
    for t in tabs:
        ti = (t.get('title') or '').strip()
        if not ti:
            continue
        if cola_repetida(ti):
            dup.append(t['id'])
        elif RE_COLGADO.search(ti):
            colg.append(t['id'])
    return dup, colg



def revisar_figuras(corpus, d, img_dir):
    """Comprueba que lo publicado y la captura de figuras sigan casando.

    Tres formas de romperse, las tres invisibles hasta ahora:

    - **La imagen cambió**: la captura describe un PNG concreto y se sella con
      su huella. Otra versión de pymupdf, otro recorte, y la leyenda publicada
      ya no describe lo que se ve.
    - **Falta el archivo**: el corpus apunta a un `src` que no está en disco y
      el sitio publica una imagen rota.
    - **Sobra un archivo**: `site/public/img/` se versiona y el pipeline lo
      reescribe sin limpiarlo, así que un PNG que dejara de extraerse se
      quedaría publicado para siempre sin que nadie lo cite.

    Y una cuarta, de forma: dos figuras con el mismo ancla no son ancla.
    """
    fails = []
    ruta = os.path.join(d, 'figuras.json')
    if not os.path.exists(ruta):
        return ['no existe %s: las figuras se publicarían sin rótulo' % ruta]
    captura = json.load(open(ruta, encoding='utf-8'))

    figs = [f for a in corpus['articles'] for s in a['sections']
            for n in walk(s) for f in n.get('figures', [])]
    # Las cuatro del Apéndice A no cuelgan de ningún inciso: viven en la
    # región de cierre, y sin mirarlas ahí el detector de huérfanos las daba
    # por PNG sobrantes.
    figs += [b for h in corpus.get('cierre', []) for b in h['bloques']
             if b['tipo'] == 'figura']

    sin_captura = sorted({f['src'] for f in figs if f['src'] not in captura})
    if sin_captura:
        fails.append('%d figura(s) sin capturar en figuras.json (hay que '
                     'mirarlas y darles su rótulo): %s'
                     % (len(sin_captura), ', '.join(sin_captura[:6])))

    faltan, movidas, sin_min = [], [], []
    for src, e in sorted(captura.items()):
        ruta_png = os.path.join(img_dir, src)
        if not os.path.exists(os.path.join(img_dir, 'min', src)):
            sin_min.append(src)
        if not os.path.exists(ruta_png):
            faltan.append(src)
            continue
        sha = hashlib.sha256(open(ruta_png, 'rb').read()).hexdigest()[:16]
        if sha != e.get('sha'):
            movidas.append('%s (%s != %s)' % (src, sha, e.get('sha')))
    if faltan:
        fails.append('%d imagen(es) capturadas que no están en %s: %s'
                     % (len(faltan), img_dir, ', '.join(faltan[:6])))
    if movidas:
        fails.append('%d imagen(es) cambiaron respecto a su huella; la leyenda '
                     'capturada ya no las describe, hay que volver a mirarlas: %s'
                     % (len(movidas), ', '.join(movidas[:4])))

    if sin_min:
        fails.append('%d figura(s) sin miniatura en %s/min; el índice de '
                     'figuras las publicaría rotas: %s'
                     % (len(sin_min), img_dir, ', '.join(sin_min[:6])))

    usadas = {f['src'] for f in figs}
    for carpeta in (img_dir, os.path.join(img_dir, 'min')):
        if not os.path.isdir(carpeta):
            continue
        huerfanos = sorted(x for x in os.listdir(carpeta)
                           if x.endswith('.png') and x not in usadas)
        if huerfanos:
            fails.append('%d PNG en %s que ninguna figura usa; el directorio se '
                         'versiona y el pipeline no lo limpia, así que se '
                         'publicarían igual: %s'
                         % (len(huerfanos), carpeta, ', '.join(huerfanos[:6])))

    # El ancla de la figura es la de su primer rótulo, así que solo se cuentan
    # los rótulos; una imagen sin rótulo -una fórmula- aporta la suya.
    anclas = Counter()
    for f in figs:
        if f.get('rotulos'):
            for r in f['rotulos']:
                anclas[r['ancla']] += 1
        else:
            anclas[f.get('ancla')] += 1
    repes = [a for a, c in anclas.items() if c > 1 and a is not None]
    if repes:
        fails.append('anclas de figura repetidas: %s' % repes[:6])
    if None in anclas:
        fails.append('%d figura(s) sin ancla: no se puede enlazar a ellas'
                     % anclas[None])
    return fails


def titulos_del_cierre(corpus):
    """Encabezados del cierre que en realidad son celdas de una tabla.

    La zona de una tabla se recorta con holgura y RE_KEEP rescata de ella lo
    que parece un encabezado, para no perder la sección que viene justo
    debajo. En el cierre eso se vuelve en contra: «505-5 Nota 2» es una celda
    de la columna «Sección» de los listados del Apéndice B y tiene la forma
    exacta de un encabezado de sección, así que se publicaba como título en
    /apendices/B. Eran tres. Aquí no hay secciones numeradas, así que un
    título con esa forma siempre es una celda escapada.
    """
    malos = []
    for h in corpus.get('cierre', []):
        for b in h['bloques']:
            if b['tipo'] not in ('titulo', 'subtitulo'):
                continue
            if re.match(r'^\d{3}-\d{1,3}\b', (b.get('text') or '').strip()):
                malos.append('%s: %r' % (h['id'], b['text'][:40]))
    if not malos:
        return []
    return ['%d encabezado(s) del cierre son celdas de una tabla escapadas de '
            'su zona: %s' % (len(malos), ', '.join(malos[:6]))]


def textos(corpus):
    """Todo el texto publicado, para buscar citas sobre él."""
    for a in corpus['articles']:
        for sec in a['sections']:
            for n in walk(sec):
                yield n.get('text') or ''
                yield n.get('title') or ''
                for x in (n.get('notes') or []) + (n.get('exceptions') or []):
                    yield x.get('text') or ''
                    for it in x.get('items') or []:
                        yield it.get('text') or ''
                for x in n.get('parrafos') or []:
                    yield x.get('text') or ''
                for x in n.get('definitions') or []:
                    yield (x.get('term') or '') + ' ' + (x.get('text') or '')
    for h in corpus.get('cierre', []):
        yield h.get('titulo') or ''
        for b in h['bloques']:
            yield b.get('text') or ''


def citas_del_apendice(corpus, tabs, figuras_ids):
    """Citas a las tablas y figuras del Apéndice A que no llevan a ningún lado.

    El cuerpo las nombra de ocho formas --punto o guion, inciso en minúscula,
    un espacio de más, y en cuatro citas sin el «(B)»-- y el sitio las resuelve
    reduciéndolas a una clave canónica. Si una captura cambiara de rótulo, o
    `clave_apendice` dejara de reducir una de las formas, esas citas volverían
    a quedarse mudas sin que nada lo dijera: `build_graph` no lo caza, porque
    una cita sin destino no llega a ser arista rota, simplemente no existe.
    """
    # Los dos espacios de nombres se comprueban por separado, como los resuelve
    # el sitio: la Tabla B.310.15(B)(2)(1) existe y la Figura B.310.15(B)(2)(1)
    # no, así que mezclarlos daría por buena justamente la cita que no lleva a
    # ninguna parte.
    destinos = {
        RE_AP_TBL: {clave_apendice(t['id']) for t in tabs
                    if t['id'].startswith('B.310')},
        RE_AP_FIG: {clave_apendice(f) for f in figuras_ids
                    if f.upper().startswith('B.310')},
    }
    perdidas = Counter()
    for txt in textos(corpus):
        for rex, vivos in destinos.items():
            for m in rex.finditer(txt):
                clave = clave_apendice(m.group(1))
                if clave not in vivos and clave not in FIGURAS_AUSENTES_DEL_DOF:
                    perdidas[m.group(0)] += 1
    if not perdidas:
        return []
    return ['%d cita(s) al Apéndice A sin destino: %s. Si es otro hueco del '
            'DOF va en FIGURAS_AUSENTES_DEL_DOF con su página; si no, la '
            'captura o la clave canónica se movieron'
            % (sum(perdidas.values()),
               ', '.join('%r x%d' % (k, v) for k, v in perdidas.most_common(5)))]


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

    if val.get('cierre_hitos') != HITOS_CIERRE:
        fails.append('los hitos de la región de cierre no son los esperados: '
                     '%s (se esperaban %s)'
                     % (val.get('cierre_hitos'), HITOS_CIERRE))

    fails.extend(revisar_figuras(
        corpus, d, os.environ.get('NOM_IMG_DIR', 'site/public/img')))

    rotulos = [r['id']
               for a in corpus['articles'] for sec in a['sections']
               for n in walk(sec) for f in n.get('figures', [])
               for r in f.get('rotulos', [])]
    rotulos += [r['id'] for h in corpus.get('cierre', []) for b in h['bloques']
                for r in b.get('rotulos', [])]
    fails.extend(citas_del_apendice(corpus, tabs, rotulos))
    fails.extend(celdas_colapsadas(tabs))
    fails.extend(titulos_del_cierre(corpus))

    dup, colg = titulos_sospechosos(tabs)
    if dup:
        fails.append(
            '%d tabla(s) repiten un trozo al final de su título (el pegado de '
            'renglones lo duplicó): %s' % (len(dup), ', '.join(dup[:6])))
    if colg:
        fails.append(
            '%d tabla(s) tienen el título cortado a media frase; contrástalo '
            'contra el PDF y, si el DOF lo imprime así, no lo toques: %s'
            % (len(colg), ', '.join(colg[:6])))

    if fails:
        print('VERIFICACIÓN FALLIDA')
        for f in fails:
            print('  - %s' % f)
        sys.exit(1)

    msg = ('Verificación correcta: %d artículos, %d secciones, %d incisos, '
           'cobertura %.2f%%, 0 referencias rotas.'
           % (val['articulos'], val['secciones'], val['incisos'],
              val['cobertura_pct']))
    msg += ('\n  Cierre: %d hitos, %d bloques, %d líneas.'
            % (len(val.get('cierre_hitos') or []), val.get('cierre_bloques', 0),
               val.get('cierre_lineas', 0)))
    msg += ('\n  Figuras: %d con %d número(s), %d fórmulas, %d imágenes '
            'capturadas.' % (val.get('figuras', 0), val.get('figuras_numeradas', 0),
                             val.get('formulas', 0), val.get('imagenes', 0)))
    if os.path.exists(tpath):
        msg += ('\n  Tablas: %d reconstruidas, %d de alta confianza.'
                % (len(tabs), fiables))
    print(msg)


if __name__ == '__main__':
    main()
