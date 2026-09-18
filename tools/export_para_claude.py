#!/usr/bin/env python3
"""Destila el corpus a una carpeta pensada para leerse, no para consultarse.

data/ está armado para que Python resuelva búsquedas: JSON grande, anidado y
con metadatos de reconstrucción. Un Proyecto de Claude necesita lo contrario
—prosa en markdown y tablas planas— y solo de los artículos que se están
estudiando. Esto convierte lo uno en lo otro.

    python3 tools/export_para_claude.py            # bloque completo
    python3 tools/export_para_claude.py --solo-mt  # media tensión y líneas

Salida por omisión: export-claude/
"""

import argparse
import json
import os
import re
import sys

# Los artículos que se llevan al Proyecto, agrupados en archivos coherentes.
# Ocho archivos temáticos rinden más que doscientos archivos por sección: el
# contexto vecino es justamente lo que hace legible una norma.
BLOQUES = [
    ('01-art-110-220-230-240.md',
     'Generales, cálculo de cargas, acometidas y sobrecorriente',
     [110, 220, 230, 240]),
    ('02-art-250-puesta-a-tierra.md',
     'Puesta a tierra y unión',
     [250]),
    ('03-art-300-310-312-314.md',
     'Métodos de alambrado y conductores',
     [300, 310, 312, 314]),
    ('04-art-450-transformadores.md',
     'Transformadores y bóvedas',
     [450]),
    ('05-cap9-art-920-924.md',
     'Capítulo 9 — Instalaciones destinadas al servicio público',
     [920, 921, 922, 923, 924]),
]

# En fase de líneas de MT, el cálculo de cargas de inmuebles (220), las
# acometidas de usuario (230) y la protección de circuitos derivados (240)
# son de otro proyecto. Se quedan fuera y se recuperan quitando la bandera.
SOLO_MT = {110, 250, 300, 310, 312, 450, 920, 921, 922, 923, 924}

# Las tablas se agrupan por para qué se consultan, no por artículo.
GRUPOS_TABLAS = [
    ('06-tablas-ampacidad.json',
     'Ampacidad de conductores y sus factores de corrección',
     lambda tid, art: art == 310),
    ('07-tablas-demanda-y-pat.json',
     'Factores de demanda, puesta a tierra y protección de transformadores',
     lambda tid, art: art == 220 or tid in ('250-66', '250-122')
     or tid.startswith('450-3')),
    ('08-cap10-canalizaciones.json',
     'Capítulo 10 — llenado de canalizaciones y propiedades de conductores',
     lambda tid, art: art is None),
    ('09-tablas-cap9-servicio-publico.json',
     'Tablas del Capítulo 9: distancias, claros, flechas y tensiones',
     lambda tid, art: art in (920, 921, 922, 923, 924)),
]

# El nombre del archivo que recoge lo que no cae en ningún grupo temático. Ver
# el bloque que lo escribe en main().
RESTO_TABLAS = '10-tablas-de-los-articulos-incluidos.json'

# Las cuatro tablas cuyos valores el DOF imprime mal. El texto va aquí y no
# dentro del manifiesto para que éste pueda decir cuáles entraron de verdad en
# el recorte: con --solo-mt el artículo 220 se queda fuera y el manifiesto
# afirmaba igual que la 220-42 venía incluida. El detalle completo de cómo se
# detectó cada una está en REVISION-TABLAS.md.
ERRATAS_DEL_DOF = {
    '505-9(d)(1)': ('la columna de temperatura superficial máxima dice `≤4`, '
                    '`≤3`, `≤2`, `≤1`, `≤1`, `≤85`; por las clases T1–T6 '
                    'deberían ser 450, 300, 200, 135, 100 y 85 °C.'),
    '922-12(a)(2)': ('en la columna de flecha 2.5 m, las filas de 6 600 y '
                     '23 000 V dicen `96` y `105` donde el patrón pide `960` '
                     'y `1 050` mm.'),
    '220-42': ('el último tramo dice `A partir de 1 00000` por `A partir de '
               '100 000`.'),
    '430-250': ('la fila de 10 hp dice `44` en la columna de 575 V donde '
                'debería decir `11`.'),
}


