#!/usr/bin/env python3
"""
Fase 2 — Grafo de referencias cruzadas de la NOM-001-SEDE-2012.

    python3 tools/build_graph.py data/

Lee data/corpus.json y genera:
    grafo.json     aristas origen→destino, backlinks y métricas
    indice.json    índice plano id→{titulo, articulo, pagina} para resolver enlaces

La norma se cita a sí misma constantemente ("de acuerdo con 250-32",
"según la Tabla 310-15(b)(16)"). En el PDF esas referencias son texto muerto.
Aquí se convierten en aristas navegables y, sobre todo, en BACKLINKS: dado un
requisito, qué otros requisitos dependen de él. Eso no existe en el documento
original y es lo que permite ver el impacto de un artículo antes de aplicarlo.
"""
import json, os, re, sys
from collections import defaultdict

# 250-32, 250-32(a), 250-32(a)(1)
RE_SEC_REF = re.compile(r'\b(\d{3})-(\d{1,3})((?:\([a-z0-9]{1,3}\))*)')
# Tabla 310-15(b)(16) | Tabla 8 | Tabla 11(A)
RE_TBL_REF = re.compile(r'Tabla\s+(\d{3}-\d{1,3}(?:\([a-z0-9]{1,3}\))*|\d{1,2}[A-Z]?(?:\([A-Z]\))?)')
# Artículo 250 / Artículos 500, 502 y 503
RE_ART_REF = re.compile(r'Art\S*culos?\s+((?:\d{3})(?:\s*(?:,|y|o|ó|a)\s*\d{3})*)')
# Capítulo 5
RE_CAP_REF = re.compile(r'Cap\S*tulo\s+(\d{1,2})')
# Parte C del Artículo 250
RE_PART_REF = re.compile(r'Parte\s+([A-M])\s+del\s+Art\S*culo\s+(\d{3})')


def walk(node):
    yield node
    for ch in node.get('children', []):
        yield from walk(ch)


def node_text(n):
    """Todo el texto propio de un nodo (sin descendientes)."""
    parts = [n.get('title') or '', n.get('text') or '']
    parts += [z['text'] for z in n.get('notes', [])]
    parts += [z['text'] for z in n.get('exceptions', [])]
    return ' '.join(parts)


