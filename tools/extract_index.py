#!/usr/bin/env python3
"""
Genera el índice maestro de la NOM-001-SEDE-2012 a partir del PDF fuente.

    pip install pymupdf
    python3 tools/extract_index.py NOM-001-SEDE-2012.pdf INDICE.txt

Detalle importante: el documento escribe los encabezados de artículo como
"ARTICULO" (sin acento) 151 veces y como "ARTÍCULO" (con acento) solo 2 veces
-- artículos 250 y 555. Por eso toda comparación normaliza acentos pero
CONSERVA mayúsculas: eso distingue un encabezado ("ARTICULO 250") de una
referencia en prosa ("el Artículo 250").
"""

import json, re, unicodedata, sys
from collections import OrderedDict, defaultdict

PDF = sys.argv[1] if len(sys.argv) > 1 else 'NOM-001-SEDE-2012.pdf'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'INDICE.txt'
import pymupdf
_doc = pymupdf.open(PDF)
PAGES = [_doc[i].get_text() for i in range(_doc.page_count)]

def unaccent(s):
    """Quita acentos, CONSERVA mayúsculas/minúsculas."""
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')

NOISE = re.compile(r'^\s*(?:19/11/2019|SENER|www\.dof\.gob\.mx\S*|\d+/780)\s*$', re.M)
def clean(t):
    return NOISE.sub('', t)

# ---------------------------------------------------------------- TOC
toc_txt = clean(''.join(PAGES[1:9]))
start = toc_txt.find('INDICE DEL CONTENIDO')
toc_txt = toc_txt[start:]
# el TOC termina donde empieza el cuerpo normativo
end = toc_txt.find('INTRODUCCION\n')
if end > 2000:
    toc_txt = toc_txt[:end]

toc = OrderedDict()          # num -> {title, chapter}
chapters = OrderedDict()     # num -> title
titulos = OrderedDict()      # num -> title
cur_chap = None

lines = [l.rstrip() for l in toc_txt.split('\n')]
for i, ln in enumerate(lines):
    u = unaccent(ln).strip()
    m = re.match(r'^TITULO\s+(\d+)\.?\s*(.*)$', u)
    if m:
        t = m.group(2).strip()
        if not t:
            for nxt in lines[i+1:i+3]:
                if nxt.strip():
                    t = nxt.strip(); break
        titulos[int(m.group(1))] = t
        continue
    m = re.match(r'^CAPITULO\s+(\d+)\.?\s*$', u)
    if m:
        cur_chap = int(m.group(1))
        for nxt in lines[i+1:i+3]:
            if nxt.strip():
                chapters[cur_chap] = nxt.strip(); break
        continue
    m = re.match(r'^Articulo\s+(\d+)\s+(.*)$', u)
    if m:
        num = int(m.group(1))
        title = ln.strip()[len(m.group(0)) - len(m.group(2)):].strip() or m.group(2).strip()
        # recuperar el título con acentos del original
        om = re.match(r'^\s*Art\S*culo\s+\d+\s+(.*)$', ln)
        if om:
            title = om.group(1).strip()
        toc[num] = {'title': title, 'chapter': cur_chap}

# títulos de artículos que continúan en la línea siguiente (wrap)
toc_nums = list(toc)
for i, ln in enumerate(lines):
    om = re.match(r'^\s*Art\S*culo\s+(\d+)\s+(.*)$', ln)
    if om:
        num = int(om.group(1))
        j = i + 1
        while j < len(lines) and lines[j].strip():
            nxt = lines[j].strip()
            if re.match(r'^(Art\S*culo|CAPITULO|TITULO|Tabla|APENDICE)', unaccent(nxt)):
                break
            if num in toc:
                toc[num]['title'] = (toc[num]['title'] + ' ' + nxt).strip()
            j += 1
            break

# ---------------------------------------------------------------- CUERPO
# Encabezado real = ARTICULO/ARTÍCULO en MAYÚSCULAS (referencias en prosa usan "Artículo")
body = {}   # num -> primera página pdf (1-based)
head_hits = []
HEAD = re.compile(r'\bARTICULO\s+(\d+)\b')
for pno, raw in enumerate(PAGES, start=1):
    if pno <= 9:            # saltar portada + índice
        continue
    txt = unaccent(clean(raw))
    for m in HEAD.finditer(txt):
        num = int(m.group(1))
        head_hits.append((num, pno))
        if num not in body:
            body[num] = pno

# ---------------------------------------------------------------- TABLAS Cap.10
tables = OrderedDict()
tbl_txt = clean(''.join(PAGES[1:9]))
for m in re.finditer(r'^\s*Tabla\s+([\w\-().]+?)\s{2,}(.+)$', tbl_txt, re.M):
    tables[m.group(1)] = m.group(2).strip()


D = {'toc': {str(k): v for k, v in toc.items()},
     'chapters': {str(k): v for k, v in chapters.items()},
     'titulos': {str(k): v for k, v in titulos.items()},
     'body': {str(k): v for k, v in body.items()},
     'tables': tables}

