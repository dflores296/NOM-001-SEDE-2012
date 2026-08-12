#!/usr/bin/env python3
"""
Fase 3 — Índice de búsqueda para el navegador.

    python3 tools/build_search.py data/ site/public/data/

Emite search.json: un documento por sección, por definición y por tabla, con
el texto de sus incisos (o celdas) aplanado. Se indexa en el navegador con
MiniSearch al primer uso, así que el usuario no descarga nada hasta que
busca algo.

Se indexa a nivel de SECCIÓN y no de inciso a propósito: 2 900 documentos
caben holgadamente en memoria y buscar "GFCI" debe llevar a 210-8 completo,
no a siete fragmentos sueltos del mismo requisito.

Las 220 tablas se indexan aparte, con `kind: "tabla"`: antes no aparecían en
absoluto en la búsqueda —"ampacidad conductores cobre" no encontraba la
310-15(b)(16) aunque sea la tabla más citada de la norma—, porque
flat_text() solo recorre el árbol de incisos y las tablas no viven ahí.
"""
import json, os, re, sys


def walk(n):
    yield n
    for c in n.get('children', []):
        yield from walk(c)


def flat_text(sec):
    out = []
    for n in walk(sec):
        out.append(n.get('title') or '')
        out.append(n.get('text') or '')
        out += [z['text'] for z in n.get('notes', [])]
        out += [z['text'] for z in n.get('exceptions', [])]
    return re.sub(r'\s+', ' ', ' '.join(x for x in out if x)).strip()


def flat_text_tabla(t):
    out = [t.get('title') or '', t.get('intro') or '']
    out += t.get('notes', [])
    for row in t.get('rows', []):
        out += [c['t'] for c in row if c.get('t')]
    return re.sub(r'\s+', ' ', ' '.join(x for x in out if x)).strip()


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'site/public/data'
    os.makedirs(dst, exist_ok=True)

    corpus = json.load(open(os.path.join(src, 'corpus.json')))
    defs = json.load(open(os.path.join(src, 'definiciones.json')))
    tablas = json.load(open(os.path.join(src, 'tablas.json')))
    titulo_articulo = {a['num']: a['title'] for a in corpus['articles']}

    docs = []
    for a in corpus['articles']:
        for s in a['sections']:
            docs.append({
                'id': s['id'],
                'kind': 'sec',
                'title': s.get('title', ''),
                'art': a['num'],
                'artTitle': a['title'],
                'text': flat_text(s),
            })
    for d in defs:
        docs.append({
            'id': d['term'],
            'kind': 'def',
            'title': d['term'],
            'art': 100,
            'artTitle': 'Definiciones',
            'text': d['definition'],
        })
    for t in tablas:
        # Prefijo para no chocar con ids de sección o de glosario: una tabla
        # de artículo puede llevar el mismo id que el inciso donde vive (la
        # 922-12(a)(1) es a la vez tabla y sección de anclaje).
        docs.append({
            'id': 'tabla:' + t['id'],
            'kind': 'tabla',
            'tid': t['id'],
            'sinNumero': bool(t.get('sin_numero')),
            'title': t.get('title') or '',
            'art': t.get('article'),
            'artTitle': titulo_articulo.get(t.get('article'), 'Capítulo 10'),
            'text': flat_text_tabla(t),
        })

    # MiniSearch usa el campo `id` como clave del documento. Los ids de
    # sección, los términos del glosario y las tablas (con su prefijo
    # `tabla:`) ya son únicos entre sí; se verifica porque un duplicado
    # silencioso haría desaparecer resultados de la búsqueda.
    seen = {}
    for d in docs:
        if d['id'] in seen:
            raise SystemExit('id duplicado en el índice de búsqueda: %r' % d['id'])
        seen[d['id']] = True

    out = os.path.join(dst, 'search.json')
    json.dump(docs, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(out)
    print('Documentos indexables: %d (%d tablas)' % (len(docs), len(tablas)))
    print('search.json          : %.1f KB' % (size / 1024))


if __name__ == '__main__':
    main()
