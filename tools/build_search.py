#!/usr/bin/env python3
"""
Fase 3 — Índice de búsqueda para el navegador.

    python3 tools/build_search.py data/ site/public/data/

Emite search.json: un documento por sección y por definición, con el texto de
sus incisos aplanado. Se indexa en el navegador con MiniSearch al primer uso,
así que el usuario no descarga nada hasta que busca algo.

Se indexa a nivel de SECCIÓN y no de inciso a propósito: 2 900 documentos
caben holgadamente en memoria y buscar "GFCI" debe llevar a 210-8 completo,
no a siete fragmentos sueltos del mismo requisito.
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


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'site/public/data'
    os.makedirs(dst, exist_ok=True)

    corpus = json.load(open(os.path.join(src, 'corpus.json')))
    defs = json.load(open(os.path.join(src, 'definiciones.json')))

    docs = []
    for a in corpus['articles']:
        for s in a['sections']:
            docs.append({
                'id': s['id'],
                'title': s.get('title', ''),
                'art': a['num'],
                'artTitle': a['title'],
                'text': flat_text(s),
            })
    for d in defs:
        docs.append({
            'id': d['term'],
            'title': d['term'],
            'art': 100,
            'artTitle': 'Definiciones',
            'text': d['definition'],
        })

    # MiniSearch usa el campo `id` como clave del documento. Los ids de sección
    # y los términos del glosario ya son únicos entre sí; se verifica porque un
    # duplicado silencioso haría desaparecer resultados de la búsqueda.
    seen = {}
    for d in docs:
        if d['id'] in seen:
            raise SystemExit('id duplicado en el índice de búsqueda: %r' % d['id'])
        seen[d['id']] = True

    out = os.path.join(dst, 'search.json')
    json.dump(docs, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(out)
    print('Documentos indexables: %d' % len(docs))
    print('search.json          : %.1f KB' % (size / 1024))


if __name__ == '__main__':
    main()