def uso_de_tablas(tablas, texto, sec_ids):
    """Cuánto se apoya la norma en cada tabla, contado sobre el texto.

    No sirve contar aristas del grafo: una cita desnuda como "250-122" se
    resuelve antes a la SECCIÓN del mismo número, que también existe, y la
    tabla se queda sin crédito —la 250-122 salía con 22 citas cuando el texto
    la nombra 25 veces solo con la palabra "Tabla" delante—.

    Se cuentan dos formas y se elige la que no engaña para cada tabla:

    - `explicitas`: "Tabla 250-122". Siempre es la tabla, nunca la sección.
    - `menciones` : el identificador a secas. Vale cuando NO hay una sección
      con ese mismo id; si la hay, mezcla las dos cosas y no se usa.

    Las del Capítulo 10 se llaman con un número suelto ("Tabla 8"), así que
    ahí solo cuenta la forma explícita: buscar "8" a secas daría cada 8 del
    documento.
    """
    uso = {}
    for t in tablas:
        tid = t['id']
        esc = re.escape(tid)
        explicitas = len(re.findall(r'Tablas?\s+' + esc + r'(?![\w(-])', texto))
        suelto = re.fullmatch(r'\d{1,2}[A-Z]?(?:\([A-Z]\))?', tid)
        ambiguo = tid in sec_ids
        if suelto or ambiguo:
            menciones = explicitas
        else:
            menciones = len(re.findall(r'(?<![\w(-])' + esc + r'(?![\w(-])', texto))
        uso[tid] = {'explicitas': explicitas,
                    'usos': max(explicitas, menciones),
                    'ambiguo': bool(ambiguo)}
    return uso


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'data'
    corpus = json.load(open(os.path.join(out, 'corpus.json')))
    articles = corpus['articles']
    art_nums = {a['num'] for a in articles}
    art_title = {a['num']: a['title'] for a in articles}
    chapters = {c['num']: c['title'] for c in corpus['chapters']}

    # ------------------------------------------------------------- índice plano
    index = {}
    sec_ids = set()
    for a in articles:
        index['art:%d' % a['num']] = {
            'kind': 'articulo', 'id': str(a['num']), 'title': a['title'],
            'article': a['num'], 'chapter': a['chapter'], 'page': a['page'],
        }
        for s in a['sections']:
            for n in walk(s):
                index[n['id']] = {
                    'kind': 'seccion' if n is s else 'inciso',
                    'id': n['id'],
                    'title': n.get('title') or (n.get('text') or '')[:80],
                    'article': a['num'], 'chapter': a['chapter'],
                    'page': s.get('page'),
                }
                sec_ids.add(n['id'])

    # ------------------------------------------------------------- aristas
    edges = []          # (origen, destino, tipo)
    seen = set()

    def add(src, dst, kind):
        k = (src, dst, kind)
        if k not in seen and src != dst:
            seen.add(k)
            edges.append({'from': src, 'to': dst, 'type': kind})

    for a in articles:
        for s in a['sections']:
            for n in walk(s):
                src = n['id']
                txt = node_text(n)

                # --- Tablas (primero: consumen su propio patrón)
                tablas = set()
                for m in RE_TBL_REF.finditer(txt):
                    tablas.add(m.group(1))
                    add(src, 'tabla:' + m.group(1), 'tabla')

                # --- Secciones e incisos
                for m in RE_SEC_REF.finditer(txt):
                    num, sec, sub = int(m.group(1)), m.group(2), m.group(3)
                    if num not in art_nums:
                        continue
                    full = '%d-%s%s' % (num, sec, sub)
                    if full in tablas or ('%d-%s' % (num, sec)) in tablas:
                        continue
                    # resolver al nodo más específico que exista
                    target = full if full in sec_ids else '%d-%s' % (num, sec)
                    if target in sec_ids:
                        add(src, target, 'seccion')
                    elif num in art_nums:
                        add(src, 'art:%d' % num, 'articulo')

                # --- Artículos completos ("Artículos 500, 502 y 503")
                for m in RE_ART_REF.finditer(txt):
                    for g in re.findall(r'\d{3}', m.group(1)):
                        if int(g) in art_nums:
                            add(src, 'art:%d' % int(g), 'articulo')

                # --- Parte X del Artículo N
                for m in RE_PART_REF.finditer(txt):
                    if int(m.group(2)) in art_nums:
                        add(src, 'parte:%s:%s' % (m.group(2), m.group(1)), 'parte')

                # --- Capítulos
                for m in RE_CAP_REF.finditer(txt):
                    if int(m.group(1)) in chapters:
                        add(src, 'cap:%s' % m.group(1), 'capitulo')

    # ------------------------------------------------------------- backlinks
    outgoing = defaultdict(list)
    incoming = defaultdict(list)
    for e in edges:
        outgoing[e['from']].append(e['to'])
        incoming[e['to']].append(e['from'])

    # los backlinks de un inciso cuentan también para su sección padre,
    # que es como uno lo consulta en la práctica
    incoming_roll = defaultdict(set)
    for tgt, srcs in incoming.items():
        root = tgt.split('(')[0]
        for s in srcs:
            incoming_roll[root].add(s)

    resolved = sum(1 for e in edges if e['to'] in index or e['to'].startswith(
        ('tabla:', 'cap:', 'parte:')))
    broken = sorted({e['to'] for e in edges
                     if e['to'] not in index
                     and not e['to'].startswith(('tabla:', 'cap:', 'parte:'))})

    ranked = sorted(incoming_roll.items(), key=lambda kv: -len(kv[1]))[:30]

    tpath = os.path.join(out, 'tablas.json')
    tablas = json.load(open(tpath)) if os.path.exists(tpath) else []
    texto_norma = ' '.join(
        node_text(n) for a in articles for s_ in a['sections'] for n in walk(s_))
    uso_tablas = uso_de_tablas(tablas, texto_norma, sec_ids)

    graph = {
        'meta': {
            'aristas': len(edges),
            'nodos_con_salida': len(outgoing),
            'nodos_con_entrada': len(incoming),
            'referencias_rotas': len(broken),
        },
        'edges': edges,
        'outgoing': {k: sorted(set(v)) for k, v in outgoing.items()},
        'incoming': {k: sorted(v) for k, v in incoming_roll.items()},
        'mas_citados': [
            {'id': k,
             'citas': len(v),
             'titulo': index.get(k, {}).get('title', ''),
             'articulo': index.get(k, {}).get('article')}
            for k, v in ranked
        ],
        'rotas': broken[:100],
        # Cuánto se usa cada tabla, para ordenar la lista de revisión por
        # dónde duele más un error y no por el orden del documento.
        'uso_tablas': uso_tablas,
    }

    json.dump(graph, open(os.path.join(out, 'grafo.json'), 'w'),
              ensure_ascii=False, indent=1)
    json.dump(index, open(os.path.join(out, 'indice.json'), 'w'),
              ensure_ascii=False, indent=1)

    by_type = defaultdict(int)
    for e in edges:
        by_type[e['type']] += 1

    print('Nodos indexados      : %d' % len(index))
    print('Aristas              : %d' % len(edges))
    for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
        print('   %-10s %6d' % (k, v))
    print('Nodos que citan      : %d' % len(outgoing))
    print('Nodos citados        : %d' % len(incoming))
    print('Referencias rotas    : %d' % len(broken))
    print()
    print('Los 12 requisitos más citados de la norma:')
    for r in graph['mas_citados'][:12]:
        print('  %-14s %4d citas  %s' % (r['id'], r['citas'], (r['titulo'] or '')[:58]))


if __name__ == '__main__':
    main()
