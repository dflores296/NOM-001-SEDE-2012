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
import hashlib, itertools, json, os, re, struct, sys, unicodedata
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
# El punto sobrante tras el paréntesis es una errata del DOF, no otra forma de
# marcador: la norma imprime «e). Pozos verticales» donde sus hermanos c), d) y
# f) van sin punto. Sin tolerarlo, ese inciso no se reconocía y quedaba colgando
# como prosa dentro del inciso anterior, un nivel más abajo del que le toca.
# Son 28 en todo el documento y 26 caen en el Artículo 800. Las formas
# numeradas —«(1).» y «1).»— no traen la errata en ninguna página.
#
# La MAYÚSCULA es otra errata del mismo tipo y ocurre una sola vez en las 780
# páginas: 220-14 imprime «J) Alojamientos» entre sus hermanos i) y k). Sin
# admitirla, el inciso entero —y los tres numerales que enumera— se los tragaba
# 220-14(i), que trata de otra cosa. La etiqueta se normaliza a minúscula al
# construir el id, para que el identificador siga siendo 220-14(j).
RE_SUB_A   = re.compile(r'^([A-Za-z])\)\.?\s+(.*)$')     # a)  «a).»  y la errata «J)»
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

# El punto que separa el título corto de una sección de la frase que le sigue
# falta en el PDF en un solo lugar del documento: 340-6 imprime "Requisitos de
# aprobación Los cables tipo UF deben ser aprobados." sin el punto que en las
# otras 2 896 secciones marca dónde termina el título. Sin él, el regex normal
# traga la línea entera como título y la sección queda sin texto -- era la
# única entrada de "secciones_vacias" en validacion.json.
TITULOS_SIN_PUNTO = {
    '340-6': ('Requisitos de aprobación', 'Los cables tipo UF deben ser aprobados.'),
}


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
#
# El número puede llevar sufijo de inciso —"Figura 550-10 (c).-", con espacio,
# y "Figura 690-1(a).-", sin él—, y sin admitirlo esas dos leyendas se
# publicaban como prosa: la de 550-10(c) quedaba pegada a "X, Y: Conductores
# de fase".
RE_FIGCAP = re.compile(r'^Figura\s+\d{3}-\d{1,3}(?:\s*\([a-z0-9]{1,2}\))*\s*[.\-]')

# Sangrías con las que arranca un párrafo NUEVO en este PDF. La continuación de
# un párrafo va en 32.8, y entre las dos se reparte el 85% de las líneas de
# prosa del documento, así que la señal es limpia. Sirve para cerrar una NOTA o
# una Excepción cuando lo que sigue ya no es suyo.
SANGRIA_PARRAFO = (47.0, 68.8)

# Sangría de continuación: un renglón que va aquí es la segunda línea de un
# párrafo, no el principio de nada.
SANGRIA_CONT = 32.8
# La continuación de un párrafo arranca más a la izquierda que su primer
# renglón. Las tres son sangrías del cuerpo del documento: ninguna celda ni nota
# al pie de una tabla cae en ellas.
SANGRIA_CUERPO = (32.8,) + SANGRIA_PARRAFO


# Ancho al que se reducen las miniaturas del índice de figuras. Las 59
# imágenes a tamaño completo son 4.1 MB, que es mucho para una página que solo
# sirve para elegir; reducidas son una décima parte. No se recortan ni se
# reencuadran: una miniatura que miente sobre lo que hay dentro no sirve para
# elegir, que es justo para lo que está.
#
# La reducción va por mitades (`shrink`), que es lo único que pymupdf hace sin
# interpolar: el resultado es el mismo byte a byte en cada corrida, que es lo
# que el pipeline exige. Por eso el ancho final no es exacto sino "la mitad
# más chica que siga por encima de este umbral".
MINIATURA_MIN = 120


def guardar_miniatura(pix, destino):
    """Copia reducida de la imagen, para el índice de figuras."""
    import pymupdf
    chica = pymupdf.Pixmap(pix)
    while chica.width // 2 >= MINIATURA_MIN and chica.height // 2 >= 1:
        chica.shrink(1)
    chica.save(destino)


def extract_images(pdf, img_dir):
    """Guarda las imágenes del PDF y devuelve [(pagina, y, archivo, w, h)]."""
    import pymupdf
    doc = pymupdf.open(pdf)
    os.makedirs(img_dir, exist_ok=True)
    min_dir = os.path.join(img_dir, 'min')
    os.makedirs(min_dir, exist_ok=True)
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
                guardar_miniatura(pix, os.path.join(min_dir, name))
                seen[xref] = (pix.width, pix.height)
            w, h = seen[xref]
            for r in rects:
                out.append((pno + 1, r.y0, name, round(r.width), round(r.height)))
    return out


# La rama «[A-M]. Xxx» es para un encabezado de parte —«A. Generalidades»— y
# exige minúsculas detrás a propósito: sin eso también rescataba «F. DEF.
# CARGA 50», que es el segundo renglón del encabezado de las tres tablas que
# acompañan a las Figuras B.310.15(B)(2)(3) a (5), y las sacaba de su tabla
# para publicarlas como prosa suelta del Apéndice A.
#
# Un encabezado nunca se omite, aunque caiga dentro de una zona de tabla: el
# alto detectado de una tabla puede pasarse de largo y tragarse la sección que
# viene justo debajo. Sin esta salvaguarda desaparecían 110-36, 210-3, 550-32,
# 922-16 y 922-17.
#
# La forma sin punto exige LETRA después del espacio, no dígito: "384-1
# Alcance" es un encabezado real, pero "601-2 500" es una celda de la Tabla
# 110-34(a) —rango de tensión con espacio como separador de miles— y sin esta
# distinción calzaba con el patrón y se colaba entero en la Excepción de
# 110-34(a). Es el único caso en las 780 páginas con esa forma.
# Los encabezados de la región de cierre corren el mismo riesgo, y uno ya se
# perdía: la zona de la Tabla B2.2 termina en y=567.1 de la página 773 y el
# «APENDICE C (Informativo)» está impreso en y=566, un punto más arriba. Sin
# esta salvaguarda el Apéndice C entero se quedaba dentro del B.
#
# Se exige el dígito en CAPITULO y TITULO a propósito: «Título» es el nombre
# de una columna de los listados de normas del Apéndice B y no un encabezado.
RE_KEEP = re.compile(
    r'^(?:ARTICULO\s+\d{3}|[A-M]\.\s+[0-9A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}|'
    r'APENDICE\s+[A-E]\b|CAPITULO\s+\d{1,2}\b|TITULO\s+\d{1,2}\b|'
    r'\d{3}-\d{1,3}(?:\.\s*[0-9A-ZÁÉÍÓÚÑ]|\s+[A-ZÁÉÍÓÚÑ]))')