# ---------------------------------------------------------------- tablas

def expandir_rejilla(rows):
    """Deshace rowspan y colspan y devuelve una matriz rectangular.

    Las celdas combinadas se repiten en cada posición que cubren, en lugar de
    dejar huecos: así el encabezado de un grupo («COBRE») queda pegado a cada
    una de sus columnas y el nombre de columna se puede componer leyendo la
    matriz hacia abajo, que es lo que evita el clásico corrimiento de una
    columna en las tablas de dos y tres niveles.
    """
    celdas = {}
    ocupado = set()
    for r, row in enumerate(rows):
        c = 0
        for cel in row:
            while (r, c) in ocupado:
                c += 1
            texto = (cel.get('t') or '').strip()
            rs = int(cel.get('rs', 1) or 1)
            cs = int(cel.get('cs', 1) or 1)
            for i in range(rs):
                for j in range(cs):
                    ocupado.add((r + i, c + j))
                    celdas[(r + i, c + j)] = texto
            c += cs
    if not celdas:
        return []
    nfilas = max(r for r, _ in celdas) + 1
    ncols = max(c for _, c in celdas) + 1
    return [[celdas.get((r, c), '') for c in range(ncols)]
            for r in range(nfilas)]


# Un nivel de encabezado más largo que esto describe la columna pero no la
# distingue —la lista de tipos de aislamiento de la 310-15(b)(16) mide 180
# caracteres—. Va aparte en `columnas`, no repetido en cada fila.
LARGO_MAX_NIVEL = 48


def nombres_columna(matriz, header_rows):
    """Nombre corto por columna, quedándose solo con lo que la distingue.

    El encabezado de la 310-15(b)(16) tiene cuatro niveles y compuesto entero
    da nombres de 180 caracteres, que se repetirían como clave en cada una de
    las 60 filas. Dos podas lo dejan en «75 °C | COBRE» sin perder nada:

    - el nivel idéntico en TODAS las columnas es título de la tabla, no nombre
      de columna, y se guarda una vez en `encabezado_comun`;
    - el nivel donde alguna columna se dispara de largo —la lista de tipos de
      aislamiento— describe pero no distingue, y se guarda en
      `columnas_encabezado_completo`.

    La decisión se toma por nivel y no por columna: si se podara columna por
    columna, «60 °C | TIPOS TW, UF | COBRE» convivría con «75 °C | COBRE» y los
    nombres dejarían de ser comparables entre sí.
    """
    if not matriz:
        return [], [], []
    ncols = len(matriz[0])
    if header_rows < 1:
        genericos = ['col_%d' % (c + 1) for c in range(ncols)]
        return genericos, [[] for _ in range(ncols)], []

    niveles = matriz[:min(header_rows, len(matriz))]
    comunes, utiles = [], []
    for fila in niveles:
        valores = [v.strip() for v in fila]
        if ncols > 1 and len(set(valores)) == 1 and valores[0]:
            comunes.append(valores[0])
        elif any(len(v) > LARGO_MAX_NIVEL for v in valores):
            continue
        else:
            utiles.append(valores)

    def componer(filas, c):
        partes = []
        for fila in filas:
            t = fila[c]
            # Una celda combinada se repitió hacia abajo: no la digas dos veces.
            if t and (not partes or partes[-1] != t):
                partes.append(t)
        return partes

    # Si podar dejó columnas sin nombre, la tabla no tenía ningún nivel corto:
    # más vale un nombre largo que un `col_3`.
    if not utiles or any(not componer(utiles, c) for c in range(ncols)):
        utiles = [[v.strip() for v in fila] for fila in niveles]
        comunes = []

    nombres = [' | '.join(componer(utiles, c)) for c in range(ncols)]
    pilas = [componer(niveles, c) for c in range(ncols)]

    # Dos columnas pueden acabar con el mismo nombre: tres «Condición» bajo el
    # mismo título, o dos que solo se diferenciaban en el nivel que se podó.
    # Se numeran para no perder ninguna al pasar a dict.
    vistos = {}
    salida = []
    for i, n in enumerate(nombres):
        n = n or 'col_%d' % (i + 1)
        vistos[n] = vistos.get(n, 0) + 1
        salida.append(n if vistos[n] == 1 else '%s (%d)' % (n, vistos[n]))
    return salida, pilas, comunes


