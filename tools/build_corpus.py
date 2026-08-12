#!/usr/bin/env python3
"""
Fase 1 — Construye el corpus estructurado de la NOM-001-SEDE-2012 desde el PDF.

    pip install pymupdf
    python3 tools/build_corpus.py NOM-001-SEDE-2012.pdf data/

Genera en el directorio de salida:
    corpus.json        estructura completa (capítulos → artículos → secciones → incisos)
    definiciones.json  glosario del Artículo 100
    validacion.json    métricas de cobertura del parseo

ID canónico: el mismo que usa la norma para citarse a sí misma, p.ej. 250-32(a)(1).
Ese identificador es a la vez la URL, el ancla del enlace y la clave del grafo
de referencias cruzadas de la Fase 2.

Nota sobre acentos: los encabezados aparecen como "ARTICULO" (sin acento) 151
veces y como "ARTÍCULO" (con acento) 2 veces -- artículos 250 y 555. Todo
emparejamiento normaliza acentos pero CONSERVA mayúsculas, que es lo que
distingue el encabezado "ARTICULO 250" de la referencia en prosa "el Artículo 250".
"""
import itertools, json, os, re, sys, unicodedata
from collections import OrderedDict

# ------------------------------------------------------------------ utilidades

def unaccent(s):
    """Quita acentos conservando mayúsculas/minúsculas."""
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


# La fuente incrustada del PDF tiene el cmap roto para un puñado de glifos:
# se ven bien al ojo pero PyMuPDF extrae el código Unicode equivocado. Pasa
# con el símbolo de grados, que sale como el dígito cero kannada ("165 ೦C"
# en vez de "165 °C", 24 veces en el documento) y con la letra griega fase,
# que sale como la efe cirílica ("1Ф - 3 Ф" en vez de "1Φ - 3Φ", en 430-83).
# Se corrige en la extracción para que ningún camino del parser vuelva a
# dejarlo pasar.
GLIFOS_ROTOS = {'೦': '°', 'Ф': 'Φ'}


def fix_glifos(s):
    for malo, bueno in GLIFOS_ROTOS.items():
        if malo in s:
            s = s.replace(malo, bueno)
    return s

NOISE = re.compile(
    r'^[ \t]*(?:\d{1,2}/\d{1,2}/\d{4}|SENER|www\.dof\.gob\.mx\S*|\d+/780)[ \t]*$', re.M)

def clean_page(t):
    return NOISE.sub('', t)

# ------------------------------------------------------------------ patrones
# Todos anclados a inicio de línea. Se evalúan sobre el texto SIN acentos
# pero conservando mayúsculas.

RE_ARTICLE = re.compile(r'^ARTICULO\s+(\d{3})\s*$', re.M)
RE_PART    = re.compile(r'^([A-M])\.\s+([0-9A-ZÁÉÍÓÚÑ].{0,110})$')
RE_NOTE    = re.compile(r'^(NOTA[^:]{0,40}):\s*(.*)$')
RE_EXC     = re.compile(r'^(Excepci[oó]n[^:]{0,60}):\s*(.*)$')
RE_SUB_A   = re.compile(r'^([a-z])\)\s+(.*)$')          # a)
RE_SUB_N   = re.compile(r'^\((\d{1,2})\)\s+(.*)$')      # (1)
RE_SUB_P   = re.compile(r'^(\d{1,2})\)\s+(.*)$')        # 1)  sin paréntesis inicial
RE_SUB_L   = re.compile(r'^([a-z])\.\s+(.*)$')          # a.

# Dentro de una sección de definiciones, cada término abre línea propia y sus
# continuaciones siguen en minúscula. Sin esto, todas las definiciones de la
# sección se funden en un solo párrafo corrido e ilegible.
RE_DEF = re.compile(r'^([0-9A-ZÁÉÍÓÚÑ][^.:]{2,95})[.:]\s+(\S.*)$')
RE_DEF_TITLE = re.compile(r'^Definicion')
RE_REF     = re.compile(r'\b(\d{3}-\d{1,3}(?:\([a-z0-9]{1,3}\))*)')
RE_TBLREF  = re.compile(r'Tabla\s+(\d{3}-[\w().\-]+|\d{1,2}[A-Z]?(?:\([A-Z]\))?)')