# Un inciso cualquiera, para rescatarlo de la zona que ocupa una tabla. Ver
# `rescatable()`: la zona de una tabla se dibuja con holgura y el primer
# renglón del inciso que viene DESPUÉS cae dentro, así que se perdía.
RE_INCISO = re.compile(r'^(?:[A-Za-z]\)\.?|\(\d{1,2}\)|\d{1,2}\)|[a-z]\.)\s+\S')

# El título de una tabla pertenece a la tabla, no a la prosa. Hace falta
# distinguirlo porque el recorte de una tabla alcanza a veces el título de la
# SIGUIENTE —en la página 150 la zona de la 310-60(c)(79) llega hasta el título
# de la 310-60(c)(80)— y rescatarlo lo publicaría dos veces: una en el
# encabezado de su tabla y otra suelta a media sección.
RE_TITULO_TABLA = re.compile(r'^(?:Tabla|TABLA)\s+\S+\s*(?:\.-|\.|-|—)')

# Zonas que no son ni prosa ni tabla y hay que ignorar. Solo hay una en las 780
# páginas: el Artículo 230 imprime bajo su Alcance un índice de sus partes a dos
# columnas —los títulos a la izquierda, en x=44.0, y las etiquetas «Parte A» a
# «Parte H» a la derecha, en x=379.2—. El flujo de texto lo lee en dos tiradas y
# lo pegaba entero al final del Alcance de 230-1, que acababa diciendo
# «…para su instalación. Generalidades Parte A Conductores de acometida aérea
# Parte B …». No se pierde nada al quitarlo: las ocho partes ya se recogen de
# sus encabezados reales, repartidas por el artículo.
ZONAS_IGNORADAS = [(60, 430.0, 572.0)]


def build_linemap(pages, pdf=None, skip=None, images=None, marcas=None,
                  texto_tablas=None):
    """Devuelve (lineas, pagina, x0) del documento completo.

    La x0 es la sangría de la línea, y distingue un párrafo NUEVO (arranca en
    x=47.0, o en 68.8 si va anidado) de la continuación del párrafo anterior
    (x=32.8). El texto plano de get_text() no la conserva, y sin ella una NOTA
    o una Excepción se traga el párrafo que viene después: todo lo que no trae
    marcador propio se le sigue pegando.

    `skip` son zonas [(pagina, y0, y1, id)] que se omiten: las ocupa una tabla, y
    su texto plano es una ristra de números sin estructura que, si se deja,
    reaparece como un párrafo ilegible dentro de la sección.

    `texto_tablas` es {id: texto que la tabla SÍ capturó}, y es lo que sostiene
    la regla de `rescatable()`.
    """
    import pymupdf
    doc = pymupdf.open(pdf) if pdf else None
    skip = skip or {}
    texto_tablas = texto_tablas or {}

    def suyo_de_la_tabla(txt, tid):
        """¿Este renglón es texto que la tabla `tid` capturó de veras?

        El marcador se quita con RE_INCISO y no partiendo por el primer ')': un
        renglón de continuación puede traer un paréntesis a media frase —«usando
        la clase de temperatura (código T)»— y partir por ahí dejaba un cuerpo
        vacío, que se confundía con texto de la tabla y tiraba el renglón.

        Cuando el renglón no trae un marcador reconocible se descarta todo lo
        que va ANTES de la primera letra, y los espacios se colapsan. Es lo que
        hace falta para las notas al pie: la Tabla 400-4 las guarda como
        «(1) Ver la Nota 10.» y el PDF las imprime «1       Ver la Nota 10.»,
        sin paréntesis y con la sangría hecha de espacios. Comparando en crudo
        no coincidían, la tabla parecía no haberlas capturado y sus quince notas
        se habrían publicado por segunda vez como prosa de otra sección.
        """
        m = RE_INCISO.match(txt)
        cuerpo = (txt[m.end() - 1:] if m
                  else re.sub(r'^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+', '', txt))
        cuerpo = re.sub(r'\s+', ' ', unaccent(cuerpo)).strip().lower()[:40]
        return not cuerpo or cuerpo in texto_tablas.get(tid, '')

    def rescatable(txt, x0, tid):
        """¿Esta línea es texto normativo que la tabla no se llevó?

        La zona de una tabla se dibuja con holgura sobre su último renglón, y
        eso alcanzaba a comerse el primer renglón del inciso siguiente. En
        690-31 se perdió el inciso (d), "Cables con conductores pequeños": su
        encabezado cayó dentro de la zona de la Tabla 690-31(c) y el resto del
        párrafo quedó pegado a la cola de (c), partido a media frase. No era
        texto mal colocado, era texto que ya no estaba en ninguna parte.

        Y no solo al inciso que abre: las zonas de las Tablas 620-14 y 680-10
        son tan altas que se llevaban renglones de EN MEDIO de un párrafo, sin
        marcador ninguno. 620-15 quedó diciendo "La capacidad nominal del
        controlador debe cumplir con lo requerido en 430-83. Se la potencia
        disponible para el motor...", con la oración partida a la mitad.

        Se rescata con tres condiciones:

        - La SANGRIA tiene que ser la del cuerpo del documento (32.8 para una
          continuación, 47.0 o 68.8 para un párrafo nuevo). Las notas al pie de
          las tablas del Capítulo 9 van sangradas a la columna de su tabla
          (x=73, 86, 92, 113, 142...), y sin este filtro se colaban 59 como si
          fueran incisos de la norma.
        - No puede ser el TITULO de una tabla, que es de la tabla y no de la
          prosa: el recorte de una alcanza a veces el título de la siguiente.
        - La tabla NO debe haberse llevado ya ese texto. Las notas al pie de la
          300-50 ("a) Profundidad mínima se define como..."), las de la
          314-16(a) y las quince de la 400-4 están capturadas como notas de su
          tabla: si además se rescataran, saldrían dos veces.

        Dicho de otro modo: una tabla solo puede tragarse el texto que de veras
        capturó. El mínimo de 15 caracteres deja fuera las celdas sueltas y
        los encabezados de una palabra —el «NOTAS» que precede a las notas al
        pie de la 400-4—, que no se parecen a una frase. Los renglones cortos
        que sí son prosa entran por la continuación, más abajo.
        """
        return (len(txt) >= 15 and x0 in SANGRIA_CUERPO
                and not RE_TITULO_TABLA.match(txt)
                and not suyo_de_la_tabla(txt, tid))
    imgs = {}
    for pno, y, name, w, h in (images or []):
        imgs.setdefault(pno, []).append((y, name, w, h))
    tbls = {}
    for pno, y, art, tid in (marcas or []):
        tbls.setdefault(pno, []).append((y, art, tid))

    lines, pageno, sangria = [], [], []
    for pno in range(1, len(pages) + 1):
        items = []
        if doc is not None:
            for blk in doc[pno - 1].get_text('dict')['blocks']:
                for ln in blk.get('lines', []):
                    txt = fix_glifos(''.join(sp['text'] for sp in ln['spans']))
                    items.append((ln['bbox'][1], txt, round(ln['bbox'][0], 1)))
        else:
            items = [(0, t, 0.0) for t in pages[pno - 1].split('\n')]
        for y, name, w, h in imgs.get(pno, []):
            items.append((y, '%s%s:%d:%d' % (IMG_MARK, name, w, h), 0.0))
        # justo por encima de su primera línea, para que caiga en el nodo que
        # la precede y no en el siguiente
        for y, art, tid in tbls.get(pno, []):
            items.append((y - 0.01, '%s%s|%s' % (TBL_MARK, art or 0, tid), 0.0))
        items.sort(key=lambda z: z[0])

        zonas = skip.get(pno, [])
        # Tabla de cuya zona venimos rescatando un párrafo. Hace falta recordarlo
        # porque el último renglón de un párrafo suele ser corto y no pasa el
        # mínimo de `rescatable`: 430-40 termina en «con 430-52.» y 922-101(a)
        # en «que actúen.», once caracteres cada uno. Mientras sigamos en la
        # MISMA zona, con sangría de cuerpo y con texto que la tabla no capturó,
        # el párrafo continúa.
        rescatando = None
        for y, txt, x0 in items:
            if not txt.startswith(IMG_MARK) and not txt.startswith(TBL_MARK):
                if any(pg == pno and a <= y <= b for pg, a, b in ZONAS_IGNORADAS):
                    continue
                limpio = txt.strip()
                dentro = [tid for a, b, tid in zonas if a <= y <= b]
                if not dentro or RE_KEEP.match(unaccent(limpio)):
                    rescatando = None
                elif any(rescatable(limpio, x0, tid) for tid in dentro):
                    rescatando = next(tid for tid in dentro
                                      if rescatable(limpio, x0, tid))
                elif (rescatando in dentro and x0 in SANGRIA_CUERPO
                        and not suyo_de_la_tabla(limpio, rescatando)):
                    pass                      # continúa el párrafo rescatado
                else:
                    rescatando = None
                    continue
            if NOISE.match(txt.strip()):
                continue
            lines.append(txt.rstrip())
            pageno.append(pno)
            sangria.append(x0)
    return lines, pageno, sangria


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