def tabla_plana(t):
    """Una fila = un registro. Sin anidar por calibre, material y temperatura."""
    matriz = expandir_rejilla(t.get('rows') or [])
    header_rows = int(t.get('header_rows') or 0)
    columnas, pilas, comunes = nombres_columna(matriz, header_rows)
    filas = []
    for fila in matriz[header_rows:]:
        reg = {col: val for col, val in zip(columnas, fila)}
        if any(v.strip() for v in reg.values()):
            filas.append(reg)
    out = {
        'tabla': t['id'],
        'titulo': t.get('title', ''),
        'articulo': t.get('article'),
        'pagina_pdf': t.get('page'),
        'columnas': columnas,
        'filas': filas,
    }
    if comunes:
        out['encabezado_comun'] = comunes
    # El encabezado completo de cada columna, para las que se podaron: es donde
    # vive la lista de tipos de aislamiento, que es dato normativo.
    detalle = {col: pila for col, pila in zip(columnas, pilas)
               if ' | '.join(pila) != col}
    if detalle:
        out['columnas_encabezado_completo'] = detalle
    if t.get('intro'):
        out['condiciones'] = t['intro']
    if t.get('notes'):
        out['notas'] = t['notes']
    if t.get('informativa'):
        out['informativa'] = True
    if t.get('verificada'):
        out['verificada_contra_pdf'] = t['verificada']
    return out


# ------------------------------------------------------------- markdown

def limpiar(texto):
    return re.sub(r'\s+', ' ', (texto or '')).strip()


def anotacion(x, defecto):
    """Notas y excepciones vienen como {label, text} y a veces como string suelto.

    La etiqueta importa: «Excepción 2» y «NOTA 3» se citan por su número, así
    que se conserva en vez de aplanar todo a un genérico.
    """
    if isinstance(x, dict):
        etiqueta = limpiar(x.get('label')) or defecto
        return '%s: %s' % (etiqueta, limpiar(x.get('text')))
    return '%s: %s' % (defecto, limpiar(x))


def render_inciso(nodo, nivel, sal):
    """Escribe un inciso y sus hijos conservando el identificador literal."""
    ident = nodo.get('id', '')
    titulo = limpiar(nodo.get('title', ''))
    encabezado = '**%s**' % ident
    if titulo:
        encabezado += ' — %s' % titulo
    sal.append('%s%s' % ('  ' * (nivel - 1) + '- ', encabezado))
    texto = limpiar(nodo.get('text', ''))
    if texto:
        sal.append('%s%s' % ('  ' * nivel, texto))
    for nota in nodo.get('notes') or []:
        sal.append('%s%s' % ('  ' * nivel, anotacion(nota, 'NOTA')))
    for exc in nodo.get('exceptions') or []:
        sal.append('%s%s' % ('  ' * nivel, anotacion(exc, 'EXCEPCIÓN')))
    sal.append('')
    for hijo in nodo.get('children') or []:
        render_inciso(hijo, nivel + 1, sal)


