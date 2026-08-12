#!/usr/bin/env python3
"""
Fase 4 — Reconstruye las tablas de la NOM-001-SEDE-2012 como datos.

    pip install pymupdf
    python3 tools/build_tables.py NOM-001-SEDE-2012.pdf data/

Genera data/tablas.json: cada tabla con su rejilla de filas y columnas, su
artículo, su página y sus notas al pie.

Por qué no basta con el texto ni con find_tables():

  - En la capa de texto las tablas se aplanan a un valor por línea y pierden
    filas y columnas por completo.
  - La detección geométrica de PyMuPDF colapsa varias filas en una sola celda.

Lo que sí funciona es aprovechar que el PDF se imprimió desde HTML, así que
conserva las líneas de la rejilla como rectángulos vectoriales:

  - FILAS: de las líneas horizontales y de los extremos verticales de los
    bordes de celda. Varias tablas no dibujan horizontales y en cambio cada
    celda traza su propio borde izquierdo, segmentado fila por fila.
  - COLUMNAS: por huecos verticales. Se proyectan todas las palabras sobre el
    eje x y se buscan franjas sin tinta. Usar las líneas verticales fallaría
    en las tablas que solo dibujan el borde exterior, y agrupar por posición
    de inicio fallaría con números centrados o alineados a la derecha.
"""
import json, os, re, sys, unicodedata
from collections import defaultdict

RULE_MAX = 2.5      # grosor máximo de un rect para contarlo como línea
GAP_MIN = 3.0       # ancho mínimo de un hueco para separar columnas
ROW_MIN_H = 4.0     # alto mínimo de una banda para ser fila
CORTE_PESO = 0.10   # cuánto descuenta una palabra partida por fila (best_edges)
CORTE_MIN = 0.25    # cortes por fila que se toleran sin descontar nada
RALA_PESO = 0.15    # cuánto descuenta una columna casi sin datos
RALA_MIN = 0.25     # por debajo de esta fracción de filas con dato, es rala


def unaccent(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


# Un título de tabla continúa con su nombre en mayúscula ("Tabla 1.- Porcentaje
# de la sección..."). Una cita en prosa continúa en minúscula o con coma
# ("Tabla 1 del Capítulo 10.", "Tabla 1, Capítulo 10."). Sin esa distinción, la
# primera cita del texto se tomaba como el encabezado de la tabla y la tabla
# real quedaba fuera: le pasaba a la Tabla 1, la más citada de toda la norma.
RE_CAPTION = re.compile(
    r'^Tabla\s+(\d{3}-\d{1,3}(?:\s*\([a-z0-9]{1,4}\))*|\d{1,2}[A-Z]?(?:\([A-Z]\))?)'
    r'\s*(?:\.-|\.|-|—)?\s+([0-9A-ZÁÉÍÓÚÑ].*)$')

RE_NOTE = re.compile(r'^\s*(?:\*+|NOTA|Nota)\b')

# Dos tablas del artículo 310 llevan pegada al título la advertencia de que su
# contenido es informativo y no normativo. Es información importante, pero no
# es el nombre de la tabla: separarla deja el título legible y permite marcar
# la tabla como informativa allí donde se muestre.
RE_INFORMATIVA = re.compile(
    r'\s*Esta\s+tabla\s+no\s+es\s+parte\s+de\s+los\s+requerimientos\s+y\s+'
    r'especificaciones\s+de\s+la\s+NOM,?\s*se\s+incluye\s+'
    r'[uú]nicamente\s+con\s+prop[oó]sitos\s+informativos\.?\s*', re.I)


def cluster(vals, tol=2.0):
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [round(sum(g) / len(g), 2) for g in out]


# ---------------------------------------------------------------- geometría

def page_rules(page):
    """Líneas verticales [(x, y0, y1)] y horizontales [(y, x0, x1)] de la página."""
    vert, horz = [], []
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] != 're':
                continue
            r = it[1]
            w, h = r.x1 - r.x0, r.y1 - r.y0
            if w > 700 and h > 900:          # marco de página completa
                continue
            if w <= RULE_MAX and h > 3:
                vert.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
            elif h <= RULE_MAX and w > 3:
                horz.append(((r.y0 + r.y1) / 2, r.x0, r.x1))
    return vert, horz


def row_bands(vert, horz, y0, y1):
    """Fronteras horizontales de fila dentro de la banda [y0, y1]."""
    ys = [h[0] for h in horz if y0 - 2 <= h[0] <= y1 + 2]
    for _, a, b in vert:
        if b < y0 - 2 or a > y1 + 2:
            continue
        ys += [max(a, y0), min(b, y1)]
    ys = cluster(ys, 2.0)
    return [(ys[i], ys[i + 1]) for i in range(len(ys) - 1)
            if ys[i + 1] - ys[i] >= ROW_MIN_H]


def edges_from_rules(vert, bands):
    """Fronteras de columna a partir de las líneas verticales de la rejilla.

    Solo se aceptan las que recorren buena parte de la altura de la tabla: las
    tablas con encabezados de varios niveles traen segmentos verticales cortos
    que separan subcolumnas del encabezado y no del cuerpo, y tomarlos como
    fronteras partiría las filas de datos donde no toca.
    """
    if not bands:
        return []
    top, bot = bands[0][0], bands[-1][1]
    height = bot - top
    if height <= 0:
        return []
    cover = defaultdict(float)
    for x, y0, y1 in vert:
        lo, hi = max(y0, top), min(y1, bot)
        if hi > lo:
            cover[round(x, 1)] += hi - lo
    if not cover:
        return []
    merged = defaultdict(float)
    for x in cluster(list(cover), 3.0):
        for x2, v in cover.items():
            if abs(x2 - x) <= 3.0:
                merged[x] += v
    keep = sorted(x for x, v in merged.items() if v >= 0.30 * height)
    return keep if len(keep) >= 3 else []


# ------------------------------------------------- rejilla con fusiones
#
# El encabezado del PDF combina celdas para que se entienda: "Rango de
# temperatura del conductor" cubre las tres columnas de 60/75/90 °C, y
# "Temperatura ambiente (°C)" ocupa dos filas. Una rejilla plana pierde esa
# jerarquía y deja títulos de columna que no dicen a qué se refieren, además
# de columnas fantasma donde el original solo tenía una celda ancha.
#
# Las fusiones están en el trazado: una celda se extiende hasta donde el PDF
# dibujó una línea. Reconstruirlas es leer las líneas, no adivinar.

COVER_V = 0.60   # fracción del alto de la fila que debe cubrir una vertical
COVER_H = 0.70   # fracción del ancho de la celda que debe cubrir una horizontal


def rule_edges(vert, bands):
    """Fronteras de columna: TODAS las verticales de la región, agrupadas.

    A diferencia de edges_from_rules, aquí no se descartan los segmentos
    cortos del encabezado: con el modelo de celdas ya no parten las filas de
    datos, porque cada fila decide por su cuenta dónde tiene borde.
    """
    if not bands:
        return []
    top, bot = bands[0][0], bands[-1][1]
    xs = [x for x, a, b in vert if min(b, bot) - max(a, top) > 2]
    return cluster(xs, 3.0)