def parse_article(num, lines, pageno, lo, hi, sangria=None):
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
    # annot[2]: la anotación anunció una lista con dos puntos, así que los
    # renglones sangrados que siguen son SUYOS y no hay que cortarle. Se decide
    # una sola vez, en el primer renglón de la lista: después el texto ya
    # termina en ';' y el indicio se habría perdido —la NOTA de 300-17 enumera
    # 27 secciones, una por renglón—.
    annot = [None, None, False]
    # Bloque de `parrafos` vigente y su dueño. La prosa que sigue a una figura
    # o a una tabla se acumula ahí, y cada renglón en sangría de párrafo abre
    # uno nuevo: tras la fórmula de 504-10(b)(2) el PDF imprime «Donde,», «T =
    # …», «Po = …», «Rt = …» y «Tamb = …» como cinco párrafos, uno por renglón,
    # y concatenados se leían como una sola frase corrida.
    parr = [None, None]
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

    def abre_lista(kind, label):
        """¿Este marcador es el PRIMERO de una lista?

        Una NOTA o Excepción que termina en dos puntos se queda con la
        enumeración que anuncia, y eso es correcto casi siempre. Pero la
        Excepción de 200-10(a) acaba diciendo "...como se exige en (b)
        siguiente:" y lo que venía detrás NO era su lista: era el inciso
        200-10(b), "Contactos, clavijas y conectores", texto normativo hermano
        de (a). Quedaba enterrado dentro de la excepción, que es el mismo
        defecto que escondía incisos dentro de una nota en el 800-113.

        Lo que los separa es por dónde empieza la enumeración. La lista que
        anuncia una anotación arranca siempre en su primer rótulo —(1) o a)—,
        porque es una lista nueva. Un marcador que entra por la mitad no está
        empezando nada: está continuando la estructura de fuera, como ese "b)"
        que sigue al "a)" ya abierto. La NOTA 1 de 500-5(b)(1) enumera diez
        lugares desde el (1) y se los queda; la Excepción de 200-10(a) se
        encuentra un "b)" y suelta.

        Solo decide el PRIMER elemento: una vez abierta la lista, el resto la
        continúa por tipo de marcador, como hasta ahora.
        """
        return label == ('1' if kind in ('num', 'paren') else 'a')

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
                # Lo acumulado hasta aquí precede a la tabla y es del nodo; lo
                # que venga después va a `parrafos`, o se pintaría por encima
                # de la tabla que introduce: en 220-83(a) la frase «En los
                # cálculos de la carga se debe incluir lo siguiente:» va
                # debajo. Un bloque que quede vacío se poda al cerrar.
                commit()
                owner.setdefault('tables', []).append({'id': tid, 'seq': next(seq)})
                annot[0], annot[1], annot[2] = None, None, False
                node = {'text': '', 'seq': next(seq)}
                owner.setdefault('parrafos', []).append(node)
                target = node
                parr[0], parr[1] = node, owner
            continue

        # --- imagen (fórmula o figura): se cuelga del nodo vigente
        if ln.startswith(IMG_MARK):
            name, w, h = ln[len(IMG_MARK):].rsplit(':', 2)
            owner = stack[-1]['node'] if stack else sec
            if owner is not None:
                # Mismo trato que una tabla: lo acumulado precede a la figura y
                # lo que siga va a `parrafos`, o se pintaría por encima de ella.
                commit()
                fig = {'src': name, 'w': int(w), 'h': int(h),
                       'page': pageno[i], 'seq': next(seq)}
                owner.setdefault('figures', []).append(fig)
                ultima_fig[0] = fig
                annot[0], annot[1], annot[2] = None, None, False
                node = {'text': '', 'seq': next(seq)}
                owner.setdefault('parrafos', []).append(node)
                target = node
                parr[0], parr[1] = node, owner
            continue

        # --- leyenda de una figura: "Figura 310-60.- Dimensiones de..."
        #
        # Va debajo de su imagen y describe lo que se ve, no es texto
        # normativo. Como párrafo se pegaba a la nota anterior y la
        # ensuciaba: en 310-60(c)(4) el pie de la Figura 310-60 quedó dentro
        # de la NOTA sobre pérdidas dieléctricas, que trata de otra cosa.
        # En sangría de continuación no es una leyenda, es una cita del cuerpo
        # que se partió de renglón justo antes: 820-154 dice "...e ilustrados
        # en la / Figura 820-154." y 551-46(c) "...que cumpla con la
        # configuración mostrada en la / Figura 551-46 (c)." Tomarlas por
        # leyenda se lleva el final de la frase fuera del texto normativo.
        if (ultima_fig[0] is not None and RE_FIGCAP.match(u)
                and not (sangria is not None and sangria[i] == SANGRIA_CONT)):
            ultima_fig[0]['caption'] = re.sub(r'\s+', ' ', ln).strip()
            continue
        if ultima_fig[0] is not None and ultima_fig[0].get('caption'):
            # La leyenda ocupa dos renglones más veces de las que parece
            # ("Figura 310-60.- Dimensiones de instalación de cables / para
            # uso con las Tablas..."). El segundo empieza en minúscula, que
            # es lo que distingue una línea partida de una frase nueva.
            #
            # Un marcador de inciso también empieza en minúscula, y no es
            # continuación de nada: el pie de la Figura 550-10 (c) va seguido
            # de "d) Longitud total del cordón de alimentación." y se lo
            # tragaba entero, con lo que 550-10(d) dejaba de existir.
            if ln[:1].islower() and not RE_INCISO.match(u):
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
            annot[0], annot[1], annot[2] = None, None, False
            sid = m.group(1)
            rest = ln[len(m.group(1)) + 1:].lstrip()
            if sid in TITULOS_SIN_PUNTO:
                title, body = TITULOS_SIN_PUNTO[sid]
            else:
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
                annot[0], annot[1], annot[2] = node, None, False
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
                annot[0], annot[1], annot[2] = node, None, False
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
        # El contenido se toma con m.start(2) y no contando caracteres desde
        # el marcador: la errata «a).» mete un punto de más y con un offset
        # fijo acababa dentro del título («. Pozos verticales»). Se indexa `ln`
        # y no `u` porque unaccent() conserva la longitud pero pierde acentos.
        for rx, kind in ((RE_SUB_A, 'alpha'), (RE_SUB_N, 'paren'),
                         (RE_SUB_P, 'num'), (RE_SUB_L, 'letter')):
            m = rx.match(u)
            if m:
                break
        else:
            m = None
        # Una frase que ANUNCIA una lista se parte de renglón como cualquier
        # otra, y a veces justo antes del marcador: 725-121(a) dice "debe ser
        # una de las fuentes (1), (2), (3), (4) ó (5) siguientes" y la segunda
        # línea abre con "(4) ó (5) siguientes.". Tomarla por inciso creaba un
        # nodo fantasma del que colgaban los incisos de verdad.
        #
        # La sangría lo distingue —esa línea va en 32.8, no en 47.0— pero no
        # basta: hay cuatro incisos legítimos impresos ahí (pág. 158). Lo que
        # los separa es que el inciso real abre en mayúscula y la continuación
        # sigue la frase en minúscula. Con las dos condiciones se descartan 16
        # renglones en las 780 páginas y no se pierde ninguno de los cuatro.
        if (m is not None and sangria is not None
                and sangria[i] == SANGRIA_CONT
                and not ln[m.start(2):m.start(2) + 1].isupper()):
            m = None
        if m and sec is not None:
            # La etiqueta se normaliza: la única mayúscula del documento es la
            # errata «J)» de 220-14, y su id canónico es 220-14(j).
            etiqueta = m.group(1).lower() if kind == 'alpha' else m.group(1)
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
            # El marcador tiene que CONTINUAR la lista, no solo compartir su
            # tipo. Si repite el número anterior o vuelve a empezar, la lista
            # de la anotación terminó y lo que llega es del nodo: en
            # 725-121(a) la NOTA enumera cuatro ejemplos y el «(4)» que sigue
            # es el cuarto inciso de la sección, no un quinto ejemplo; en la
            # Excepción de 250-32(b)(1) el «(1)» que sigue al «(3)» abre la
            # lista del párrafo siguiente.
            sigue = True
            if annot[0] is not None and annot[0].get('items'):
                prev = annot[0]['items'][-1].get('label')
                # Un item sin rótulo es un párrafo intercalado: la numeración
                # que venga después arranca de cero y no tiene que continuar
                # la de antes.
                if prev is None:
                    sigue = True
                elif str(prev).isdigit() and str(etiqueta).isdigit():
                    sigue = int(etiqueta) == int(prev) + 1
                elif len(str(prev)) == 1 and len(str(etiqueta)) == 1:
                    sigue = ord(str(etiqueta)) == ord(str(prev)) + 1
            if (annot[0] is not None and sigue
                    and annot[0].get('text', '').rstrip().endswith(':')
                    and (annot[1] == kind
                         or (annot[1] is None and abre_lista(kind, etiqueta)))):
                annot[1] = kind
                annot[0].setdefault('items', []).append(
                    {'label': etiqueta, 'text': ln[m.start(2):].strip()})
                target = annot[0]['items'][-1]
                continue
            annot[0], annot[1], annot[2] = None, None, False
            if new_sub(etiqueta, kind, ln[m.start(2):].strip()):
                continue

        # --- texto corrido
        #
        # Un renglón en sangría de párrafo cierra el bloque de `parrafos` que
        # venía de una figura o una tabla y abre otro: son párrafos distintos
        # del documento, no una frase partida.
        # Un párrafo dentro de la lista de una anotación sigue siendo suyo: la
        # Excepción de 250-32(b)(1) enumera tres requisitos y luego dice «Si el
        # conductor puesto a tierra se usa ... de acuerdo con las disposiciones
        # de ESTA EXCEPCIÓN, el tamaño ... no debe ser menor que el mayor de
        # cualquiera de los siguientes:» y enumera dos más. Se guarda como item
        # sin rótulo para conservar el orden, y con eso la numeración de la
        # segunda lista puede volver a empezar.
        if (annot[0] is not None and annot[0].get('items')
                and target is annot[0]['items'][-1]
                and sangria is not None and sangria[i] == 47.0):
            commit()
            annot[0]['items'].append({'label': None, 'text': ''})
            target = annot[0]['items'][-1]

        if (parr[0] is not None and target is parr[0] and parr[1] is not None
                and sangria is not None and sangria[i] == 47.0
                and (buf or parr[0]['text'].strip())):
            commit()
            node = {'text': '', 'seq': next(seq)}
            parr[1].setdefault('parrafos', []).append(node)
            target = node
            parr[0] = node
        #
        # Una NOTA o Excepción abierta se queda con todo lo que no traiga
        # marcador propio, y eso incluía el párrafo siguiente: la Excepción de
        # 922-56(b) se llevaba «Para claros a nivel...», que en el PDF va
        # aparte. La sangría los distingue. Se respeta el caso de la nota que
        # termina en dos puntos, porque ahí lo que sigue SÍ es suyo: es la
        # enumeración que anuncia.
        if (annot[0] is not None and target is annot[0]
                and sangria is not None
                and sangria[i] in SANGRIA_PARRAFO and not annot[2]):
            commit()
            if annot[0].get('text', '').rstrip().endswith(':'):
                annot[2] = True
            else:
                annot[0], annot[1], annot[2] = None, None, False
                # El párrafo va DESPUÉS de la anotación en el documento, así
                # que no puede volver al `text` del inciso: ese se pinta antes
                # y el texto acabaría por encima de la Excepción que lo
                # precede. Se guarda como bloque propio con su `seq`, el mismo
                # mecanismo con el que ya se intercalan notas y excepciones.
                owner = stack[-1]['node'] if stack else sec
                if owner is not None:
                    node = {'text': '', 'seq': next(seq)}
                    owner.setdefault('parrafos', []).append(node)
                    target = node
                else:
                    target = None

        buf.append(ln)

    commit()
    for s_ in art['sections']:
        partir_marcadores_embebidos(s_)
        # Los bloques de `parrafos` se crean por adelantado al pasar por una
        # tabla; los que no recibieron texto se podan para no publicar huecos.
        for n in walk(s_):
            if 'parrafos' in n:
                n['parrafos'] = [x for x in n['parrafos'] if x['text'].strip()]
                if not n['parrafos']:
                    del n['parrafos']
    return art