def sec_re(num):
    """Encabezado de sección del artículo `num`: '210-8. Título.'

    La norma es inconsistente en el separador y hay que aceptar las cuatro
    formas que usa:
        '210-8. Protección'    punto y espacio  (lo normal)
        '384-1 Alcance.'       sin punto        (arts. 384, 506, 522)
        '701-1.Alcance.'       sin espacio      (art. 701)
        '513-10.- Equipo...'   punto y guion    (art. 513, una sola vez)
    Para no confundir un encabezado con una referencia cruzada al inicio de
    una línea de texto corrido, se exige que el título arranque en mayúscula.
    """
    return re.compile(r'^(%d-\d{1,3})(?:\.-\s*|\.\s*|\s+)([0-9A-ZÁÉÍÓÚÑ].*)$' % num)


# ------------------------------------------------------------------ carga

def load_pages(pdf):
    import pymupdf
    doc = pymupdf.open(pdf)
    return [fix_glifos(doc[i].get_text()) for i in range(doc.page_count)]


# Marcador de imagen dentro del flujo de líneas. Las fórmulas de la norma están
# embebidas como imágenes, no como texto, así que hay que insertarlas en el
# lugar exacto donde aparecen o se pierden: en 310-15(b)(2) la ecuación del
# factor de corrección desaparecía y el texto saltaba de "usando la siguiente
# ecuación:" directo a la tabla.
IMG_MARK = '\x00IMG:'
# Marca de posición de una tabla dentro del flujo de texto. Va por el mismo
# camino que las imágenes: el parser la ve pasar y cuelga la tabla del inciso
# vigente, que es donde la norma la imprime.
TBL_MARK = '\x00TBL:'

# Pie de figura: "Figura 310-60.- Dimensiones de instalación de cables...".
# Siempre empieza la línea; una cita del cuerpo va dentro de la frase
# ("...como se indica en la Figura 310-60") y no la hace coincidir.
RE_FIGCAP = re.compile(r'^Figura\s+\d{3}-\d{1,3}\s*[.\-]')