def has_vline(vert, x, ya, yb):
    cov = sum(min(b, yb) - max(a, ya) for xx, a, b in vert
              if abs(xx - x) <= 3 and min(b, yb) > max(a, ya))
    return cov >= COVER_V * (yb - ya)


def has_hline(horz, y, xa, xb):
    """¿Hay horizontal a la altura y que cubra casi todo el tramo [xa, xb]?"""
    segs = sorted((max(a, xa), min(b, xb)) for yy, a, b in horz
                  if abs(yy - y) <= 3 and min(b, xb) > max(a, xa))
    cov, cur = 0.0, None
    for a, b in segs:
        if cur and a <= cur[1]:
            cur = (cur[0], max(cur[1], b))
        else:
            if cur:
                cov += cur[1] - cur[0]
            cur = (a, b)
    if cur:
        cov += cur[1] - cur[0]
    return cov >= COVER_H * (xb - xa)


def vline_breaks(vert, x, y):
    """¿La vertical de x se interrumpe a la altura y?

    Varias tablas no dibujan horizontales entre filas de datos: cada celda
    traza su propio borde izquierdo, segmentado fila por fila. El corte de
    ese borde es entonces la única marca de que ahí termina la fila.
    """
    return any(abs(xx - x) <= 3 and (abs(a - y) <= 2.5 or abs(b - y) <= 2.5)
               for xx, a, b in vert)


def vline_continuous(vert, x, ya, yb):
    """¿Hay un único segmento vertical en x que cubre TODO [ya, yb] sin cortes?

    Es la marca geométrica de un rowspan: cuando el PDF fusiona una celda a
    lo alto, su borde se traza de una sola pieza de punta a punta, aunque el
    texto de la celda se envuelva en dos líneas que caen en bandas distintas
    ("Cordón para" / "lámpara" en la Tabla 400-4). Si en cambio hay una fila
    nueva de verdad, el borde se corta justo en la frontera. Distingue lo que
    `words_in` no puede: un borde sin cortar vale más que el texto propio
    abajo, que solo decide cuando no hay trazado del que fiarse.
    """
    return any(abs(xx - x) <= 3 and a <= ya + 1 and b >= yb - 1
               for xx, a, b in vert)


def words_in(words, xa, xb, ya, yb):
    return [w for w in words
            if xa <= (w[0] + w[2]) / 2 < xb and ya - 1 <= (w[1] + w[3]) / 2 <= yb + 1]


def crosses(words, x, ya, yb):
    """¿Alguna palabra de la banda se monta sobre la frontera x?"""
    return any(w[0] < x - 0.5 < w[2] and ya - 1 <= (w[1] + w[3]) / 2 <= yb + 1
               for w in words)


def cell_rects(words, bands, edges, vert, horz, solo_cruces=False):
    """Rectángulos maximales de la rejilla -> [(fila, col, rowspan, colspan)].

    Con `solo_cruces` una celda se ensancha únicamente si hay una palabra
    montada sobre la frontera, y no por el mero hecho de que a la derecha no
    haya nada. Se usa cuando la tabla no dibuja verticales: allí una celda de
    datos vacía es información —en la 220-55 la columna C queda en blanco en
    las filas 31-40, 51-60 y 61+— y ensancharla pondría el valor de la columna
    B a caballo entre dos columnas.
    """
    nR, nC = len(bands), len(edges) - 1
    taken = [[False] * nC for _ in range(nR)]
    out = []
    for i in range(nR):
        ya, yb = bands[i]
        for j in range(nC):
            if taken[i][j]:
                continue
            # Ancho: avanza mientras no haya vertical que separe Y además haya
            # prueba de que la celda cruza esa frontera —una palabra montada
            # encima, o nada a la derecha que separar—. Sin esa segunda
            # condición, las tablas que no dibujan todas sus verticales
            # fundirían cada fila de datos en una sola celda.
            k = j + 1
            while (k < nC and not has_vline(vert, edges[k], ya, yb)
                   and (crosses(words, edges[k], ya, yb)
                        or (not solo_cruces
                            and not words_in(words, edges[k], edges[k + 1], ya, yb)))):
                k += 1
            # Alto: baja mientras no haya NINGUNA señal de frontera. Se exigen
            # las tres: ni horizontal dibujada, ni corte del borde izquierdo,
            # ni texto propio abajo. Una celda de datos en blanco no basta
            # para fusionarla con la de arriba.
            #
            # Salvo que AMBOS bordes —izquierdo y derecho— estén trazados de
            # una sola pieza sin cortar por todo el tramo: eso es un rowspan
            # del PDF y manda sobre el texto propio abajo, que solo decide
            # cuando no hay línea de la que fiarse (vline_continuous).
            #
            # No basta con uno solo de los dos: cada borde interno lo
            # comparten dos columnas, y un borde sin cortar puede deberse a
            # que la columna VECINA no se divide ahí, no esta. En la Tabla
            # 400-4, "Area mm2" y "Aislamiento" comparten el borde de la
            # izquierda; ese borde no se corta porque Aislamiento sí es
            # rowspan, pero Area mm2 no lo es y su borde derecho sí se corta.
            # Exigir los dos evita fusionar esa columna con la fila de abajo.
            r = i + 1
            while r < nR:
                yb_r = bands[r][1]
                if has_hline(horz, bands[r - 1][1], edges[j], edges[k]):
                    break
                if (vline_continuous(vert, edges[j], ya, yb_r)
                        and vline_continuous(vert, edges[k], ya, yb_r)):
                    r += 1
                    continue
                if (vline_breaks(vert, edges[j], bands[r - 1][1])
                        or words_in(words, edges[j], edges[k], *bands[r])):
                    break
                r += 1
            for a in range(i, r):
                for b in range(j, k):
                    taken[a][b] = True
            out.append((i, j, r - i, k - j))
    return out