def render_articulo(art, tablas_por_art):
    sal = []
    sal.append('## Artículo %s — %s' % (art['num'], art.get('title', '')))
    sal.append('')
    sal.append('*Capítulo %s · pág. %s del PDF*' % (art.get('chapter'), art.get('page')))
    sal.append('')
    if art.get('alcance'):
        sal.append(limpiar(art['alcance']))
        sal.append('')
    partes = {p['letter']: p.get('title', '') for p in art.get('parts') or []}
    ids_tabla = tablas_por_art.get(art['num'], [])
    if ids_tabla:
        sal.append('> Tablas de este artículo (van en los .json de tablas): %s'
                   % ', '.join(ids_tabla))
        sal.append('')
    parte_actual = None
    for sec in art.get('sections') or []:
        p = sec.get('part')
        if p and p != parte_actual:
            parte_actual = p
            sal.append('### Parte %s — %s' % (p, partes.get(p, '')))
            sal.append('')
        sal.append('### %s — %s' % (sec.get('id', ''), limpiar(sec.get('title', ''))))
        sal.append('')
        texto = limpiar(sec.get('text', ''))
        if texto:
            sal.append(texto)
            sal.append('')
        for nota in sec.get('notes') or []:
            sal.append(anotacion(nota, 'NOTA'))
            sal.append('')
        for exc in sec.get('exceptions') or []:
            sal.append(anotacion(exc, 'EXCEPCIÓN'))
            sal.append('')
        for hijo in sec.get('children') or []:
            render_inciso(hijo, 1, sal)
    return '\n'.join(sal)


CABECERA = """<!--
Destilado de NOM-001-SEDE-2012 para consulta. Generado por
tools/export_para_claude.py desde el PDF del DOF; no es el documento oficial.
Todo el texto de este archivo es normativo: no lleva glosas ni interpretación.
-->

"""


# ------------------------------------------------------------ referencias

def render_referencias(grafo, arts_incluidos, ids_tabla_incluidas):
    """Las referencias cruzadas: lo único que no se reconstruye leyendo lineal."""
    def art_de(ident):
        m = re.match(r'(\d+)', ident.replace('tabla:', ''))
        return int(m.group(1)) if m else None

    sal = [CABECERA.rstrip(), '', '# Referencias cruzadas', '',
           'Qué manda a qué dentro de la norma. Extraído de `data/grafo.json`, ',
           'que resuelve las remisiones del texto («... de acuerdo con el ',
           'Artículo 250») a identificadores. Solo se listan las que salen de ',
           'un artículo incluido en este export.', '']

    salientes = {}
    for e in grafo.get('edges') or []:
        origen, destino = e['from'], e['to']
        a = art_de(origen)
        if a in arts_incluidos:
            salientes.setdefault(origen, []).append(destino)

    sal.append('## Remisiones por sección')
    sal.append('')
    for origen in sorted(salientes, key=lambda s: (art_de(s) or 0, s)):
        destinos = sorted(set(salientes[origen]))
        sal.append('- **%s** → %s' % (origen, ', '.join(destinos)))
    sal.append('')

    mas = grafo.get('mas_citados') or []
    if mas:
        sal.append('## Lo más citado de toda la norma')
        sal.append('')
        sal.append('Un número alto aquí significa que esa sección es una '
                   'dependencia de medio documento.')
        sal.append('')
        for item in mas[:40]:
            if isinstance(item, dict):
                sal.append('- **%s** — citado %s veces'
                           % (item.get('id'), item.get('n', item.get('count'))))
            else:
                sal.append('- %s' % (item,))
        sal.append('')

    uso = grafo.get('uso_tablas') or {}
    if uso:
        sal.append('## Quién usa cada tabla')
        sal.append('')
        for tid in sorted(uso):
            if ids_tabla_incluidas and tid.replace('tabla:', '') not in ids_tabla_incluidas:
                continue
            quien = uso[tid]
            quien = ', '.join(sorted(set(quien))) if isinstance(quien, list) else str(quien)
            sal.append('- **%s** — se invoca desde %s' % (tid, quien))
        sal.append('')
    return '\n'.join(sal)


def render_definiciones(defs):
    sal = [CABECERA.rstrip(), '', '# Definiciones (Artículo 100)', '',
           'Los términos tal como los define la norma. Cuando una definición y '
           'el uso común difieren, manda ésta.', '']
    for d in defs:
        termino = d.get('term') or d.get('termino') or ''
        texto = limpiar(d.get('definition') or d.get('definicion') or '')
        parte = d.get('parte') or d.get('part') or ''
        marca = ' *(Parte B, >600 V)*' if str(parte).upper() == 'B' else ''
        sal.append('**%s**%s — %s' % (termino, marca, texto))
        sal.append('')
    return '\n'.join(sal)