def partir_marcadores_embebidos(nodo):
    """Separa el inciso que el DOF imprimió dentro del párrafo del anterior.

    504-30(a)(2) anuncia "...por uno de los métodos (1) a (4) siguientes:" y
    luego imprime tres de ellos en un solo párrafo: "(1) Separación mínima de 50
    milímetros... (2) Separación... mediante una división metálica... (3)
    Separación... mediante una división aislante aprobada." Solo el (1) abre
    renglón, así que el (2) y el (3) —dos métodos normativos completos— quedaban
    dentro del texto del (1), y la sección saltaba de (1) a (4).

    El corte se hace únicamente cuando el marcador CONTINUA la secuencia del
    inciso que lo contiene, va tras punto y seguido y abre con mayúscula. Con
    esas tres condiciones el patrón aparece una sola vez en las 780 páginas, así
    que no toca ninguna de las miles de referencias cruzadas del tipo
    "como se establece en (1) o (2) siguientes".
    """
    hijos = nodo.get('children') or []
    i = 0
    while i < len(hijos):
        n = hijos[i]
        if (n.get('kind') in ('paren', 'num') and str(n.get('label', '')).isdigit()
                and not n.get('children')):
            sig = int(n['label']) + 1
            txt = n.get('text', '')
            m = re.search(r'\.\s+\(%d\)\s+(?=[A-ZÁÉÍÓÚÑ])' % sig, txt)
            if m:
                n['text'] = txt[:m.start() + 1].strip()
                hijos.insert(i + 1, {
                    'id': nodo['id'] + ('(%d)' % sig), 'label': str(sig),
                    'kind': n['kind'], 'level': n.get('level'),
                    'text': txt[m.end():].strip(),
                    'children': [], 'notes': [], 'exceptions': []})
        i += 1
    for h in hijos:
        partir_marcadores_embebidos(h)


