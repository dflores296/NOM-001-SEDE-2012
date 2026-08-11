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


def column_candidates(words, bands, vert=None):
    """Conjuntos de fronteras a evaluar: la rejilla dibujada y los huecos."""
    out = []
    if vert:
        e = edges_from_rules(vert, bands)
        if len(e) >= 2:
            out.append(e)
    g = column_edges_by_gaps(words, bands)
    if len(g) >= 2:
        out.append(g)
    return out


def best_edges(words, bands, vert=None):
    """Elige el reparto de columnas que mejor separa las celdas.

    Ningún método gana siempre: hay tablas con rejilla completa dibujada y
    otras que solo trazan el borde exterior, donde únicamente sirven los
    huecos. En vez de adivinar por tabla, se construyen ambas y se compara el
    resultado; a igualdad de calidad gana la que produce más columnas, porque
    una tabla infra-segmentada esconde datos dentro de una celda.
    """
    best, best_key = None, None
    for e in column_candidates(words, bands, vert):
        g = build_grid(words, bands, e)
        if not g:
            continue
        key = (round(grid_score(g), 3), len(e) - 1)
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
            for c in range(len(edges) - 1):
                if edges[c] <= cx < edges[c + 1]:
                    cells[c] = (cells[c] + ' ' + w[4]).strip()
                    break
        if any(c.strip() for c in cells):
            grid.append(cells)
    return grid


# ---------------------------------------------------------------- títulos

RE_PAGE_NOISE = re.compile(r'^(?:\d{1,2}/\d{1,2}/\d{4}|SENER|www\.dof\.gob\.mx\S*|\d+/780)$')


def clean_words(page, ymin=-1):
    """Palabras de la página, sin el encabezado/pie repetido del PDF."""
    return [w for w in page.get_text('words')
            if w[1] > ymin and not RE_PAGE_NOISE.match(w[4].strip())]


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


def find_captions(doc):
    """[(pagina, y, id, titulo)] de cada título de tabla del cuerpo."""
    caps = []
    for pno in range(10, doc.page_count):
        page = doc[pno]
        for blk in page.get_text('dict')['blocks']:
            for line in blk.get('lines', []):
                txt = ''.join(s['text'] for s in line['spans']).strip()
                if not txt or len(txt) > 260:
                    continue
                m = RE_CAPTION.match(unaccent(txt))
                if not m:
                    continue
                tid = re.sub(r'\s+', '', m.group(1))
                title = txt[len(txt) - len(m.group(2)):].strip() if m.group(2) else ''
                caps.append({'page': pno + 1, 'y': line['bbox'][1],
                             'id': tid, 'title': re.sub(r'\s+', ' ', title)})
    return caps


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
    pages_txt = [doc[i].get_text() for i in range(doc.page_count)]
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
        regions = [{'page': pno, 'y0': (cap['y'] - 4 if pno == cap['page'] else bands[0][0] - 2),
                    'y1': bands[-1][1] + 2, 'id': cap['id']}
                   for pno, bands in extent]
        grid, npages, per_page = [], [], []
        for pno, bands in extent:
            page = doc[pno - 1]
            ws = clean_words(page, bands[0][0] - 1)
            if not ws:
                continue
            vert, _ = page_rules(page)
            edges = best_edges(ws, bands, vert)
            if len(edges) < 2:
                continue
            per_page.append((pno, bands, ws, edges))

        if not per_page:
            continue

        # Todas las páginas de una tabla comparten el mismo trazado, así que
        # las fronteras de la página mejor reconstruida sirven para las demás.
        # Se elige por CALIDAD, no por número de filas: si se votara por filas,
        # la página más larga impondría su resultado aunque se haya extraído
        # mal, que es lo que pasaba con la tabla de ampacidades 310-15(b)(16).
        ref = max(per_page,
                  key=lambda z: (round(grid_score(build_grid(z[2], z[1], z[3])), 3),
                                 len(z[3]) - 1))[3]

        for pno, bands, ws, edges in per_page:
            own = build_grid(ws, bands, edges)
            alt = build_grid(ws, bands, ref)
            g = alt if (grid_score(alt), len(ref)) > (grid_score(own), len(edges)) else own
            if g:
                grid += g
                npages.append(pno)
        notes = []
        if not grid:
            continue

        # notas al pie: filas de una sola celda que empiezan con * o NOTA
        body = []
        for row in grid:
            filled = [c for c in row if c.strip()]
            if len(filled) == 1 and RE_NOTE.match(filled[0]):
                notes.append(filled[0].strip())
            else:
                body.append(row)
        if not body:
            continue

        ncols = max(len(r) for r in body)
        body = [r + [''] * (ncols - len(r)) for r in body]

        # Las líneas de la rejilla a veces trazan separadores donde no hay
        # datos (bordes dobles, subdivisiones del encabezado), lo que deja
        # columnas enteras vacías. Se eliminan para que la tabla publicada
        # tenga las columnas que realmente tiene.
        used = [i for i in range(ncols) if any(r[i].strip() for r in body)]
        if used and len(used) < ncols:
            body = [[r[i] for i in used] for r in body]
            ncols = len(used)

        art = None
        m = re.match(r'^(\d{3})-', cap['id'])
        if m and int(m.group(1)) in art_nums:
            art = int(m.group(1))

        # el encabezado son las filas iniciales sin ningún número suelto
        head = 0
        for r in body[:4]:
            cells = [c for c in r if c.strip()]
            if cells and not any(re.fullmatch(r'[\d.,/\-]+', c.strip()) for c in cells):
                head += 1
            else:
                break

        tables.append({
            'id': cap['id'],
            'title': cap['title'],
            'article': art,
            'pages': npages or [cap['page']],
            'page': cap['page'],
            'cols': ncols,
            'header_rows': head,
            'rows': body,
            'notes': notes,
            # Calidad estimada de la separación en celdas. Se publica junto a
            # la tabla para poder avisar al lector cuando conviene contrastar
            # con el PDF, en vez de presentar todo con la misma confianza.
            'quality': round(grid_score(body), 3),
            'regions': regions,
        })

    json.dump(tables, open(os.path.join(out, 'tablas.json'), 'w'),
              ensure_ascii=False, indent=1)

    # Zonas de página ocupadas por tablas. build_corpus las salta para que el
    # contenido de una tabla no reaparezca como párrafo corrido dentro de la
    # sección, que es como se veía la 310-15(b)(2)(a): 60 números seguidos.
    regs = [r for t in tables for r in t['regions']]
    json.dump(regs, open(os.path.join(out, 'tablas_regiones.json'), 'w'),
              ensure_ascii=False, indent=1)

    q = [t['quality'] for t in tables]
    revisar = sorted((t for t in tables if t['quality'] < 0.80),
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
    print('Calidad de la separación en celdas:')
    print('  media              : %.3f' % (sum(q) / len(q)))
    print('  >= 0.95 (fiables)  : %d' % sum(1 for x in q if x >= 0.95))
    print('  0.80 - 0.95        : %d' % sum(1 for x in q if 0.80 <= x < 0.95))
    print('  <  0.80 (revisar)  : %d  -> data/tablas_por_revisar.json' % len(revisar))


if __name__ == '__main__':
    main()