# ----------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', default='data', help='carpeta con los JSON del repo')
    ap.add_argument('--out', default='export-claude', help='carpeta de salida')
    ap.add_argument('--solo-mt', action='store_true',
                    help='deja fuera 220, 230 y 240 (cargas y acometidas de usuario)')
    args = ap.parse_args()

    def leer(nombre):
        with open(os.path.join(args.data, nombre), encoding='utf-8') as fh:
            return json.load(fh)

    corpus = leer('corpus.json')
    tablas = leer('tablas.json')
    grafo = leer('grafo.json')
    try:
        defs = leer('definiciones.json')
    except FileNotFoundError:
        defs = []

    os.makedirs(args.out, exist_ok=True)
    por_num = {a['num']: a for a in corpus['articles']}
    tablas_por_art = {}
    for t in tablas:
        tablas_por_art.setdefault(t.get('article'), []).append(t['id'])

    quiero = SOLO_MT if args.solo_mt else None
    manifiesto = []
    incluidos = set()

    # --- markdown por bloque temático
    for nombre, desc, nums in BLOQUES:
        completo = list(nums)
        nums = [n for n in nums if quiero is None or n in quiero]
        if not nums:
            continue
        if nums != completo:
            # El recorte dejó fuera artículos: el nombre del archivo tiene que
            # decir lo que trae, o `01-art-110-220-230-240.md` mentiría con
            # solo el 110 dentro.
            nombre = '%s-art-%s.md' % (nombre.split('-', 1)[0],
                                       '-'.join(str(n) for n in nums))
        partes = [CABECERA.rstrip(), '', '# %s' % desc, '']
        hechos = []
        for n in nums:
            art = por_num.get(n)
            if art is None:
                print('aviso: el artículo %s no está en el corpus' % n, file=sys.stderr)
                continue
            partes.append(render_articulo(art, tablas_por_art))
            partes.append('')
            hechos.append(n)
            incluidos.add(n)
        ruta = os.path.join(args.out, nombre)
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(partes))
        manifiesto.append((nombre, desc,
                           'Artículos %s' % ', '.join(str(n) for n in hechos),
                           os.path.getsize(ruta)))

    # --- tablas planas por grupo
    ids_tabla = set()
    for nombre, desc, filtro in GRUPOS_TABLAS:
        sel = [t for t in tablas if filtro(t['id'], t.get('article'))]
        if quiero is not None:
            sel = [t for t in sel
                   if t.get('article') is None or t['article'] in quiero]
        if not sel:
            continue
        planas = [tabla_plana(t) for t in sel]
        ids_tabla.update(p['tabla'] for p in planas)
        ruta = os.path.join(args.out, nombre)
        with open(ruta, 'w', encoding='utf-8') as fh:
            json.dump(planas, fh, ensure_ascii=False, indent=1)
        manifiesto.append((nombre, desc,
                           '%d tablas: %s' % (len(planas),
                                              ', '.join(p['tabla'] for p in planas)),
                           os.path.getsize(ruta)))

    # --- el resto de las tablas de los artículos incluidos
    #
    # Los cuatro grupos de arriba están armados por PARA QUÉ se consulta cada
    # tabla, y eso deja fuera a las que no encajan en ninguno de los cuatro
    # temas: las de los artículos 110, 240, 300, 312, 314, 352, 400 y 402. El
    # markdown sí las cita —«se debe calcular como se indica en la Tabla
    # 314-16(a)»— así que el export prometía 19 tablas que no estaban en
    # ningún archivo y mandaba a buscarlas a un sitio donde no había nada.
    resto = sorted((t for t in tablas
                    if t.get('article') in incluidos
                    and t['id'] not in ids_tabla),
                   key=lambda t: (t['article'], t['id']))
    if resto:
        planas = [tabla_plana(t) for t in resto]
        ids_tabla.update(p['tabla'] for p in planas)
        ruta = os.path.join(args.out, RESTO_TABLAS)
        with open(ruta, 'w', encoding='utf-8') as fh:
            json.dump(planas, fh, ensure_ascii=False, indent=1)
        manifiesto.append((RESTO_TABLAS,
                           'Las demás tablas de los artículos incluidos',
                           '%d tablas: %s' % (len(planas),
                                              ', '.join(p['tabla'] for p in planas)),
                           os.path.getsize(ruta)))

    # --- referencias cruzadas
    nombre = '11-referencias-cruzadas.md'
    ruta = os.path.join(args.out, nombre)
    with open(ruta, 'w', encoding='utf-8') as fh:
        fh.write(render_referencias(grafo, incluidos, ids_tabla))
    manifiesto.append((nombre, 'Qué artículo remite a cuál, y quién usa cada tabla',
                       'Derivado de grafo.json', os.path.getsize(ruta)))

    # --- definiciones
    if defs:
        nombre = '12-definiciones.md'
        ruta = os.path.join(args.out, nombre)
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write(render_definiciones(defs))
        manifiesto.append((nombre, 'Definiciones del Artículo 100',
                           '%d términos' % len(defs), os.path.getsize(ruta)))

    escribir_manifiesto(args, manifiesto, incluidos, ids_tabla)

    total = sum(m[3] for m in manifiesto)
    print('%s: %d archivos, %.1f KB en total'
          % (args.out, len(manifiesto) + 1, total / 1024.0))
    for nombre, _, _, tam in manifiesto:
        print('  %-42s %7.1f KB' % (nombre, tam / 1024.0))