def build_cells(words, bands, edges, vert, horz, solo_cruces=False):
    """Filas de celdas {t, cs, rs} a partir del trazado de la página."""
    if len(edges) < 3 or not bands:
        return []
    # Las bandas sin una sola palabra se descartan ANTES de medir las
    # fusiones: si se quitaran después, los rowspan que las cruzan quedarían
    # contando filas que ya no existen.
    bands = [b for b in bands if words_in(words, edges[0] - 1e6, edges[-1] + 1e6, *b)]
    if not bands:
        return []
    rects = cell_rects(words, bands, edges, vert, horz, solo_cruces)
    owner = {}
    for i, j, rs, cs in rects:
        for a in range(i, i + rs):
            for b in range(j, j + cs):
                owner[(a, b)] = (i, j)

    # rs cuenta BANDAS crudas, pero la tabla publicada solo tiene una fila por
    # banda que arranca alguna celda: una banda que un rowspan se traga entera
    # en TODAS las columnas —el renglón de ajuste de un título envuelto, sin
    # dato propio en ninguna otra columna— no produce fila de salida. Si rs se
    # dejara en bandas crudas, ese rowspan se comería la fila publicada
    # siguiente, que es un producto distinto sin relación ("Cordón..." con
    # rs=2 tapando la fila de "ECTFE" en la Tabla 402-3). Se remite a cuántas
    # bandas de [i, i+rs) arrancan alguna celda de verdad.
    starts = sorted(set(i for i, _, _, _ in rects))

    def out_rowspan(i, rs):
        return sum(1 for s in starts if i <= s < i + rs)

    txt = defaultdict(list)
    for w in words:
        cy, cx = (w[1] + w[3]) / 2, (w[0] + w[2]) / 2
        bi = next((i for i, b in enumerate(bands) if b[0] - 1 <= cy <= b[1] + 1), None)
        # Las fronteras solo llegan hasta donde el PDF dibujó verticales. Lo
        # que sobresalga por fuera cae en la columna del extremo: si se
        # descartara, la tabla publicada perdería texto en silencio.
        cj = next((c for c in range(len(edges) - 1)
                   if edges[c] <= cx < edges[c + 1]), None)
        if cj is None and bi is not None:
            cj = 0 if cx < edges[0] else len(edges) - 2
        if bi is None or cj is None:
            continue
        key = owner.get((bi, cj))
        if key:
            txt[key].append((round(w[1], 1), w[0], w[4]))

    rows = defaultdict(list)
    for i, j, rs, cs in rects:
        cell = {'t': ' '.join(p[2] for p in sorted(txt.get((i, j), []))).strip()}
        if cs > 1:
            cell['cs'] = cs
        rs_out = out_rowspan(i, rs)
        if rs_out > 1:
            cell['rs'] = rs_out
        rows[i].append((j, cell))
    out = []
    for i in sorted(rows):
        out.append([c for _, c in sorted(rows[i], key=lambda z: z[0])])
    return [r for r in out if r]


def flat_cells(grid):
    """Convierte una rejilla plana de cadenas en celdas sin fusiones."""
    return [[{'t': c} for c in row] for row in grid]


def cell_text(rows):
    """Vista plana del texto, para puntuar y para heurísticas."""
    return [[c['t'] for c in row] for row in rows]


def row_width(row):
    return sum(c.get('cs', 1) for c in row)


def layout(rows, ncols):
    """Coloca las celdas como lo haría el navegador: [(fila, celda, col, cs)].

    Hay que llevar la cuenta de los rowspan que vienen de arriba. Una fila
    bajo una celda de dos filas empieza en la segunda columna, no en la
    primera, y sin esta cuenta se le añadiría una columna de relleno que en
    la tabla no existe.
    """
    pend = [0] * ncols
    out = []
    for row in rows:
        occ = [p > 0 for p in pend]
        col = 0
        fila = []
        for c in row:
            while col < ncols and occ[col]:
                col += 1
            cs = c.get('cs', 1)
            for x in range(col, min(ncols, col + cs)):
                occ[x] = True
                if c.get('rs', 1) > 1:
                    pend[x] = c['rs']
            fila.append((c, col, cs))
            col += cs
        out.append((fila, sum(1 for o in occ if o)))
        pend = [max(0, p - 1) for p in pend]
    return out


def drop_columns(rows, ncols, dead):
    """Elimina columnas enteras respetando las fusiones."""
    dead = set(dead)
    out = []
    for fila, _ in layout(rows, ncols):
        new = []
        for c, col, cs in fila:
            quita = sum(1 for x in range(col, col + cs) if x in dead)
            if quita >= cs:
                continue
            c = dict(c)
            if cs - quita > 1:
                c['cs'] = cs - quita
            else:
                c.pop('cs', None)
            new.append(c)
        if new:
            out.append(new)
    return out, ncols - len(dead)


RE_ATOM = re.compile(r'(?<!\S)[-+]?\d[\d.,]*(?!\S)')


def grid_score(grid):
    """Qué tan bien quedó separada una rejilla, de 0 a 1.

    Una celda que contiene varios números sueltos ("20 25 30") delata que la
    separación de columnas falló y que ahí se fundieron varias celdas. Es la
    señal más fiable en esta norma, donde casi todas las tablas son numéricas.
    """
    cells = [c.strip() for r in grid for c in r if c.strip()]
    if not cells:
        return 0.0
    bad = sum(1 for c in cells if len(RE_ATOM.findall(c)) > 1)
    return 1.0 - bad / len(cells)


def row_clusters(words_of_row):
    """Grupos de palabras de una fila separados por huecos, de izq. a der."""
    ws = sorted(words_of_row, key=lambda w: w[0])
    if not ws:
        return []
    grupos = [[ws[0]]]
    for w in ws[1:]:
        if w[0] - max(x[2] for x in grupos[-1]) >= GAP_MIN:
            grupos.append([w])
        else:
            grupos[-1].append(w)
    return grupos


def column_edges_by_body(words, bands):
    """Fronteras de columna deducidas SOLO de las filas de datos.

    Los encabezados de varias líneas se derraman por encima de los huecos que
    separan las columnas y los tapan. En la Tabla 220-55 el trozo de título
    "8 ¾ kW )" cae justo en la franja que separa la Columna A de la B, así que
    ambas se fundían en una sola celda con los dos valores juntos ("80 80"), y
    la palabra "no" del título de la Columna C se salía por la derecha y creaba
    una columna entera vacía.

    Las filas de datos sí respetan la rejilla. Se agrupan las palabras de cada
    fila por huecos, se toma el número de grupos más repetido —el cuerpo de la
    tabla manda sobre el encabezado, que siempre es minoría— y se proyecta solo
    esas filas.
    """
    if not bands:
        return []
    por_fila = []
    for b in bands:
        ws = [w for w in words if b[0] - 1 <= (w[1] + w[3]) / 2 <= b[1] + 1]
        if ws:
            por_fila.append((b, row_clusters(ws)))
    if len(por_fila) < 4:
        return []

    conteo = defaultdict(int)
    for _, gr in por_fila:
        conteo[len(gr)] += 1
    modal = max(conteo, key=lambda k: (conteo[k], k))
    if modal < 2 or conteo[modal] < 3:
        return []

    cuerpo = [gr for _, gr in por_fila if len(gr) == modal]
    # cada columna es la envolvente de su grupo en todas las filas del cuerpo
    izq = [min(g[0][0] for g in (gr[i] for gr in cuerpo)) for i in range(modal)]
    der = [max(w[2] for gr in cuerpo for w in gr[i]) for i in range(modal)]
    for i in range(modal):
        izq[i] = min(w[0] for gr in cuerpo for w in gr[i])

    edges = [izq[0] - 2]
    for i in range(1, modal):
        if izq[i] <= der[i - 1]:
            return []                      # columnas solapadas: no es fiable
        edges.append((der[i - 1] + izq[i]) / 2)
    edges.append(der[-1] + 2)
    return [round(e, 2) for e in edges]


def column_candidates(words, bands, vert=None):
    """[(fronteras, dibujada)] a evaluar: rejilla, huecos y filas de datos.

    `dibujada` dice si el reparto sale de las líneas del PDF o de deducirlo
    del texto. La distinción importa al puntuar: solo el trazado puede avalar
    que una celda cruce una frontera.
    """
    out = []
    if vert:
        e = edges_from_rules(vert, bands)
        if len(e) >= 2:
            out.append((e, True))
    g = column_edges_by_gaps(words, bands)
    if len(g) >= 2:
        out.append((g, False))
    b = column_edges_by_body(words, bands)
    if len(b) >= 2:
        out.append((b, False))
    return out