def extract_images(pdf, img_dir):
    """Guarda las imágenes del PDF y devuelve [(pagina, y, archivo, w, h)]."""
    import pymupdf
    doc = pymupdf.open(pdf)
    os.makedirs(img_dir, exist_ok=True)
    out, seen = [], {}
    for pno in range(doc.page_count):
        page = doc[pno]
        for info in page.get_images(full=True):
            xref = info[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            name = 'fig-%d.png' % xref
            if xref not in seen:
                pix = pymupdf.Pixmap(doc, xref)
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                pix.save(os.path.join(img_dir, name))
                seen[xref] = (pix.width, pix.height)
            w, h = seen[xref]
            for r in rects:
                out.append((pno + 1, r.y0, name, round(r.width), round(r.height)))
    return out


# Un encabezado nunca se omite, aunque caiga dentro de una zona de tabla: el
# alto detectado de una tabla puede pasarse de largo y tragarse la sección que
# viene justo debajo. Sin esta salvaguarda desaparecían 110-36, 210-3, 550-32,
# 922-16 y 922-17.
RE_KEEP = re.compile(
    r'^(?:ARTICULO\s+\d{3}|[A-M]\.\s+[0-9A-ZÁÉÍÓÚÑ]|'
    r'\d{3}-\d{1,3}(?:\.\s*|\s+)[0-9A-ZÁÉÍÓÚÑ])')


def build_linemap(pages, pdf=None, skip=None, images=None, marcas=None):
    """Devuelve (lineas, pagina_de_cada_linea) del documento completo.

    `skip` son zonas [(pagina, y0, y1)] que se omiten: las ocupa una tabla, y
    su texto plano es una ristra de números sin estructura que, si se deja,
    reaparece como un párrafo ilegible dentro de la sección.
    """
    import pymupdf
    doc = pymupdf.open(pdf) if pdf else None
    skip = skip or {}
    imgs = {}
    for pno, y, name, w, h in (images or []):
        imgs.setdefault(pno, []).append((y, name, w, h))
    tbls = {}
    for pno, y, art, tid in (marcas or []):
        tbls.setdefault(pno, []).append((y, art, tid))

    lines, pageno = [], []
    for pno in range(1, len(pages) + 1):
        items = []
        if doc is not None:
            for blk in doc[pno - 1].get_text('dict')['blocks']:
                for ln in blk.get('lines', []):
                    txt = fix_glifos(''.join(sp['text'] for sp in ln['spans']))
                    items.append((ln['bbox'][1], txt))
        else:
            items = [(0, t) for t in pages[pno - 1].split('\n')]
        for y, name, w, h in imgs.get(pno, []):
            items.append((y, '%s%s:%d:%d' % (IMG_MARK, name, w, h)))
        # justo por encima de su primera línea, para que caiga en el nodo que
        # la precede y no en el siguiente
        for y, art, tid in tbls.get(pno, []):
            items.append((y - 0.01, '%s%s|%s' % (TBL_MARK, art or 0, tid)))
        items.sort(key=lambda z: z[0])

        zonas = skip.get(pno, [])
        for y, txt in items:
            if (not txt.startswith(IMG_MARK) and not txt.startswith(TBL_MARK)
                    and not RE_KEEP.match(unaccent(txt.strip()))
                    and any(a <= y <= b for a, b in zonas)):
                continue
            if NOISE.match(txt.strip()):
                continue
            lines.append(txt.rstrip())
            pageno.append(pno)
    return lines, pageno


# ------------------------------------------------------------------ índice (TOC)

def parse_toc(pages):
    txt = clean_page(''.join(pages[1:9]))
    start = txt.find('INDICE DEL CONTENIDO')
    txt = txt[start:] if start >= 0 else txt
    end = txt.find('INTRODUCCION\n')
    if end > 2000:
        txt = txt[:end]

    toc, chapters, titulos = OrderedDict(), OrderedDict(), OrderedDict()
    cur = None
    lines = [l.rstrip() for l in txt.split('\n')]
    for i, ln in enumerate(lines):
        u = unaccent(ln).strip()
        m = re.match(r'^TITULO\s+(\d+)\.?\s*(.*)$', u)
        if m:
            t = m.group(2).strip() or next(
                (x.strip() for x in lines[i+1:i+3] if x.strip()), '')
            titulos[int(m.group(1))] = t
            continue
        m = re.match(r'^CAPITULO\s+(\d+)\.?\s*$', u)
        if m:
            cur = int(m.group(1))
            chapters[cur] = next((x.strip() for x in lines[i+1:i+3] if x.strip()), '')
            continue
        m = re.match(r'^\s*Art\S*culo\s+(\d{3})\s+(.*)$', ln)
        if m:
            num, title = int(m.group(1)), m.group(2).strip()
            nxt = lines[i+1].strip() if i + 1 < len(lines) else ''
            if nxt and not re.match(r'^(Art\S*culo|CAPITULO|TITULO|Tabla|APENDICE)',
                                    unaccent(nxt)):
                title += ' ' + nxt
            toc[num] = {'title': re.sub(r'\s+', ' ', title).strip(), 'chapter': cur}
    return toc, chapters, titulos


# ------------------------------------------------------------------ artículos

def find_articles(lines, pageno, toc):
    """Localiza el índice de línea donde arranca cada artículo (cuerpo normativo)."""
    starts = {}
    for i, ln in enumerate(lines):
        if pageno[i] <= 9:
            continue
        u = unaccent(ln).strip()
        m = re.match(r'^ARTICULO\s+(\d{3})\s*$', u)
        if m:
            n = int(m.group(1))
            if n in toc and n not in starts:
                starts[n] = i
    return starts


def flush(buf):
    return re.sub(r'\s+', ' ', ' '.join(buf)).strip()


def parse_article(num, lines, pageno, lo, hi):
    """Parsea un artículo devolviendo partes, secciones e incisos anidados."""
    RE_SEC = sec_re(num)
    art = {'parts': [], 'sections': []}
    cur_part = None
    sec = None          # sección actual
    stack = []          # pila de incisos anidados
    buf = []            # acumulador de texto libre
    target = None       # dónde va `buf`
    last_sec = 0        # nº de la última sección aceptada (control de monotonía)
    # Notas y excepciones se guardan en listas separadas, pero en la norma se
    # intercalan y su orden importa: una excepción que en el documento precede
    # a una nota no puede mostrarse después. `seq` conserva el orden original.
    seq = itertools.count()
    # Nota o excepción vigente y el tipo de marcador de SU lista. Una nota que
    # termina en dos puntos suele continuar con una enumeración que le
    # pertenece: en 310-15(b) los "(1)(2)(3)" son los factores que enumera la
    # NOTA, no incisos del artículo. Meterlos al árbol desplazaba los "1)2)3)"
    # reales, y "Factores de corrección" acababa en 310-15(b)(3)(2) en vez de
    # en 310-15(b)(2).
    annot = [None, None]
    # última figura vista, para poder engancharle su leyenda
    ultima_fig = [None]

    def commit():
        nonlocal buf
        if buf and target is not None:
            txt = flush(buf)
            if txt:
                target['text'] = (target.get('text', '') + ' ' + txt).strip()
        buf = []

    def rank(kind, label):
        return int(label) if kind in ('num', 'paren') else ord(label)

    def new_sub(label, kind, title_text):
        """Crea un inciso al nivel que corresponde y lo engancha al padre.

        La profundidad NO puede deducirse del tipo de marcador, porque la norma
        no lo usa de forma consistente. En 110-14(c) el orden es
        'c) → a. → (1)(2)', mientras que en otros artículos es
        'c) → (1) → a.'. Con niveles fijos, los '(1)' de 110-14 se colgaban de
        'c)' en lugar de 'a.', chocaban entre sí y producían ids duplicados.

        Se infiere de la secuencia: un marcador cuyo rótulo continúa a otro del
        mismo tipo ya abierto es su hermano; cualquier otro abre una lista nueva
        anidada bajo el inciso vigente. Así 'b.' cierra el bloque de 'a.' y sus
        '(1)(2)' reinician correctamente dentro de 'b.'.
        """
        nonlocal target
        parent = None
        for i in range(len(stack) - 1, -1, -1):
            e = stack[i]
            if e['kind'] != kind:
                continue
            if rank(kind, label) > rank(kind, e['label']):
                del stack[i:]                       # hermano: cierra lo anidado
            parent = stack[-1]['node'] if stack else sec
            break
        if parent is None:
            parent = stack[-1]['node'] if stack else sec
        if parent is None:
            return False
        wrap = {'alpha': '(%s)', 'num': '(%s)', 'paren': '(%s)', 'letter': '%s.'}[kind]
        node = {'id': parent['id'] + (wrap % label),
                'label': label, 'kind': kind, 'level': len(stack) + 1, 'text': '',
                'children': [], 'notes': [], 'exceptions': []}
        # el título va embebido: "a) Circuitos de menos de 50 volts. Un conductor..."
        mt = re.match(r'^([^.]{3,90})\.\s+(.*)$', title_text)
        if mt and mt.group(1)[0].isupper():
            node['title'] = mt.group(1).strip()
            node['text'] = mt.group(2).strip()
        else:
            node['text'] = title_text.strip()
        parent.setdefault('children', []).append(node)
        stack.append({'kind': kind, 'label': label, 'node': node})
        target = node
        return True

    for i in range(lo, hi):
        raw = lines[i]
        ln = raw.strip()
        if not ln:
            continue
        u = unaccent(ln)

        # --- tabla: se cuelga del nodo vigente, igual que una figura
        if ln.startswith(TBL_MARK):
            art_tab, tid = ln[len(TBL_MARK):].split('|', 1)
            owner = stack[-1]['node'] if stack else sec
            # Las tablas del Capítulo 10 caen dentro del rango de líneas del
            # último artículo del documento, pero no le pertenecen: se dejan
            # sin anclar y se publican en su propia página.
            if owner is not None and int(art_tab) == num:
                owner.setdefault('tables', []).append({'id': tid, 'seq': next(seq)})
            continue

        # --- imagen (fórmula o figura): se cuelga del nodo vigente
        if ln.startswith(IMG_MARK):
            name, w, h = ln[len(IMG_MARK):].rsplit(':', 2)
            owner = stack[-1]['node'] if stack else sec
            if owner is not None:
                fig = {'src': name, 'w': int(w), 'h': int(h),
                       'page': pageno[i], 'seq': next(seq)}
                owner.setdefault('figures', []).append(fig)
                ultima_fig[0] = fig
            continue

        # --- leyenda de una figura: "Figura 310-60.- Dimensiones de..."
        #
        # Va debajo de su imagen y describe lo que se ve, no es texto
        # normativo. Como párrafo se pegaba a la nota anterior y la
        # ensuciaba: en 310-60(c)(4) el pie de la Figura 310-60 quedó dentro
        # de la NOTA sobre pérdidas dieléctricas, que trata de otra cosa.
        if ultima_fig[0] is not None and RE_FIGCAP.match(u):
            ultima_fig[0]['caption'] = re.sub(r'\s+', ' ', ln).strip()
            continue
        if ultima_fig[0] is not None and ultima_fig[0].get('caption'):
            # La leyenda ocupa dos renglones más veces de las que parece
            # ("Figura 310-60.- Dimensiones de instalación de cables / para
            # uso con las Tablas..."). El segundo empieza en minúscula, que
            # es lo que distingue una línea partida de una frase nueva.
            if ln[:1].islower():
                ultima_fig[0]['caption'] += ' ' + re.sub(r'\s+', ' ', ln).strip()
                continue
            ultima_fig[0] = None

        # --- encabezado de sección: 210-8. Título.
        m = RE_SEC.match(u)
        if m:
            # Dentro de un artículo las secciones son estrictamente crecientes.
            # Sin esta comprobación, una referencia cruzada que cae al inicio de
            # una línea por el corte de párrafo se confunde con un encabezado:
            # en 220-14(j) la frase "...de alumbrado general del 220-12. No se
            # deben exigir cálculos..." parte justo antes de "220-12.".
            n_sec = int(m.group(1).split('-')[1])
            if n_sec <= last_sec:
                buf.append(ln)
                continue
            last_sec = n_sec
            commit()
            annot[0] = annot[1] = None
            sid = m.group(1)
            rest = ln[len(m.group(1)) + 1:].lstrip()
            mt = re.match(r'^([^.]{2,120})\.\s*(.*)$', rest)
            title, body = (mt.group(1).strip(), mt.group(2).strip()) if mt \
                else (rest.strip(), '')
            sec = {'id': sid, 'title': title, 'part': cur_part,
                   'page': pageno[i], 'text': body,
                   'children': [], 'notes': [], 'exceptions': []}
            art['sections'].append(sec)
            stack = []
            target = sec
            continue

        # --- encabezado de parte: A. Generalidades
        m = RE_PART.match(u)
        if m and len(ln) < 120 and not RE_SEC.match(u):
            commit()
            cur_part = m.group(1)
            title = ln[len(m.group(1)) + 1:].strip()
            if not any(p['letter'] == cur_part for p in art['parts']):
                art['parts'].append({'letter': cur_part, 'title': title,
                                     'page': pageno[i]})
            sec, stack, target = sec, [], target
            continue

        # --- NOTA  (las líneas siguientes son continuación de la nota)
        m = RE_NOTE.match(u)
        if m:
            commit()
            owner = stack[-1]['node'] if stack else sec
            if owner is not None:
                node = {'label': ln.split(':', 1)[0].strip(),
                        'text': ln.split(':', 1)[1].strip(),
                        'seq': next(seq)}
                owner.setdefault('notes', []).append(node)
                target = node
                annot[0], annot[1] = node, None
            continue

        # --- Excepción (idem: la continuación pertenece a la excepción)
        m = RE_EXC.match(u)
        if m:
            commit()
            owner = stack[-1]['node'] if stack else sec
            if owner is not None:
                node = {'label': ln.split(':', 1)[0].strip(),
                        'text': ln.split(':', 1)[1].strip(),
                        'seq': next(seq)}
                owner.setdefault('exceptions', []).append(node)
                target = node
                annot[0], annot[1] = node, None
            continue

        # --- término de una sección de definiciones
        if (sec is not None and not stack
                and RE_DEF_TITLE.match(unaccent(sec.get('title', '')))):
            m = RE_DEF.match(ln)
            if m and not RE_NOTE.match(u) and not RE_EXC.match(u):
                commit()
                node = {'term': m.group(1).strip(), 'text': m.group(2).strip()}
                sec.setdefault('definitions', []).append(node)
                target = node
                continue

        # --- incisos
        #     'N)' y '(N)' son el mismo nivel con distinta tipografía: la norma
        #     escribe 1 509 incisos de la primera forma y 2 765 de la segunda.
        #     Reconocer solo una dejaba la otra como texto corrido dentro del
        #     inciso anterior, que es lo que rompía la estructura de 310-15.
        for rx, kind in ((RE_SUB_A, 'alpha'), (RE_SUB_N, 'paren'),
                         (RE_SUB_P, 'num'), (RE_SUB_L, 'letter')):
            m = rx.match(u)
            if m:
                break
        else:
            m = None
        if m and sec is not None:
            # Mientras la enumeración conserve el mismo tipo de marcador con
            # que arrancó, sigue perteneciendo a la nota; un marcador de otro
            # tipo indica que la nota terminó y vuelve a mandar la estructura.
            # Solo se considera que la lista pertenece a la nota si la nota
            # ANUNCIA una enumeración, es decir si termina en dos puntos
            # ("...uno o más de los siguientes factores:"). Sin esa condición
            # la nota se tragaba los incisos que simplemente venían después:
            # en 310-15(a), "2) Selección de la ampacidad" es hermano de
            # "1) Tablas", no un elemento de la NOTA que los separa.
            # El volcado va ANTES de mirar los dos puntos: la nota puede
            # ocupar varias líneas y su texto no está completo hasta aquí.
            commit()
            if (annot[0] is not None
                    and annot[0].get('text', '').rstrip().endswith(':')
                    and (annot[1] is None or annot[1] == kind)):
                annot[1] = kind
                annot[0].setdefault('items', []).append(
                    {'label': m.group(1), 'text': ln[m.end(1) + 1:].strip()})
                target = annot[0]['items'][-1]
                continue
            annot[0] = annot[1] = None
            if new_sub(m.group(1), kind, ln[m.end(1) + 1:].strip()):
                continue

        # --- texto corrido
        buf.append(ln)

    commit()
    return art


# ------------------------------------------------------------------ definiciones

def parse_definitions(lines, pageno, lo, hi):
    defs, cur_part, cur = [], None, None
    for i in range(lo, hi):
        ln = lines[i].strip()
        if not ln:
            continue
        u = unaccent(ln)
        m = RE_PART.match(u)
        if m and len(ln) < 120:
            cur_part = m.group(1)
            cur = None
            continue
        m = re.match(r'^([A-ZÁÉÍÓÚÑ][^:]{1,90}):\s+(.+)$', ln)
        if m and not u.startswith('NOTA'):
            cur = {'term': m.group(1).strip(), 'definition': m.group(2).strip(),
                   'part': cur_part, 'page': pageno[i]}
            defs.append(cur)
        elif cur is not None:
            cur['definition'] = (cur['definition'] + ' ' + ln).strip()
    for d in defs:
        d['definition'] = re.sub(r'\s+', ' ', d['definition'])
    return defs


# ------------------------------------------------------------------ referencias

def collect_refs(node, out):
    for key in ('text', 'title'):
        for m in RE_REF.finditer(node.get(key, '') or ''):
            out.add(m.group(1))
    for n in node.get('notes', []) + node.get('exceptions', []):
        for m in RE_REF.finditer(n.get('text', '')):
            out.add(m.group(1))
    for d in node.get('definitions', []):
        for m in RE_REF.finditer(d['term'] + ' ' + d['text']):
            out.add(m.group(1))
    for ch in node.get('children', []):
        collect_refs(ch, out)


def walk(node):
    yield node
    for ch in node.get('children', []):
        yield from walk(ch)


# ------------------------------------------------------------------ main

def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'NOM-001-SEDE-2012.pdf'
    out = sys.argv[2] if len(sys.argv) > 2 else 'data'
    os.makedirs(out, exist_ok=True)

    pages = load_pages(pdf)

    # Zonas ocupadas por tablas, producidas por build_tables. Se omiten para
    # que el contenido de una tabla no reaparezca como párrafo corrido.
    #
    # Además se anota DÓNDE empieza cada tabla, para poder devolverla a su
    # sitio: una tabla pertenece al punto del texto en el que aparece en la
    # norma, no al final de la sección ni al final de la parte.
    skip, marcas, vistas = {}, [], set()
    rpath = os.path.join(out, 'tablas_regiones.json')
    if os.path.exists(rpath):
        for r in sorted(json.load(open(rpath)), key=lambda r: (r['page'], r['y0'])):
            skip.setdefault(r['page'], []).append((r['y0'], r['y1']))
            if r['id'] not in vistas:      # solo la primera página de la tabla
                vistas.add(r['id'])
                marcas.append((r['page'], r['y0'], r.get('article'), r['id']))

    img_dir = os.environ.get('NOM_IMG_DIR', 'site/public/img')
    images = extract_images(pdf, img_dir)

    lines, pageno = build_linemap(pages, pdf=pdf, skip=skip, images=images,
                                  marcas=marcas)
    toc, chapters, titulos = parse_toc(pages)
    starts = find_articles(lines, pageno, toc)

    order = sorted(starts, key=lambda n: starts[n])
    bounds = {}
    for idx, n in enumerate(order):
        lo = starts[n]
        hi = starts[order[idx + 1]] if idx + 1 < len(order) else len(lines)
        bounds[n] = (lo, hi)

    articles, definitions = [], []
    for n in order:
        lo, hi = bounds[n]
        meta = toc[n]
        if n == 100:
            definitions = parse_definitions(lines, pageno, lo, hi)
            body = {'parts': [{'letter': 'A', 'title': 'Definiciones generales'},
                              {'letter': 'B', 'title': 'Definiciones de más de 600 volts'}],
                    'sections': []}
        else:
            body = parse_article(n, lines, pageno, lo, hi)

        refs = set()
        for s in body['sections']:
            collect_refs(s, refs)
        articles.append({
            'num': n,
            'chapter': meta['chapter'],
            'title': meta['title'],
            'page': pageno[lo],
            'parts': body['parts'],
            'sections': body['sections'],
            'refs': sorted(refs),
        })

    corpus = {
        'meta': {
            'norma': 'NOM-001-SEDE-2012',
            'nombre': 'Instalaciones Eléctricas (utilización)',
            'publicacion_dof': '2012-11-29',
            'version': '2012',
            'fuente_pdf': os.path.basename(pdf),
            'paginas': len(pages),
            'aviso': ('Reproducción del texto publicado en el DOF con fines de consulta. '
                      'No es edición oficial. Ante cualquier duda, prevalece el texto '
                      'publicado en el Diario Oficial de la Federación.'),
        },
        'titulos': [{'num': k, 'title': v} for k, v in titulos.items()],
        'chapters': [{'num': k, 'title': v} for k, v in chapters.items()],
        'articles': articles,
    }

    json.dump(corpus, open(os.path.join(out, 'corpus.json'), 'w'),
              ensure_ascii=False, indent=1)
    json.dump(definitions, open(os.path.join(out, 'definiciones.json'), 'w'),
              ensure_ascii=False, indent=1)

    # -------------------------------------------------------------- validación
    n_sec = sum(len(a['sections']) for a in articles)
    n_sub = sum(len(list(walk(s))) - 1 for a in articles for s in a['sections'])
    n_figs = sum(len(x.get('figures', [])) for a in articles
                 for s in a['sections'] for x in walk(s))
    n_notes = sum(len(x.get('notes', [])) for a in articles
                  for s in a['sections'] for x in walk(s))
    n_exc = sum(len(x.get('exceptions', [])) for a in articles
                for s in a['sections'] for x in walk(s))

    # Cobertura: se mide por LÍNEA de contenido, no por carácter. Una métrica
    # por caracteres castiga los encabezados estructurales (título del
    # artículo, títulos de parte), que sí se conservan pero en otro campo, y
    # da una cifra artificialmente baja. Aquí una línea cuenta como capturada
    # si al menos el 60% de sus palabras aparece en el corpus resultante.
    by_num = {a['num']: a for a in articles}
    lines_total = lines_lost = 0
    lost_examples = []
    for n in order:
        lo, hi = bounds[n]
        a = by_num[n]
        got = set(re.findall(r'\w+', unaccent(a['title']).lower()))
        for p in a['parts']:
            got.update(re.findall(r'\w+', unaccent(p.get('title', '')).lower()))
        if n == 100:
            for d in definitions:
                got.update(re.findall(
                    r'\w+', unaccent(d['term'] + ' ' + d['definition']).lower()))
        for s in a['sections']:
            for x in walk(s):
                got.update(re.findall(r'\w+', unaccent(
                    (x.get('title') or '') + ' ' + (x.get('text') or '')).lower()))
                for z in x.get('notes', []) + x.get('exceptions', []):
                    got.update(re.findall(r'\w+', unaccent(z['text']).lower()))
                for z in x.get('definitions', []):
                    got.update(re.findall(
                        r'\w+', unaccent(z['term'] + ' ' + z['text']).lower()))
        for j in range(lo, hi):
            ln = lines[j].strip()
            if len(ln) < 25 or ln.startswith(IMG_MARK):
                continue
            w = re.findall(r'\w+', unaccent(ln).lower())
            if not w:
                continue
            lines_total += 1
            if sum(1 for x in w if x in got) / len(w) < 0.6:
                lines_lost += 1
                if len(lost_examples) < 25:
                    lost_examples.append({'articulo': n, 'linea': ln[:120]})

    empty = [s['id'] for a in articles for s in a['sections']
             if not (s.get('text') or s.get('children') or s.get('definitions'))]

    val = {
        'articulos': len(articles),
        'articulos_esperados': len(toc),
        'secciones': n_sec,
        'incisos': n_sub,
        'notas': n_notes,
        'excepciones': n_exc,
        'definiciones': len(definitions),
        'figuras': n_figs,
        'referencias_distintas': len(set(r for a in articles for r in a['refs'])),
        'lineas_contenido': lines_total,
        'lineas_no_capturadas': lines_lost,
        'cobertura_pct': round(100.0 * (1 - lines_lost / lines_total), 2) if lines_total else 0,
        'lineas_no_capturadas_ejemplos': lost_examples,
        'secciones_vacias': empty,
        'articulos_sin_secciones': [a['num'] for a in articles
                                    if not a['sections'] and a['num'] != 100],
    }
    json.dump(val, open(os.path.join(out, 'validacion.json'), 'w'),
              ensure_ascii=False, indent=1)

    print('Artículos      : %d / %d' % (val['articulos'], val['articulos_esperados']))
    print('Secciones      : %d' % n_sec)
    print('Incisos        : %d' % n_sub)
    print('Notas          : %d' % n_notes)
    print('Excepciones    : %d' % n_exc)
    print('Definiciones   : %d' % len(definitions))
    print('Figuras        : %d en %s' % (
        sum(len(x.get('figures', [])) for a in articles
            for s2 in a['sections'] for x in walk(s2)), img_dir))
    print('Referencias    : %d distintas' % val['referencias_distintas'])
    print('Cobertura      : %.2f%% (%d de %d líneas de contenido)'
          % (val['cobertura_pct'], lines_total - lines_lost, lines_total))
    print('Secciones vacías: %d' % len(empty))
    print('Artículos sin secciones: %s' % val['articulos_sin_secciones'])


if __name__ == '__main__':
    main()