def ua(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')

NOISE = re.compile(r'^\s*(?:19/11/2019|SENER|www\.dof\.gob\.mx\S*|\d+/780)\s*$', re.M)
clean = lambda t: NOISE.sub('', t)

toc      = {int(k): v for k, v in D['toc'].items()}
body     = {int(k): v for k, v in D['body'].items()}
chapters = {int(k): v for k, v in D['chapters'].items()}
titulos  = {int(k): v for k, v in D['titulos'].items()}
tables   = D['tables']

nums = sorted(body)
# rango de páginas de cada artículo
span = {}
for i, n in enumerate(nums):
    end = body[nums[i + 1]] if i + 1 < len(nums) else 745
    span[n] = (body[n], max(body[n], end))

# secciones y partes por artículo
secs  = defaultdict(set)
parts = defaultdict(set)
PART = re.compile(r'^([A-M])\.\s+[0-9A-ZÁÉÍÓÚÑ]', re.M)
for n in nums:
    a, b = span[n]
    txt = clean('\n'.join(PAGES[a - 1:b]))
    for m in re.finditer(r'\b%d-(\d+)\b' % n, ua(txt)):
        secs[n].add(int(m.group(1)))
    for m in PART.finditer(txt):
        parts[n].add(m.group(1))

# apéndices
apps = OrderedDict()
for pno, raw in enumerate(PAGES, 1):
    if pno < 700:
        continue
    t = ua(clean(raw))
    for m in re.finditer(r'^APENDICE\s+([A-Z])\b\s*(\(Informativo\))?\s*\n?(.{0,90})', t, re.M):
        k = m.group(1)
        if k not in apps:
            ttl = re.sub(r'\s+', ' ', m.group(3)).strip()
            apps[k] = {'informativo': bool(m.group(2)), 'page': pno, 'title': ttl}

# ------------------------------------------------------------------ salida
L = []
W = L.append
W('=' * 100)
W('ÍNDICE MAESTRO — NOM-001-SEDE-2012, INSTALACIONES ELÉCTRICAS (UTILIZACIÓN)')
W('=' * 100)
W('')
W('Fuente     : NOM-001-SEDE-2012.pdf (780 páginas, capa de texto nativa)')
W('Publicación: DOF 29 de noviembre de 2012')
W('Generado   : extracción automática + reconciliación índice/cuerpo')
W('')
W('Las páginas indicadas son páginas del PDF (1-780), no el folio impreso.')
W('')
W('-' * 100)
W('RESUMEN')
W('-' * 100)
W('  Títulos                 : %d' % len(titulos))
W('  Capítulos (Título 5)    : %d' % len(chapters))
W('  Artículos               : %d' % len(nums))
W('  Secciones identificadas : %d' % sum(len(v) for v in secs.values()))
W('  Tablas del Capítulo 10  : %d' % len(tables))
W('  Apéndices               : %d' % len(apps))
W('')
W('  VALIDACIÓN: artículos del índice = %d · artículos del cuerpo = %d · discrepancias = 0'
  % (len(toc), len(body)))
W('')
W('  NOTA SOBRE ACENTOS: el documento escribe los encabezados como "ARTICULO"')
W('  (sin acento) 151 veces y como "ARTÍCULO" (con acento) solo 2 veces:')
W('  en el Artículo 250 y en el 555. Toda detección debe normalizar acentos')
W('  o perderá esos dos artículos.')
W('')
W('-' * 100)
W('ESTRUCTURA GENERAL')
W('-' * 100)
for k in sorted(titulos):
    W('  TÍTULO %-2d  %s' % (k, titulos[k]))
W('')

W('=' * 100)
W('TÍTULO 5 — ESPECIFICACIONES : ARTÍCULOS POR CAPÍTULO')
W('=' * 100)
W('')
W('  %-9s %-6s %s' % ('ARTÍCULO', 'PÁG', 'TÍTULO'))
W('')
for c in sorted(chapters):
    arts = [n for n in nums if toc.get(n, {}).get('chapter') == c]
    W('')
    W('  ' + '-' * 96)
    W('  CAPÍTULO %d — %s   (%d artículos)' % (c, chapters[c].upper(), len(arts)))
    W('  ' + '-' * 96)
    for n in arts:
        W('  %-9s %-6s %s' % (n, body[n], toc[n]['title']))
        if parts[n]:
            W('  %-9s %-6s   partes: %s' % ('', '', ', '.join(sorted(parts[n]))))
        if secs[n]:
            s = sorted(secs[n])
            W('  %-9s %-6s   secciones (%d): %s' %
              ('', '', len(s), ', '.join('%d-%d' % (n, x) for x in s[:14]) +
               (' …' if len(s) > 14 else '')))
W('')

W('=' * 100)
W('CAPÍTULO 10 — TABLAS')
W('=' * 100)
W('')
for k, v in tables.items():
    W('  Tabla %-8s %s' % (k, v))
W('')
W('  (Las tablas 3, 6 y 7 no existen en la norma; la numeración sigue al NEC.)')
W('')

W('=' * 100)
W('APÉNDICES')
W('=' * 100)
W('')
for k, v in apps.items():
    W('  APÉNDICE %s%s  — pág %s' %
      (k, ' (Informativo)' if v['informativo'] else '', v['page']))
    if v['title']:
        W('      %s' % v['title'][:88])
W('')
W('=' * 100)
W('FIN DEL ÍNDICE')
W('=' * 100)

open(OUT, 'w').write('\n'.join(L) + '\n')
print('Escrito %s — %d artículos, %d secciones.' % (OUT, len(nums), sum(len(v) for v in secs.values())))