def split_words(words, bands, edges):
    """Palabras partidas por una frontera interior, por fila con texto.

    Se normaliza por filas para poder comparar el corte entre tablas de
    tamaños muy distintos con el mismo peso.
    """
    dentro, filas = [], 0
    for b in bands:
        ws = [w for w in words if b[0] - 1 <= (w[1] + w[3]) / 2 <= b[1] + 1]
        if ws:
            filas += 1
            dentro += ws
    if not filas:
        return 0.0
    n = sum(1 for x in edges[1:-1] for w in dentro if w[0] < x - 0.5 < w[2])
    return n / filas


def best_edges(words, bands, vert=None):
    """Elige el reparto de columnas que mejor separa las celdas.

    Ningún método gana siempre: hay tablas con rejilla completa dibujada y
    otras que solo trazan el borde exterior, donde únicamente sirven los
    huecos. En vez de adivinar por tabla, se construyen todas y se comparan.

    El desempate mira primero cuántas columnas quedan SIN UN SOLO DATO. Premiar
    sin más al reparto con más columnas resolvía la infra-segmentación pero
    abría el problema contrario: en la Tabla 220-56, que tiene dos columnas,
    los huecos proponían cuatro —dos de ellas enteramente vacías— y ganaban por
    ser más. Una columna vacía no es información, es un corte inventado.

    A la nota se le descuenta además cuántas PALABRAS parte en dos el reparto.
    `grid_score` mide la fracción de celdas con varios números juntos, así que
    partir de más aumenta el denominador y sube la nota aunque el corte sea
    falso: premia la sobre-segmentación por construcción. En la Tabla 220-42,
    de tres columnas, los huecos proponían cinco —cortando «Parte» del resto
    de su título— y ganaban 0.750 contra 0.719; en la 220-3 proponían cuatro,
    empatadas a 1.000, y se llevaban el desempate por tener más columnas.

    Una palabra partida en dos delata el corte inventado, porque el PDF nunca
    parte una palabra entre dos celdas. Es un descuento pequeño, no un veto:
    un encabezado fusionado cruza fronteras de verdad, y en la 310-104(e) el
    reparto correcto de 12 columnas cruza casi dos palabras por fila sin que
    ninguna sobre. Solo se aplica a los repartos DEDUCIDOS del texto; en los
    dibujados manda la línea, que es la que decide qué está fusionado. Aun así
    compiten por nota, así que un esqueleto dibujado pobre —dos columnas donde
    hay doce— sigue perdiendo.

    El descuento fuerte se lo lleva la columna RALA: la que casi no tiene
    datos. Es lo que delata a la 220-42, donde el corte falso deja una columna
    con «Parte» en 3 de 12 filas y otra con «(%)» en 1 de 12, y lo que
    distingue ese caso del de una columna legítimamente escasa. Una columna
    del todo vacía la sigue cazando `vacias`, que es su forma extrema.
    """
    best, best_key = None, None
    for e, dibujada in column_candidates(words, bands, vert):
        g = build_grid(words, bands, e)
        if not g:
            continue
        ncols = len(e) - 1
        llenado = [sum(1 for row in g if c < len(row) and row[c].strip()) / len(g)
                   for c in range(ncols)]
        vacias = sum(1 for f in llenado if f == 0)
        ralas = sum(1 for f in llenado if f < RALA_MIN)
        # Con holgura: un roce suelto no significa nada —un acento que asoma,
        # una palabra que se derrama— y sin ella el descuento rompía empates
        # que el número de columnas resolvía bien. En la 250-3, de tres
        # columnas, un solo cruce en 20 filas bastaba para que ganara el
        # reparto de dos que funde «Artículo» con «Sección».
        cortadas = (0.0 if dibujada else
                    max(0.0, split_words(words, bands, e) - CORTE_MIN))
        nota = grid_score(g) - RALA_PESO * ralas - CORTE_PESO * cortadas
        key = (round(nota, 3), -vacias, ncols)
        if best_key is None or key > best_key:
            best, best_key = e, key
    return best or []


def column_edges_by_gaps(words, bands):
    """Fronteras de columna por huecos verticales sin tinta.

    Se ignoran las filas que ocupan casi todo el ancho (encabezados que
    abarcan varias columnas, notas): taparían los huecos y fundirían la tabla
    en una sola columna.
    """
    inside = [w for w in words
              if any(b[0] - 1 <= (w[1] + w[3]) / 2 <= b[1] + 1 for b in bands)]
    if not inside:
        return []
    x_min = min(w[0] for w in inside)
    x_max = max(w[2] for w in inside)
    width = x_max - x_min
    if width < 20:
        return []

    by_row = defaultdict(list)
    for w in inside:
        cy = (w[1] + w[3]) / 2
        for i, b in enumerate(bands):
            if b[0] - 1 <= cy <= b[1] + 1:
                by_row[i].append(w)
                break

    res = 1.0
    n = int(width / res) + 2
    ink = [False] * n

    def mark(w):
        a = max(0, int((w[0] - x_min) / res))
        b = min(n - 1, int((w[2] - x_min) / res) + 1)
        for i in range(a, b + 1):
            ink[i] = True

    for i, ws in by_row.items():
        span = max(w[2] for w in ws) - min(w[0] for w in ws)
        if span > 0.9 * width and len(ws) > 6:
            continue                      # fila que cruza toda la tabla
        for w in ws:
            mark(w)

    if not any(ink):
        for ws in by_row.values():
            for w in ws:
                mark(w)

    gaps, run = [], None
    for i, v in enumerate(ink):
        if not v and run is None:
            run = i
        elif v and run is not None:
            if (i - run) * res >= GAP_MIN:
                gaps.append((run * res + x_min, i * res + x_min))
            run = None
    if run is not None and (n - run) * res >= GAP_MIN:
        gaps.append((run * res + x_min, n * res + x_min))

    edges = [x_min - 1]
    for a, b in gaps:
        edges.append((a + b) / 2)
    edges.append(x_max + 1)
    return sorted(set(round(e, 2) for e in edges))


def build_grid(words, bands, edges):
    grid = []
    for b in bands:
        cells = [''] * (len(edges) - 1)
        for w in words:
            cy = (w[1] + w[3]) / 2
            if not (b[0] - 1 <= cy <= b[1] + 1):
                continue
            cx = (w[0] + w[2]) / 2
            # Lo que sobresale por fuera de las fronteras cae en la columna
            # del extremo, en vez de descartarse: un encabezado más ancho que
            # el cuerpo perdía palabras en silencio.
            c = next((c for c in range(len(edges) - 1)
                      if edges[c] <= cx < edges[c + 1]),
                     0 if cx < edges[0] else len(edges) - 2)
            cells[c] = (cells[c] + ' ' + w[4]).strip()
        if any(c.strip() for c in cells):
            grid.append(cells)
    return grid


# ---------------------------------------------------------------- títulos

RE_PAGE_NOISE = re.compile(r'^(?:\d{1,2}/\d{1,2}/\d{4}|SENER|www\.dof\.gob\.mx\S*|\d+/780)$')