# ------------------------------------------------------------------ definiciones

def parse_definitions(lines, pageno, lo, hi):
    """Devuelve (definiciones, alcance).

    Antes de "A. Definiciones generales" el Artículo 100 trae un párrafo de
    alcance sin numerar ("Alcance. Este Artículo contiene las definiciones
    esenciales..."). No es un término del glosario -- no tiene el patrón
    "Término: definición" -- así que se perdía entero: no había `cur_part`
    todavía, `cur` seguía en None y la rama `elif cur is not None` lo
    descartaba línea por línea sin dejar rastro.
    """
    defs, cur_part, cur = [], None, None
    intro = []
    saw_title = False
    for i in range(lo, hi):
        ln = lines[i].strip()
        if not ln:
            continue
        u = unaccent(ln)
        # Las dos primeras líneas no vacías son "ARTICULO 100" y el título en
        # mayúsculas ("DEFINICIONES"); no son parte del alcance y ya viven en
        # el título del artículo, así que no se agregan a `intro`.
        if re.match(r'^ARTICULO\s+\d{3}\s*$', u):
            continue
        if not saw_title:
            saw_title = True
            continue
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
        elif cur_part is None:
            intro.append(ln)
    for d in defs:
        d['definition'] = re.sub(r'\s+', ' ', d['definition'])
    return defs, re.sub(r'\s+', ' ', ' '.join(intro)).strip()


