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

Las figuras se indexan con `kind: "fig"`, una por NÚMERO de figura y no por
imagen (el PDF imprime la 516-3(c)(1) y la (c)(2) en un solo dibujo). Antes no
existían en la búsqueda: buscar "autotransformador" no llevaba a la Figura
450-4 aunque sea justo lo que dibuja. Con ellas entra su texto transcrito, que
es la única forma de encontrar lo que la norma publica dentro de un mapa de
bits --la Excepción de 922-12(a)(2), por ejemplo--.

Las 225 tablas se indexan aparte, con `kind: "tabla"`: antes no aparecían en
absoluto en la búsqueda —"ampacidad conductores cobre" no encontraba la
310-15(b)(16) aunque sea la tabla más citada de la norma—, porque
flat_text() solo recorre el árbol de incisos y las tablas no viven ahí.
"""
import json, os, re, sys


def walk(n):
    yield n
    for c in n.get('children', []):
        yield from walk(c)


def inciso_ids(sec):
    # Todos los ids de los incisos descendientes -sin el de la sección
    # misma-, p.ej. ["310-15(a)", "310-15(a)(1)", ..., "310-15(b)"]. Sirve
    # para que la búsqueda del navegador salte directo al inciso exacto
    # cuando el código se escribe completo (p.ej. "310-15b16" o "310-15a"),
    # en vez de solo llegar al principio de la sección: la sección se indexa
    # completa por diseño (ver docstring del módulo), pero cada inciso ya
    # tiene su propio ancla en el HTML (ver Sub.astro) que hoy nadie apunta.
    out = []
    for c in sec.get('children', []):
        for n in walk(c):
            out.append(n['id'])
    return out


def flat_text(sec):
    out = []
    for n in walk(sec):
        out.append(n.get('title') or '')
        out.append(n.get('text') or '')
        out += [z['text'] for z in n.get('notes', [])]
        out += [z['text'] for z in n.get('exceptions', [])]
        out += [z['text'] for z in n.get('parrafos', [])]
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
                'incisos': inciso_ids(s),
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

    # Una figura por cada número que lleva impreso, no por imagen: quien busca
    # la 516-3(c)(2) no tiene por qué saber que comparte dibujo con la (c)(1).
    # Una fórmula no tiene número y entra por el inciso donde se imprime.
    figs = [(a['num'], n['id'], f)
            for a in corpus['articles'] for s_ in a['sections']
            for n in walk(s_) for f in n.get('figures', [])]
    figs += [(None, h['id'], b) for h in corpus.get('cierre', [])
             for b in h['bloques'] if b['tipo'] == 'figura']
    n_figs = 0
    for art, nodo, f in figs:
        comun = {
            'kind': 'fig',
            'art': art,
            'artTitle': titulo_articulo.get(art, ''),
        }
        cuerpo = list(f.get('transcripcion') or [])
        if f.get('nota'):
            cuerpo.append(f['nota'])
        for r in f.get('rotulos') or []:
            docs.append(dict(comun, id='figura:' + r['ancla'], ancla=r['ancla'],
                             fid=r['rotulo'], num=r['id'], title=r['titulo'] or '',
                             text=' '.join([r['titulo'] or ''] + cuerpo).strip()))
            n_figs += 1
        if not f.get('rotulos'):
            docs.append(dict(comun, id='figura:' + f['ancla'], ancla=f['ancla'],
                             fid='Fórmula de %s' % nodo, num=nodo,
                             title=f.get('titulo') or '',
                             text=' '.join([f.get('titulo') or ''] + cuerpo).strip()))
            n_figs += 1

    # La región de cierre: Capítulo 10, Títulos 6 a 8 y los tres Apéndices.
    # Hasta que tuvo estructura, su texto vivía revuelto dentro de 924-24 y
    # buscar «bibliografía» o «vigilancia» no llevaba a ninguna parte.
    ROTULO = {'capitulo': 'Capítulo %s', 'titulo': 'Título %s',
              'apendice': 'Apéndice %s'}
    n_cierre = 0
    for h in corpus.get('cierre', []):
        rotulo = ROTULO[h['kind']] % (h.get('letra') or h.get('num'))
        docs.append({
            'id': 'cierre:' + h['id'],
            'kind': 'cierre',
            'cid': h['id'],
            'fid': rotulo,
            'title': h['titulo'] or rotulo,
            'art': None,
            'artTitle': rotulo,
            'text': re.sub(r'\s+', ' ', ' '.join(
                [h['titulo'] or ''] + [b.get('text') or '' for b in h['bloques']])).strip(),
        })
        n_cierre += 1

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
    print('Documentos indexables: %d (%d tablas, %d figuras, %d del cierre)'
          % (len(docs), len(tablas), n_figs, n_cierre))
    print('search.json          : %.1f KB' % (size / 1024))


if __name__ == '__main__':
    main()