# La fuente incrustada del PDF tiene el cmap roto para un puñado de glifos:
# se ven bien al ojo pero PyMuPDF extrae el código Unicode equivocado. Pasa
# con el símbolo de grados, que sale como el dígito cero kannada ("90೦C" en
# vez de "90°C") y con la letra griega fase, que sale como la efe cirílica.
# Mismo arreglo que en build_corpus.py, aplicado en cada punto donde este
# script saca texto del PDF.
GLIFOS_ROTOS = {'೦': '°', 'Ф': 'Φ'}


def fix_glifos(s):
    for malo, bueno in GLIFOS_ROTOS.items():
        if malo in s:
            s = s.replace(malo, bueno)
    return s


def clean_words(page, ymin=-1):
    """Palabras de la página, sin el encabezado/pie repetido del PDF."""
    return [(w[0], w[1], w[2], w[3], fix_glifos(w[4]), w[5], w[6], w[7])
            for w in page.get_text('words')
            if w[1] > ymin and not RE_PAGE_NOISE.match(w[4].strip())]


# Una nota al pie empieza con asterisco o con "NOTA". Lo que sigue en la
# línea de abajo, más pegado que un párrafo normal, es su continuación.
RE_PIE = re.compile(r'^\s*(?:\*+|NOTA\b|Nota\b|\d+\s*[).])')
PIE_GAP = 16.0      # separación máxima para considerar que la línea sigue al pie
PIE_ALTO = 90.0     # hasta dónde se busca por debajo de la rejilla


def marca_superindice(ln):
    """¿La línea abre con un marcador de nota al pie en superíndice?

    La Tabla 220-12 llama a sus notas con letras voladas: «Unidades de
    vivienda_a» arriba y «a Ver 220-14(j)» al pie. Con el marcador en letra no
    hay asterisco ni «NOTA» que reconocer, así que esas dos líneas no se
    recogían con la tabla y build_corpus las leía como texto del artículo: se
    quedaban pegadas al final de la NOTA que va ARRIBA de la tabla, que
    terminaba en «...la instalación considerada. a Ver 220-14(j) b Ver
    220-14(k)».

    El PDF sí lo distingue: deja el marcador en un span propio y más pequeño
    que el texto que le sigue. Eso lo separa del inciso «a) Aparatos...», que
    va en un solo span del tamaño del cuerpo.
    """
    sp = [s for s in ln['spans'] if s['text'].strip()]
    if len(sp) < 2:
        return False
    marca = sp[0]['text'].strip()
    return (len(marca) == 1 and marca.isalnum()
            and sp[0]['size'] < sp[1]['size'] - 0.3)


def footnotes_below(page, ybase):
    """Notas al pie inmediatamente debajo de la rejilla: (textos, y final)."""
    lineas = []
    for blk in page.get_text('dict')['blocks']:
        for ln in blk.get('lines', []):
            txt = fix_glifos(''.join(sp['text'] for sp in ln['spans'])).strip()
            if txt and ln['bbox'][1] > ybase - 2:
                lineas.append((ln['bbox'][1], ln['bbox'][3], txt,
                               marca_superindice(ln)))
    lineas.sort()

    notas, y_fin, prev = [], ybase, ybase
    for y0, y1, txt, superindice in lineas:
        if y0 - prev > PIE_GAP or y0 - ybase > PIE_ALTO:
            break
        if RE_PIE.match(txt) or superindice:
            notas.append(txt)
        elif notas and not RE_CAPTION.match(unaccent(txt)):
            notas[-1] += ' ' + txt        # continuación de la nota anterior
        else:
            break
        y_fin, prev = max(y_fin, y1 + 2), y1
    return notas, y_fin


def contiguous(bands, max_gap=26.0):
    """Recorta la lista de bandas donde la rejilla se interrumpe."""
    if not bands:
        return []
    keep = [bands[0]]
    for b in bands[1:]:
        if b[0] - keep[-1][1] > max_gap:
            break
        keep.append(b)
    return keep


def table_extent(doc, cap, caption_pages):
    """Páginas y bandas que ocupa una tabla, siguiendo su continuación.

    Las tablas largas siguen en la página siguiente SIN repetir el título, así
    que no se pueden localizar solo por sus encabezados: hay que seguir la
    rejilla mientras llegue al pie de la página y la siguiente no arranque con
    un título de tabla distinto.
    """
    out = []
    pno, ytop = cap['page'], cap['y']
    while 1 <= pno <= doc.page_count:
        page = doc[pno - 1]
        # Una tabla termina donde empieza el título de la siguiente, esté
        # donde esté en la página. Sin este corte, las tablas consecutivas de
        # un mismo artículo se funden en una sola: sus rejillas se tocan y no
        # hay hueco vertical que las separe.
        ylimit = page.rect.y1
        for c in caption_pages.get(pno, []):
            if c['id'] != cap['id'] and c['y'] > ytop + 2:
                ylimit = min(ylimit, c['y'] - 2)

        vert, horz = page_rules(page)
        bands = contiguous(row_bands(vert, horz, ytop, ylimit))
        if not bands:
            # Un título al pie de página deja su tabla en la siguiente. Si se
            # abandona aquí, la tabla se pierde entera: le pasaba a 220-55.
            if not out and pno + 1 <= doc.page_count and ytop > page.rect.y1 - 120:
                pno, ytop = pno + 1, -1
                continue
            break
        out.append((pno, bands))

        corte = ylimit < page.rect.y1          # terminó por otro título
        if corte or bands[-1][1] < page.rect.y1 - 45:
            break
        nxt = pno + 1
        if nxt > doc.page_count or len(out) > 14:
            break
        pno, ytop = nxt, -1
    return out


CAPTION_MAX_LINES = 4     # tope de continuación del título


def find_captions(doc):
    """[(pagina, y, id, titulo)] de cada título de tabla del cuerpo.

    El título se toma del BLOQUE de texto completo, no de su primera línea:
    los títulos largos se parten en varias y quedaban cortados a media frase.
    El de la Tabla 310-104(d) terminaba en "..., para" y dejaba fuera "2001 a
    5000 volts" y la aclaración de que la tabla es informativa.

    El PDF agrupa cada título en un bloque propio y deja las celdas en bloques
    aparte, así que el bloque es el límite natural. Aun así se aplica un tope
    de líneas: en la Tabla 225-3 el bloque arrastra contenido de la tabla y sin
    él el título se convertiría en un párrafo entero.
    """
    caps = []
    for pno in range(10, doc.page_count):
        page = doc[pno]
        for blk in page.get_text('dict')['blocks']:
            lines = blk.get('lines', [])
            if not lines:
                continue
            txts = [fix_glifos(''.join(s['text'] for s in ln['spans'])).strip() for ln in lines]
            ys = [round(ln['bbox'][1], 1) for ln in lines]
            # Una línea que comparte su altura con otra es una FILA de tabla,
            # con sus celdas repartidas a lo ancho; la continuación de un
            # título siempre va sola en su renglón. Es lo que separa el título
            # de la Tabla 310-104(d), partido en tres renglones propios, del de
            # la 225-3, cuyo bloque sigue con las celdas de la tabla.
            solo = [sum(1 for y2 in ys if abs(y2 - y) <= 2.0) == 1 for y in ys]

            # El título no siempre abre el bloque, así que se revisan todas sus
            # líneas; la continuación se toma de las siguientes DEL MISMO
            # bloque, que es donde el PDF deja el resto de la frase.
            for i, first in enumerate(txts):
                if not first or len(first) > 260:
                    continue
                m = RE_CAPTION.match(unaccent(first))
                if not m:
                    continue
                tid = re.sub(r'\s+', '', m.group(1))
                title = first[len(first) - len(m.group(2)):].strip() if m.group(2) else ''
                for j in range(i + 1, min(i + CAPTION_MAX_LINES, len(txts))):
                    extra = txts[j]
                    if not extra or not solo[j] or RE_CAPTION.match(unaccent(extra)):
                        break
                    title += ' ' + extra
                title = re.sub(r'\s+', ' ', title).strip()
                informativa = bool(RE_INFORMATIVA.search(title))
                if informativa:
                    title = RE_INFORMATIVA.sub(' ', title).strip()
                caps.append({'page': pno + 1, 'y': lines[i]['bbox'][1],
                             'id': tid, 'title': title,
                             'informativa': informativa})
    return caps