# ------------------------------------------------------------------ referencias

def collect_refs(node, out):
    for key in ('text', 'title'):
        for m in RE_REF.finditer(node.get(key, '') or ''):
            out.add(m.group(1))
    for n in (node.get('notes', []) + node.get('exceptions', [])
              + node.get('parrafos', [])):
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

# --------------------------------------------------------------------- figuras
#
# Las figuras son el único contenido de la norma cuyo rótulo el PDF no entrega
# como texto: 45 de las 59 imágenes lo llevan rasterizado dentro del PNG
# ("Figura 230-1.- Acometidas" es parte del dibujo), así que ningún detector
# puede leerlo. Se capturan a mano en `data/figuras.json`, con la misma
# política que las tablas: la captura manda y se sella con una huella.
#
# La huella aquí es del PNG, no del texto: lo que la captura describe es ESA
# imagen. Si la extracción cambiara —otra versión de pymupdf, otro recorte—,
# la leyenda dejaría de estar respaldada y hay que volver a mirarla.

def _png_size(ruta):
    """Ancho y alto reales del PNG, en píxeles.

    El `w`/`h` que trae la figura es el rectángulo donde el PDF la coloca, en
    puntos, y no siempre guarda la proporción del archivo: la del 310-15(c) se
    publicaba estirada un 3.6%. Para el `width`/`height` del HTML manda el
    archivo.
    """
    with open(ruta, 'rb') as f:
        f.read(16)
        return struct.unpack('>II', f.read(8))


def slug_figura(fid, prefijo='figura'):
    """Ancla estable de una figura: "516-3(c)(1)" -> "figura-516-3-c-1"."""
    return prefijo + '-' + re.sub(r'[^\w-]+', '-', fid).strip('-').lower()


def aplicar_figuras(articles, cierre, img_dir, ruta):
    """Cuelga de cada figura del corpus su rótulo capturado a mano.

    Una imagen puede llevar MÁS DE UNA figura: el PDF imprime la 516-3(c)(1) y
    la 516-3(c)(2) en un solo mapa de bits, y lo mismo pasa con la 517-30(a) y
    la (b), la 923-10(a)(3) y la (c), y las dos del 694. Por eso el rótulo es
    una lista y no un campo: sin ella, tres figuras citadas por el texto no
    existirían en ninguna parte.

    Aborta si falta una captura o si la huella no coincide. Una figura nueva
    exige capturarla; no hay reconstrucción de la que echar mano.
    """
    captura = json.load(open(ruta))
    vistas, usadas, fallos = set(), set(), []

    figuras = [(n['id'], f) for a in articles for s in a['sections']
               for n in walk(s) for f in n.get('figures', [])]
    # Las cuatro del Apéndice A no cuelgan de ningún inciso: van en el cierre.
    figuras += [(h['id'], b) for h in cierre for b in h['bloques']
                if b['tipo'] == 'figura']
    for nodo, f in figuras:
        src = f['src']
        vistas.add(src)
        e = captura.get(src)
        if e is None:
            fallos.append('%s: sin capturar en %s' % (src, ruta))
            continue
        ruta_png = os.path.join(img_dir, src)
        sha = hashlib.sha256(open(ruta_png, 'rb').read()).hexdigest()[:16]
        if sha != e.get('sha'):
            fallos.append('%s: la imagen cambió (huella %s, capturada %s)'
                          % (src, sha, e.get('sha')))
            continue
        f['pw'], f['ph'] = _png_size(ruta_png)
        # La miniatura del índice: sus medidas van en el corpus para que la
        # tarjeta reserve el hueco y la página no salte al cargarla.
        f['mw'], f['mh'] = _png_size(os.path.join(img_dir, 'min', src))
        f['kind'] = e['kind']
        for campo in ('titulo', 'informativa', 'nota', 'transcripcion'):
            if e.get(campo):
                f[campo] = e[campo]
        rots = []
        for r in e['rotulos']:
            # Dos figuras pueden compartir número -las dos del 694 se llaman
            # "Figura 694-1"- y dos anclas iguales en una página no son ancla.
            # La 240-92(b) es una TABLA que el DOF imprime como imagen: su
            # ancla va en el espacio de nombres de las tablas para que la cita
            # "Tabla 240-92(b)" pueda aterrizar en ella.
            ancla = base = slug_figura(
                r['id'], 'tabla' if e['kind'] == 'tabla' else 'figura')
            i = 2
            while ancla in usadas:
                ancla, i = '%s-%d' % (base, i), i + 1
            usadas.add(ancla)
            rots.append({'id': r['id'], 'titulo': r['titulo'],
                         'rotulo': ('Tabla %s' if e['kind'] == 'tabla' else 'Figura %s') % r['id'],
                         'ancla': ancla})
        f['rotulos'] = rots
        # Una fórmula no tiene número, pero sí tiene que poder enlazarse: se
        # ancla al inciso donde la norma la imprime.
        if rots:
            f['ancla'] = rots[0]['ancla']
        else:
            ancla = base = slug_figura(nodo, 'formula')
            i = 2
            while ancla in usadas:
                ancla, i = '%s-%d' % (base, i), i + 1
            usadas.add(ancla)
            f['ancla'] = ancla

    figuras = [f for _, f in figuras]
    sobran = sorted(set(captura) - vistas)
    if sobran:
        fallos.append('%d captura(s) sin figura que las use: %s'
                      % (len(sobran), ', '.join(sobran)))
    if fallos:
        sys.exit('FIGURAS: no se escribe nada.\n  - ' + '\n  - '.join(fallos))
    return figuras


# ------------------------------------------------------- región de cierre
#
# Después del último artículo el documento sigue 38 páginas más, y hasta aquí
# no existían para el corpus: como el 924 es el último artículo, sus límites
# llegaban al final del PDF y TODO eso caía dentro de `924-24`, que se titula
# «Tarimas y tapetes aislantes». Un solo párrafo de esa sección llegó a tener
# 35 389 caracteres --una tabla de ampacidad entera aplanada a prosa--, y sus
# nueve «incisos» eran en realidad las Notas de las Tablas del Capítulo 10.
#
# La cobertura del 100% no lo delataba, y no es un defecto de la métrica:
# cuenta si las palabras de cada renglón aparecen en el corpus, y aparecían.
# Lo que no dice es que estuvieran en el nodo que les toca.
#
# Lo que hay ahí es, en orden: el Capítulo 10 (las tablas generales con sus
# notas), los Títulos 6, 7 y 8, y los Apéndices A, B y C. Se parsea aparte
# porque su forma no es la del articulado --no hay secciones numeradas-- sino
# una sucesión de encabezados, párrafos, listas, tablas y figuras.