def escribir_manifiesto(args, manifiesto, incluidos, ids_tabla):
    """El archivo que más rinde: sin él hay que abrir los demás a ciegas."""
    sal = ['# Manifiesto del export — NOM-001-SEDE-2012', '']
    sal.append('Destilado de la NOM-001-SEDE-2012 (Instalaciones Eléctricas '
               '—Utilización), reconstruido desde el PDF publicado en el DOF.')
    sal.append('')
    sal.append('**Qué es y qué no.** Todo el texto de estos archivos es '
               'normativo: se transcribe, no se interpreta. No hay glosas ni '
               'notas de lectura. Si en algún momento se agregan, van marcadas '
               'como `> NOTA PROPIA:` y solo así.')
    sal.append('')
    sal.append('## Cómo está numerado')
    sal.append('')
    sal.append('Los identificadores se conservan **literales, tal como los cita '
               'la norma**: `923-4(b)(2)`, `310-15(b)(16)`, `250-122`. Se puede '
               'preguntar por uno directamente y aparece con ese string exacto '
               'en el archivo que le toca.')
    sal.append('')
    sal.append('- Artículo → `923`')
    sal.append('- Sección → `923-4`')
    sal.append('- Incisos → `923-4(b)`, `923-4(b)(2)`, anidados por niveles')
    sal.append('- Tablas → mismo identificador, en los `.json`, campo `tabla`')
    sal.append('')
    sal.append('## Qué hay en cada archivo')
    sal.append('')
    sal.append('| Archivo | Contenido | Detalle | Tamaño |')
    sal.append('| --- | --- | --- | --- |')
    for nombre, desc, detalle, tam in manifiesto:
        if len(detalle) > 160:
            detalle = detalle[:157] + '...'
        sal.append('| `%s` | %s | %s | %.0f KB |' % (nombre, desc, detalle, tam / 1024.0))
    sal.append('')
    sal.append('## Formato de las tablas')
    sal.append('')
    sal.append('Una fila del PDF = un registro plano. Nada de anidar por '
               'calibre → material → temperatura: los encabezados de varios '
               'niveles se aplanan componiendo el nombre de columna con ` | `, '
               'de modo que la ampacidad de cobre a 75 °C de la 310-15(b)(16) '
               'está en la columna `75 °C | COBRE`. Cada tabla trae '
               '`condiciones` (el texto que la precede en el PDF: temperatura '
               'ambiente, número de conductores) y `notas`, que **modifican los '
               'valores** y no son decorativas.')
    sal.append('')
    sal.append('```json')
    sal.append('{"tabla": "310-15(b)(16)",')
    sal.append(' "titulo": "Ampacidades permisibles en conductores aislados...",')
    sal.append(' "condiciones": "...", "notas": ["..."],')
    sal.append(' "columnas": ["Tamaño o designación | AWG o kcmil", "75 °C | COBRE"],')
    sal.append(' "filas": [{"Tamaño o designación | AWG o kcmil": "1/0",')
    sal.append('            "75 °C | COBRE": "150"}]}')
    sal.append('```')
    sal.append('')
    sal.append('Para que el nombre de columna no midiera 180 caracteres '
               'repetidos en cada fila, se podan dos niveles del encabezado. '
               'Ninguno se pierde:')
    sal.append('')
    sal.append('- `encabezado_comun` — el nivel que era idéntico en todas las '
               'columnas (es título de la tabla, no nombre de columna).')
    sal.append('- `columnas_encabezado_completo` — el encabezado íntegro de '
               'cada columna. Ahí vive, por ejemplo, la lista de tipos de '
               'aislamiento (`TIPOS RHW, THHW, THW, THWN, XHHW, USE, ZW`) que '
               'dice a qué conductores aplica esa columna, y que es dato '
               'normativo: si el tipo que se está usando no está en la lista, '
               'esa columna no es la suya.')
    sal.append('')
    sal.append('Los valores van como string, tal como los imprime el DOF: hay '
               'celdas con rangos (`0 – 3.14`), con separador de miles a la '
               'mexicana (`1 050`) y con notas pegadas. Convertir a número aquí '
               'sería inventar criterio.')
    sal.append('')
    sal.append('## Erratas del PDF de origen')
    sal.append('')
    sal.append('Cuatro tablas de la norma traen valores mal impresos **en el '
               'DOF** y se dejaron tal cual, porque corregirlos sería editar la '
               'norma.')
    sal.append('')
    # Qué erratas entraron se decide contra las tablas REALMENTE escritas y no
    # con una lista fija: el recorte cambia con --solo-mt y con los artículos
    # de BLOQUES, y una lista fija acababa afirmando que la 220-42 venía
    # incluida en un export que no trae el artículo 220.
    dentro = [(t, d) for t, d in ERRATAS_DEL_DOF.items() if t in ids_tabla]
    fuera = [(t, d) for t, d in ERRATAS_DEL_DOF.items() if t not in ids_tabla]
    if dentro:
        sal.append('%s de ellas %s en este export:'
                   % (('Una' if len(dentro) == 1 else '%d' % len(dentro)),
                      'está' if len(dentro) == 1 else 'están'))
        sal.append('')
        for tid, det in dentro:
            sal.append('- **%s** — %s' % (tid, det))
        sal.append('')
    else:
        sal.append('Ninguna de las cuatro entra en este recorte.')
        sal.append('')
    if fuera:
        sal.append('%s quedan fuera del recorte: %s.'
                   % ('Las otras' if dentro else 'Las cuatro',
                      ', '.join('**%s**' % t for t, _ in fuera)))
        sal.append('')
    sal.append('Las cuatro están en `REVISION-TABLAS.md` del repo con el '
               'detalle de cómo se detectaron.')
    sal.append('')
    sal.append('## Alcance de este export')
    sal.append('')
    if args.solo_mt:
        sal.append('Generado con `--solo-mt`: **fuera** los artículos 220 '
                   '(cálculo de cargas), 230 (acometidas) y 240 (sobrecorriente '
                   'de circuitos derivados), que son de instalación de usuario. '
                   'Se recuperan regenerando sin la bandera.')
    else:
        sal.append('Bloque completo. Fuera quedó lo que no toca este tema: '
                   'lugares peligrosos, anuncios luminosos, albercas, equipo de '
                   'rayos X y demás ambientes especiales.')
    sal.append('')
    sal.append('Artículos incluidos: %s.'
               % ', '.join(str(n) for n in sorted(incluidos)))
    sal.append('')
    sal.append('Fuente completa, con el PDF y el buscador: '
               'https://github.com/dflores296/NOM-001-SEDE-2012')
    sal.append('')
    with open(os.path.join(args.out, '00-manifiesto.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(sal))


if __name__ == '__main__':
    main()