# ------------------------------------------------- correcciones a mano
#
# La reconstrucción automática llegó hasta donde llega. El PDF no va a
# cambiar —es el DOF del 29/11/2012— así que lo que vale al final no es el
# algoritmo sino el JSON: una tabla contrastada a ojo contra el PDF y
# corregida ya no necesita que ningún heurístico acierte con ella.
#
# El problema es que este script se ejecuta en cada publicación y
# sobrescribe data/tablas.json, así que una corrección hecha directamente
# sobre ese archivo se perdería en el siguiente despliegue sin avisar. De
# ahí este archivo aparte: data/tablas_revisadas.json guarda la versión
# corregida de cada tabla y se aplica ENCIMA de lo reconstruido, al final.
#
# Cada entrada lleva la fecha de revisión, y esa marca viaja a la tabla como
# `verificada`: el sitio deja de pedir que se contraste con el PDF y la lista
# de revisión la da por cerrada.

# `regions` entra en la lista porque el recorte también se equivoca: la
# 922-15(a) se llevaba dentro de la tabla dos secciones enteras del artículo
# 922, y la 400-4 dejaba fuera sus quince notas, que acababan pegadas al
# texto de 400-5(c). Corregir dónde termina la tabla es parte de corregirla:
# de aquí salen las zonas que build_corpus recorta del flujo de texto, así
# que la revisión a mano devuelve al artículo lo que no era suyo.
CAMPOS_REVISABLES = ('title', 'cols', 'header_rows', 'intro', 'rows', 'notes',
                     'informativa', 'regions')

# Y alguna tabla no está ahí abajo en absoluto. La norma imprime unas cuantas
# sin «Tabla N» delante —la del inciso 922-17(c), con los cuatro tramos de
# claro y su separación— y el detector de títulos no puede verlas: no hay
# título que detectar. Se quedaban como texto corrido dentro del inciso
# («Longitud del claro (m) Separación (cm) Hasta 45 10 Más de 45 a 60 15…»).
# Estas se dan de alta aquí, y por eso tienen que traer entero lo que a las
# demás les pone la reconstrucción.
CAMPOS_ALTA = ('article', 'pages', 'cols', 'header_rows', 'rows', 'regions')


def tabla_nueva(tid, rev):
    """Tabla que no salió de la reconstrucción: viene entera del JSON."""
    return {
        'id': tid,
        'title': rev.get('title'),
        # Sin número propio no se puede citar, y el sitio no debe inventarle
        # uno: lo que lleva por identificador es el inciso donde está impresa.
        # Pero no todas las de alta llegan así: la 5(A) sí trae «Tabla 5 A.-
        # …» impreso, solo que el recorte automático la fundió con la 5 al no
        # haber salto de página entre ambas. Si la revisión trae título, la
        # norma sí la numeró.
        'sin_numero': not bool(rev.get('title')),
        'informativa': rev.get('informativa', False),
        'article': rev['article'],
        'pages': rev['pages'],
        'page': rev['pages'][0],
        'cols': rev['cols'],
        'header_rows': rev['header_rows'],
        'intro': rev.get('intro', ''),
        'rows': rev['rows'],
        'grid': 'dibujada',
        'notes': rev.get('notes', []),
        'quality': 1.0,
        'regions': rev['regions'],
    }


def encabezado_dudoso(t):
    """Firma del reparto de columnas que se inventa una.

    Cuando el algoritmo mete una columna de más, el encabezado lo delata: en
    la misma fila queda una celda VACÍA junto a un título que abarca varias
    columnas, y el título acaba cubriendo una columna menos de las que le
    tocan. Es lo que pasaba en la 310-15(b)(16), donde COBRE cubría dos de las
    tres columnas de cobre y la de 60 °C colgaba de la celda vacía: cada
    material quedaba con las ampacidades del otro.

    La calidad estimada no ve nada de esto —mide celdas con varios valores
    juntos, y aquí los valores están perfectos—, así que estas tablas salían
    con 1.00 y sin una sola marca.
    """
    for row in t['rows'][:t.get('header_rows', 0)]:
        if (any(not c['t'].strip() for c in row)
                and any(c.get('cs', 1) > 1 for c in row)):
            return True
    return False


def apply_revisiones(tables, path):
    """Aplica data/tablas_revisadas.json sobre las tablas reconstruidas."""
    if not os.path.exists(path):
        return 0
    with open(path, encoding='utf-8') as fh:
        revs = json.load(fh)
    porid = {t['id']: t for t in tables}
    n = 0
    for tid, rev in revs.items():
        t = porid.get(tid)
        if t is None:
            faltan = [k for k in CAMPOS_ALTA if k not in rev]
            if faltan:
                raise SystemExit(
                    'tablas_revisadas.json: la tabla %r no existe en el PDF; '
                    'para darla de alta le faltan %s'
                    % (tid, ', '.join(faltan)))
            t = tabla_nueva(tid, rev)
            tables.append(t)
            porid[tid] = t
        for k in CAMPOS_REVISABLES:
            if k in rev:
                t[k] = rev[k]
        t['verificada'] = rev['verificada']
        # La calidad es la estimación del reparto automático; si la tabla ya
        # se contrastó a ojo, deja de ser una estimación.
        t['quality'] = 1.0
        n += 1
    return n