RE_HITO_CIERRE = re.compile(r'^(CAPITULO\s+10|TITULO\s+([678])|APENDICE\s+([ABC]))\b')
RE_ITEM_CIERRE = re.compile(r'^\((\d{1,2})\)\s+(.*)$')
# Los apartados del Apéndice A se numeran como la norma de la que vienen.
RE_SUBTIT_CIERRE = re.compile(r'^B\.310\.15\([B0-9]\)\(\d+\)')
RE_INFORMATIVO = re.compile(
    r'Este\s+ap[eé]ndice\s+no\s+es\s+parte\s+de\s+los\s+requerimientos', re.I)

# Sangría a partir de la cual una línea va centrada, que es como el documento
# marca sus encabezados en esta región.
SANGRIA_CENTRADO = 100.0


def parse_cierre(lines, pageno, sangria, desde):
    """Estructura las páginas que siguen al último artículo."""
    hitos, actual, esperando = [], None, None

    def nuevo(kind, **kw):
        nonlocal actual
        actual = dict(kind=kind, bloques=[], titulo='', **kw)
        hitos.append(actual)

    def add(tipo, **kw):
        actual['bloques'].append(dict(tipo=tipo, **kw))

    i = desde
    while i < len(lines):
        ln = lines[i].rstrip()
        x0, crudo = sangria[i], ln.strip()

        if ln.startswith(TBL_MARK):
            if actual is not None:
                add('tabla', id=ln[len(TBL_MARK):].split('|', 1)[1])
            i += 1
            continue
        if ln.startswith(IMG_MARK):
            if actual is not None:
                name, w, h = ln[len(IMG_MARK):].rsplit(':', 2)
                add('figura', src=name, w=int(w), h=int(h), page=pageno[i])
            i += 1
            continue
        if not crudo:
            i += 1
            continue

        u = unaccent(crudo).upper()
        m = RE_HITO_CIERRE.match(u)
        if m:
            if m.group(2):
                nuevo('titulo', num=int(m.group(2)), page=pageno[i],
                      id='titulo-%s' % m.group(2))
            elif m.group(3):
                nuevo('apendice', letra=m.group(3), page=pageno[i],
                      id='apendice-%s' % m.group(3),
                      informativo='INFORMATIVO' in u)
            else:
                nuevo('capitulo', num=10, page=pageno[i], id='capitulo-10')
            esperando = actual
            i += 1
            continue

        if actual is None:
            i += 1
            continue

        # «(Informativo)» va en su propio renglón en el Apéndice B, justo donde
        # iría el nombre, y no es el nombre.
        if actual['kind'] == 'apendice' and re.fullmatch(r'\(Informativo\)', crudo, re.I):
            actual['informativo'] = True
            i += 1
            continue

        # El nombre del hito son las líneas centradas que siguen al encabezado,
        # y se corta en la primera que no lo esté. Sin ese corte, el Apéndice B
        # --que el DOF no nombra-- se quedaba con la primera celda suelta que
        # apareciera más abajo.
        if esperando is not None:
            if x0 >= SANGRIA_CENTRADO and not crudo[:1].islower():
                esperando['titulo'] = (esperando['titulo'] + ' ' + crudo).strip()
                i += 1
                continue
            esperando = None

        if RE_INFORMATIVO.search(crudo):
            actual['informativo'] = True

        if x0 >= SANGRIA_CENTRADO and not crudo[:1].islower():
            add('titulo', text=crudo)
            i += 1
            continue

        m = RE_ITEM_CIERRE.match(crudo)
        if m and x0 in SANGRIA_PARRAFO:
            add('item', label=m.group(1), text=m.group(2))
            i += 1
            continue

        prev = actual['bloques'][-1] if actual['bloques'] else None
        continua = x0 == SANGRIA_CONT or (x0 >= SANGRIA_CENTRADO and crudo[:1].islower())
        if continua and prev and prev['tipo'] in ('parrafo', 'item', 'titulo', 'subtitulo'):
            prev['text'] = (prev['text'] + ' ' + crudo).strip()
            i += 1
            continue
        if x0 == 68.8 and prev and prev['tipo'] == 'item':
            prev['text'] = (prev['text'] + ' ' + crudo).strip()
            i += 1
            continue

        add('subtitulo' if RE_SUBTIT_CIERRE.match(crudo) else 'parrafo', text=crudo)
        i += 1
    return hitos