def main():
    import pymupdf
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'NOM-001-SEDE-2012.pdf'
    out = sys.argv[2] if len(sys.argv) > 2 else 'data'
    os.makedirs(out, exist_ok=True)
    doc = pymupdf.open(pdf)

    # Los números de artículo se sacan del índice del propio PDF y no de
    # corpus.json: así este script puede correr ANTES que build_corpus, que a
    # su vez necesita saber qué zonas de la página ocupa una tabla para no
    # arrastrar su contenido al texto de la sección.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from build_corpus import parse_toc
    pages_txt = [fix_glifos(doc[i].get_text()) for i in range(doc.page_count)]
    art_nums = sorted(parse_toc(pages_txt)[0])

    caps = find_captions(doc)
    # varias páginas repiten el título al continuar la tabla; se conserva la
    # primera aparición y las siguientes se tratan como continuación
    seen, ordered = {}, []
    for c in caps:
        if c['id'] in seen:
            seen[c['id']]['cont'].append(c)
        else:
            c['cont'] = []
            seen[c['id']] = c
            ordered.append(c)

    by_page = defaultdict(list)
    for c in caps:
        by_page[c['page']].append(c)

    tables = []
    for cap in ordered:
        extent = table_extent(doc, cap, by_page)
        if not extent:
            continue

        # El modelo de columnas se calcula sobre TODAS las páginas de la tabla
        # a la vez. Calcularlo por página partiría la misma tabla en rejillas
        # distintas, porque la página del título suele traer solo el
        # encabezado y muy pocas filas de datos.
        # Las columnas se resuelven POR PÁGINA. Un modelo único para toda la
        # tabla no sirve: las coordenadas son relativas a cada página y la del
        # título suele traer solo el encabezado, cuyo trazado no coincide con
        # el del cuerpo. Lo que sí se comparte es el número de columnas.
        art = None
        m = re.match(r'^(\d{3})-', cap['id'])
        if m and int(m.group(1)) in art_nums:
            art = int(m.group(1))

        regions = [{'page': pno, 'y0': (cap['y'] - 4 if pno == cap['page'] else bands[0][0] - 2),
                    'y1': bands[-1][1] + 2, 'id': cap['id'], 'article': art}
                   for pno, bands in extent]

        # Las notas al pie van DEBAJO de la rejilla, fuera del rectángulo que
        # se recorta. Si se dejan ahí, build_corpus las lee como texto corrido
        # y acaban pegadas al párrafo anterior: en 310-60(c)(4) la nota del
        # artículo terminó con nueve "* Consulte 310-60(c)(4)..." seguidos,
        # uno por cada tabla de las páginas siguientes.
        # El título puede quedar al pie de una página y la tabla empezar en la
        # siguiente. Entonces la zona del título no está en ninguna región y
        # sus renglones se cuelan en el texto del artículo: las cuatro líneas
        # del título de la 310-60(c)(78) acabaron dentro de una NOTA del 310.
        if cap['page'] not in [p for p, _ in extent]:
            regions.insert(0, {'page': cap['page'], 'y0': cap['y'] - 4,
                               'y1': doc[cap['page'] - 1].rect.y1,
                               'id': cap['id'], 'article': art})

        # Un título de tabla de varios renglones: los siguientes empiezan en
        # minúscula o con paréntesis, nunca con mayúscula de frase nueva.
        # No sirve cortar donde empieza la rejilla: la detección de filas
        # arranca en el propio título, así que su primera banda cae encima de
        # estos renglones. Se recorren hacia abajo y se para en el primero que
        # no continúa la frase.
        seguidas = []
        for blk in doc[cap['page'] - 1].get_text('dict')['blocks']:
            for ln in blk.get('lines', []):
                if ln['bbox'][1] > cap['y'] + 6:
                    seguidas.append((ln['bbox'][1],
                                     fix_glifos(''.join(sp['text'] for sp in ln['spans'])).strip()))
        cont, prev = [], cap['y']
        for y, txt in sorted(seguidas):
            if not txt or RE_PAGE_NOISE.match(txt):
                continue
            if y - prev > 20 or not (txt[0].islower() or txt[0] == '('):
                break
            cont.append(txt)
            prev = y
        # La continuación del título ya la resuelve find_captions con el
        # bloque de texto del PDF, que agrupa la frase completa y distingue una
        # línea de título de una fila de tabla por su altura. Volver a
        # añadirla aquí la duplicaba: el de la Tabla 220-55 salía con la
        # segunda mitad repetida.
        cont = [c for c in cont if c not in cap['title']]
        if cont:
            cap['title'] = re.sub(
                r'\s+', ' ', cap['title'] + ' ' + ' '.join(cont)).strip()

        pie = []
        porpag = {r['page']: r for r in regions}
        for pno, bands in extent:
            texto, y1 = footnotes_below(doc[pno - 1], bands[-1][1])
            if texto:
                pie += texto
                porpag[pno]['y1'] = max(porpag[pno]['y1'], y1)
        rows, npages, per_page = [], [], []
        for pno, bands in extent:
            page = doc[pno - 1]
            ws = clean_words(page, bands[0][0] - 1)
            if not ws:
                continue
            vert, horz = page_rules(page)
            edges = best_edges(ws, bands, vert)
            if len(edges) < 2:
                continue
            per_page.append((pno, bands, ws, edges, vert, horz))

        if not per_page:
            continue

        # Dos modelos por página: la rejilla dibujada, que trae las fusiones, y
        # la separación por huecos, que es lo único que hay cuando la tabla no
        # dibuja verticales. Gana la rejilla salvo que separe peor las celdas:
        # el criterio anterior —a igual calidad, más columnas gana— era el que
        # inventaba columnas vacías donde el original tenía una celda ancha.
        def modelo(z):
            pno, bands, ws, edges, vert, horz = z
            re_ = rule_edges(vert, bands)
            cel = build_cells(ws, bands, re_, vert, horz)
            pla = flat_cells(build_grid(ws, bands, edges))
            if cel and grid_score(cell_text(cel)) >= grid_score(cell_text(pla)) - 0.02:
                return cel, len(re_) - 1, 'rejilla'
            # Sin verticales dibujadas la tabla se quedaba sin fusiones, y un
            # encabezado que cubre varias columnas salía partido en trozos
            # sueltos: en la 220-55, "Factor de demanda (%)" aparecía como
            # "Factor de" y "demanda (%)" en celdas distintas. Las fusiones
            # también se ven en el texto —una palabra montada sobre la frontera
            # significa que la celda la cruza—, así que se prueba el mismo
            # modelo con las fronteras deducidas de las filas de datos.
            fus = build_cells(ws, bands, edges, vert, horz, solo_cruces=True)
            if (fus and len(edges) - 1 == max((row_width(r) for r in fus), default=0)
                    and grid_score(cell_text(fus)) >= grid_score(cell_text(pla)) - 0.02):
                return fus, len(edges) - 1, 'huecos'
            return pla, len(edges) - 1, 'huecos'

        modelos = {z[0]: modelo(z) for z in per_page}

        # Todas las páginas de una tabla comparten el mismo trazado, así que
        # el ancho de la página mejor reconstruida manda sobre las demás.
        #
        # Se descarta primero lo que quedó mal separado y de lo que sobrevive
        # gana la página MÁS ANCHA. Ordenar solo por calidad no sirve: la
        # página del título trae únicamente el encabezado, no tiene un solo
        # número que pueda quedar mal repartido y por eso puntúa 1.0 siempre;
        # si mandara ella, la tabla entera se publicaría con las columnas del
        # encabezado y las filas de datos se fundirían dentro. Le pasaba a la
        # 922-41 y a la 110-34(a).
        # Gana la más ancha, y a igual ancho la mejor separada. Una página mal
        # extraída no gana por ancha: cuando la separación falla lo que hace es
        # FUNDIR celdas, así que queda más angosta, no más ancha.
        puntos = {z[0]: round(grid_score(cell_text(modelos[z[0]][0])), 3)
                  for z in per_page}
        best_page = max(per_page, key=lambda z: (modelos[z[0]][1], puntos[z[0]]))
        ncols = modelos[best_page[0]][1]
        ref_edges = rule_edges(best_page[4], best_page[1]) \
            if modelos[best_page[0]][2] == 'rejilla' else best_page[3]
        origen = modelos[best_page[0]][2]

        for pno, bands, ws, edges, vert, horz in per_page:
            cel, n, _ = modelos[pno]
            if n != ncols:
                # La página va con otro ancho: se reconstruye con las fronteras
                # de la página de referencia, que en el PDF son las mismas.
                alt = (build_cells(ws, bands, ref_edges, vert, horz)
                       if origen == 'rejilla' else flat_cells(build_grid(ws, bands, ref_edges)))
                if alt and max(row_width(r) for r in alt) == ncols:
                    cel = alt
            if cel:
                rows += cel
                npages.append(pno)
        # las de dentro de la rejilla van primero; después las de debajo
        notes = []
        if not rows:
            continue

        # notas al pie: filas de una sola celda que empiezan con * o NOTA
        body = []
        for row in rows:
            filled = [c for c in row if c['t'].strip()]
            if len(filled) == 1 and RE_NOTE.match(filled[0]['t']):
                notes.append(filled[0]['t'].strip())
            else:
                body.append(row)
        if not body:
            continue
        notes += pie

        ncols = max(row_width(r) for r in body)
        # una fila más angosta que la tabla se completa por la derecha
        for idx, (fila, ocupa) in enumerate(layout(body, ncols)):
            if ocupa < ncols:
                falta = ncols - ocupa
                body[idx].append({'t': '', 'cs': falta} if falta > 1 else {'t': ''})

        # Las líneas de la rejilla a veces trazan separadores donde no hay
        # datos (bordes dobles, subdivisiones del encabezado), lo que deja
        # columnas enteras vacías. Se eliminan para que la tabla publicada
        # tenga las columnas que realmente tiene.
        ocupadas = set()
        for fila, _ in layout(body, ncols):
            for c, col, cs in fila:
                if c['t'].strip():
                    ocupadas.update(range(col, col + cs))
        muertas = [i for i in range(ncols) if i not in ocupadas]
        if muertas and len(muertas) < ncols:
            body, ncols = drop_columns(body, ncols, muertas)

        # La primera fila fusionada a todo lo ancho no es un encabezado: es la
        # frase que introduce la tabla ("Para temperaturas ambiente distintas
        # de 30 °C, multiplique..."). Repartida en celdas quedaba como títulos
        # de columna sin sentido, así que sube a subtítulo de la tabla.
        intro = ''
        while (len(body) > 1 and len(body[0]) == 1
               and body[0][0].get('cs', 1) == ncols
               and len(body[0][0]['t'].split()) >= 6):
            intro = (intro + ' ' + body.pop(0)[0]['t']).strip()

        # el encabezado son las filas iniciales sin ningún número suelto.
        # Un número puede arrastrar pegada la letra volada que llama a una
        # nota al pie ("39b" en la 220-12): sigue siendo un dato, y sin
        # admitirla la primera fila de la tabla —Bancos— se publicaba como
        # segundo renglón de encabezado, en negritas y con estilo de título.
        head = 0
        for r in body[:4]:
            cells = [c['t'] for c in r if c['t'].strip()]
            if cells and not any(re.fullmatch(r'[\d.,/\-]+[a-z]?', c.strip()) for c in cells):
                head += 1
            else:
                break

        tables.append({
            'id': cap['id'],
            'title': cap['title'],
            'informativa': cap.get('informativa', False),
            'article': art,
            'pages': npages or [cap['page']],
            'page': cap['page'],
            'cols': ncols,
            'header_rows': head,
            'intro': intro,
            # Cada celda es {t: texto, cs: colspan, rs: rowspan}; cs y rs se
            # omiten cuando valen 1, que es la mayoría.
            'rows': body,
            'grid': origen,
            'notes': notes,
            # Calidad estimada de la separación en celdas. Se publica junto a
            # la tabla para poder avisar al lector cuando conviene contrastar
            # con el PDF, en vez de presentar todo con la misma confianza.
            'quality': round(grid_score(cell_text(body)), 3),
            'regions': regions,
        })

    revisadas = apply_revisiones(tables, os.path.join(out, 'tablas_revisadas.json'))
    # Las dadas de alta a mano se añaden al final; el orden del archivo es el
    # del documento y de él salen los listados del sitio.
    tables.sort(key=lambda t: (t['regions'][0]['page'], t['regions'][0]['y0']))
    for t in tables:
        t['encabezado_dudoso'] = encabezado_dudoso(t)

    json.dump(tables, open(os.path.join(out, 'tablas.json'), 'w'),
              ensure_ascii=False, indent=1)

    # Zonas de página ocupadas por tablas. build_corpus las salta para que el
    # contenido de una tabla no reaparezca como párrafo corrido dentro de la
    # sección, que es como se veía la 310-15(b)(2)(a): 60 números seguidos.
    regs = [r for t in tables for r in t['regions']]
    json.dump(regs, open(os.path.join(out, 'tablas_regiones.json'), 'w'),
              ensure_ascii=False, indent=1)

    q = [t['quality'] for t in tables]
    revisar = sorted((t for t in tables
                      if t['quality'] < 0.80 and not t.get('verificada')),
                     key=lambda t: t['quality'])
    json.dump([{'id': t['id'], 'quality': t['quality'], 'cols': t['cols'],
                'rows': len(t['rows']), 'pages': t['pages'], 'title': t['title']}
               for t in revisar],
              open(os.path.join(out, 'tablas_por_revisar.json'), 'w'),
              ensure_ascii=False, indent=1)

    print('Tablas reconstruidas : %d' % len(tables))
    print('  ligadas a artículo : %d' % sum(1 for t in tables if t['article']))
    print('  en varias páginas  : %d' % sum(1 for t in tables if len(t['pages']) > 1))
    print('  filas totales      : %d' % sum(len(t['rows']) for t in tables))
    print('  columnas: mín %d · mediana %d · máx %d' % (
        min(t['cols'] for t in tables),
        sorted(t['cols'] for t in tables)[len(tables) // 2],
        max(t['cols'] for t in tables)))
    print()
    fus = sum(1 for t in tables for r in t['rows'] for c in r
              if c.get('cs', 1) > 1 or c.get('rs', 1) > 1)
    print('  celdas fusionadas  : %d' % fus)
    print('  con rejilla dibujada: %d · por huecos: %d' % (
        sum(1 for t in tables if t['grid'] == 'rejilla'),
        sum(1 for t in tables if t['grid'] == 'huecos')))
    print('  con frase de intro : %d' % sum(1 for t in tables if t['intro']))
    print()
    print('  contrastadas a ojo  : %d  -> data/tablas_revisadas.json' % revisadas)
    print()
    print('Calidad de la separación en celdas:')
    print('  media              : %.3f' % (sum(q) / len(q)))
    print('  >= 0.95 (fiables)  : %d' % sum(1 for x in q if x >= 0.95))
    print('  0.80 - 0.95        : %d' % sum(1 for x in q if 0.80 <= x < 0.95))
    print('  <  0.80 (revisar)  : %d  -> data/tablas_por_revisar.json' % len(revisar))


if __name__ == '__main__':
    main()