def texto_cierre(hitos):
    """Todo el texto del cierre, para contar cobertura y recoger referencias."""
    out = []
    for h in hitos:
        out.append(h.get('titulo') or '')
        for b in h['bloques']:
            out.append(b.get('text') or '')
    return ' '.join(x for x in out if x)


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
            skip.setdefault(r['page'], []).append((r['y0'], r['y1'], r['id']))
            if r['id'] not in vistas:      # solo la primera página de la tabla
                vistas.add(r['id'])
                marcas.append((r['page'], r['y0'], r.get('article'), r['id']))

    # Lo que cada tabla capturó de veras: celdas, notas, título y encabezado.
    # Es contra esto que se decide si un renglón que cae en la zona de una tabla
    # es suyo o es texto normativo que la zona se está comiendo. Ver
    # `rescatable()` en build_linemap.
    texto_tablas = {}
    tpath = os.path.join(out, 'tablas.json')
    if os.path.exists(tpath):
        for t in json.load(open(tpath)):
            trozos = [t.get('title'), t.get('intro')]
            trozos.extend(t.get('notes') or [])
            for fila in t.get('rows') or []:
                trozos.extend(c.get('t') for c in fila)
            texto_tablas[t['id']] = re.sub(
                r'\s+', ' ', unaccent(' '.join(x for x in trozos if x))).lower()

    img_dir = os.environ.get('NOM_IMG_DIR', 'site/public/img')
    images = extract_images(pdf, img_dir)

    lines, pageno, sangria = build_linemap(pages, pdf=pdf, skip=skip, images=images,
                                  marcas=marcas, texto_tablas=texto_tablas)
    toc, chapters, titulos = parse_toc(pages)
    starts = find_articles(lines, pageno, toc)

    # Dónde deja de haber articulado. El último artículo llegaba hasta el final
    # del PDF y se tragaba el Capítulo 10, los Títulos 6 a 8 y los tres
    # Apéndices; ver `parse_cierre`.
    corte_cierre = next(
        (i for i, ln in enumerate(lines)
         if pageno[i] > 700 and unaccent(ln).strip().upper().startswith('CAPITULO 10')),
        len(lines))

    order = sorted(starts, key=lambda n: starts[n])
    bounds = {}
    for idx, n in enumerate(order):
        lo = starts[n]
        hi = starts[order[idx + 1]] if idx + 1 < len(order) else corte_cierre
        bounds[n] = (lo, hi)

    articles, definitions, alcance_100 = [], [], ''
    for n in order:
        lo, hi = bounds[n]
        meta = toc[n]
        if n == 100:
            definitions, alcance_100 = parse_definitions(lines, pageno, lo, hi)
            body = {'parts': [{'letter': 'A', 'title': 'Definiciones generales'},
                              {'letter': 'B', 'title': 'Definiciones de más de 600 volts'}],
                    'sections': []}
        else:
            body = parse_article(n, lines, pageno, lo, hi, sangria)

        refs = set()
        for s in body['sections']:
            collect_refs(s, refs)
        art = {
            'num': n,
            'chapter': meta['chapter'],
            'title': meta['title'],
            'page': pageno[lo],
            'parts': body['parts'],
            'sections': body['sections'],
            'refs': sorted(refs),
        }
        if n == 100:
            art['alcance'] = alcance_100
        articles.append(art)

    cierre = parse_cierre(lines, pageno, sangria, corte_cierre)

    # El rótulo de una figura no sale del PDF: se captura a mano y se aplica
    # aquí, antes de escribir nada. Ver `aplicar_figuras`.
    figuras = aplicar_figuras(articles, cierre, img_dir,
                              os.path.join(out, 'figuras.json'))

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
        'cierre': cierre,
    }

    json.dump(corpus, open(os.path.join(out, 'corpus.json'), 'w'),
              ensure_ascii=False, indent=1)
    json.dump(definitions, open(os.path.join(out, 'definiciones.json'), 'w'),
              ensure_ascii=False, indent=1)

    # -------------------------------------------------------------- validación
    n_sec = sum(len(a['sections']) for a in articles)
    n_sub = sum(len(list(walk(s))) - 1 for a in articles for s in a['sections'])
    n_figs = sum(1 for f in figuras if f['kind'] == 'figura')
    n_form = sum(1 for f in figuras if f['kind'] == 'formula')
    n_rotulos = sum(len(f['rotulos']) for f in figuras)
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
            got.update(re.findall(r'\w+', unaccent(a.get('alcance', '')).lower()))
            for d in definitions:
                got.update(re.findall(
                    r'\w+', unaccent(d['term'] + ' ' + d['definition']).lower()))
        for s in a['sections']:
            for x in walk(s):
                got.update(re.findall(r'\w+', unaccent(
                    (x.get('title') or '') + ' ' + (x.get('text') or '')).lower()))
                for z in x.get('notes', []) + x.get('exceptions', []):
                    got.update(re.findall(r'\w+', unaccent(z['text']).lower()))
                    # Una NOTA o Excepción que anuncia una enumeración cuelga
                    # sus renglones en `items`, no en `text`: sin esto, cada
                    # elemento de la lista contaba como línea "no capturada"
                    # aunque estuviera íntegro en el corpus, solo que en otro
                    # campo. Así se leían como pérdidas reales las 518-4(a),
                    # 310-10(e), 725-121(a)(4)(3) y otras siete secciones.
                    for it in z.get('items', []):
                        got.update(re.findall(
                            r'\w+', unaccent(it.get('text', '')).lower()))
                # Los párrafos posteriores a una anotación viven en `parrafos`
                # y no en `text`; sin contarlos, cada uno se leía como línea
                # perdida aunque esté íntegro en el corpus.
                for z in x.get('parrafos', []):
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

    # La región de cierre se mide igual que el articulado. Sin esto, sacarla de
    # los límites del 924 la habría dejado fuera de la cuenta: la cobertura
    # seguiría diciendo 100% sobre 38 páginas menos, que es peor que el
    # problema que se venía a resolver.
    got_cierre = set(re.findall(r'\w+', unaccent(texto_cierre(cierre)).lower()))
    cierre_total = cierre_lost = 0
    for j in range(corte_cierre, len(lines)):
        ln = lines[j].strip()
        if len(ln) < 25 or ln.startswith(IMG_MARK) or ln.startswith(TBL_MARK):
            continue
        w = re.findall(r'\w+', unaccent(ln).lower())
        if not w:
            continue
        cierre_total += 1
        if sum(1 for x in w if x in got_cierre) / len(w) < 0.6:
            cierre_lost += 1
            if len(lost_examples) < 25:
                lost_examples.append({'articulo': 'cierre', 'linea': ln[:120]})
    lines_total += cierre_total
    lines_lost += cierre_lost

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
        'formulas': n_form,
        'cierre_bloques': sum(len(h['bloques']) for h in cierre),
        'cierre_hitos': [h['id'] for h in cierre],
        'cierre_lineas': cierre_total,
        'imagenes': len(figuras),
        'figuras_numeradas': n_rotulos,
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
    print('Figuras        : %d con %d número(s) de figura' % (n_figs, n_rotulos))
    print('Fórmulas       : %d (imágenes en total: %d en %s)'
          % (n_form, len(figuras), img_dir))
    print('Referencias    : %d distintas' % val['referencias_distintas'])
    print('Cobertura      : %.2f%% (%d de %d líneas de contenido)'
          % (val['cobertura_pct'], lines_total - lines_lost, lines_total))
    print('Cierre         : %d hitos, %d bloques, %d líneas de contenido'
          % (len(cierre), sum(len(h['bloques']) for h in cierre), cierre_total))
    print('Secciones vacías: %d' % len(empty))
    print('Artículos sin secciones: %s' % val['articulos_sin_secciones'])


if __name__ == '__main__':
    main()
