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
#
# El espacio y el punto sueltos antes del paréntesis son cosa del DOF, no otra
# forma de citar: la norma escribe «Tabla 312-6 (a)», «Tabla 310-104 (a)»,
# «Tabla 430-251 (a)» y hasta «Tabla 430-22.(e)» junto a las formas pegadas. Sin
# tolerarlos, la cita se cortaba en el identificador del padre —«312-6», que no
# es ninguna tabla— y el enlace acababa en un ancla muerta de /tablas.
#
# El lookahead final protege la forma corta del Capítulo 10. Cuando una
# referencia viene partida por el corte de línea y en el texto queda «Tabla
# 230-», la primera alternativa no calza y la segunda se quedaba con «23»,
# inventando una tabla del Capítulo 10 que no existe. Eran 8 de las 20
# referencias a tablas inexistentes.
RE_TBL_REF = re.compile(
    r'Tabla\s+(\d{3}-\d{1,3}(?:\s*\.?\s*\([a-z0-9]{1,3}\))*'
    r'|\d{1,2}[A-Z]?(?:\([A-Z]\))?(?![\d-]))')

# El DOF numera mal el título de una tabla y la deja inalcanzable desde el texto
# que la cita. Es el mismo defecto que escondía la 408-56 y la 685-3, solo que
# aquí el título sí se detecta: lo que no cuadra es el número.
ERRATAS_TABLAS = {
    # El cuerpo de 300-1(c) dice "tal como se indica en la Tabla 300-1(c)" y
    # justo debajo imprime esa misma tabla titulada "Tabla 300-16(c).-
    # Designación métrica y tamaños comerciales", que es palabra por palabra el
    # título del inciso que la cita. El número del título es el equivocado.
    '300-1(c)': '300-16(c)',
}

# Destinos que no son tabla de esta norma. No son fallos del parseo, y se
# listan uno por uno con su cita para que el conteo de referencias rotas pueda
# quedar en cero sin esconder una tabla que sí exista y se nos escape.
TABLAS_AUSENTES = {
    # "este conductor se debe dimensionar de acuerdo con la Tabla 250-30(a)(3)"
    # (pág. 577).
    '250-30(a)(3)',
    # "se deben marcar de acuerdo con lo establecido en la Tabla 760-176(g)"
    # (pág. 649).
    '760-176(g)',
    # No es una cita: "Tabla 515-2" es una celda de la columna «Sección» del
    # listado de normas del Apéndice B (pág. 770), que enumera qué partes de la
    # NOM remiten a la NFPA 30.
    '515-2',
    # El DOF escribe "Tabla 310-15(B(3))(a)" en 310-15(b)(3)(a): paréntesis mal
    # cerrados y la letra en mayúscula. La tabla que quiere citar es la
    # 310-15(b)(3)(a), que sí existe y que ese mismo inciso cita bien dos
    # renglones antes.
    '310-15',
    # Tablas de OTRA norma. La nota de 924-24(9) sobre el separador decimal
    # cita "el encabezado de la Tabla 13 ... y el apartado Signo decimal de la
    # Tabla 21 de la Norma Oficial Mexicana NOM-008-SCFI-2002".
    '13',
    '21',
}
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
    parts += [z['text'] for z in n.get('parrafos', [])]
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
                    crudo = m.group(1)
                    tid = re.sub(r'\.(?=\()', '', re.sub(r'\s+', '', crudo))
                    tid = ERRATAS_TABLAS.get(tid, tid)
                    tablas.add(tid)
                    if tid != crudo:
                        # «Tabla 312-6 (a)»: el buscador de secciones de más
                        # abajo solo alcanza a ver «312-6», así que hay que
                        # marcarlo como ya consumido o añadiría, además de la
                        # arista a la tabla, otra a la sección del mismo número.
                        tablas.add(crudo.split('(')[0].strip().rstrip('.'))
                    add(src, 'tabla:' + tid, 'tabla')

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

    tpath = os.path.join(out, 'tablas.json')
    tablas = json.load(open(tpath)) if os.path.exists(tpath) else []
    tabla_ids = {t['id'] for t in tablas}
    # La norma imprime la Tabla 240-92(b) como imagen, no como rejilla, así que
    # no está entre las 226 reconstruidas y su cita se daba por rota: el
    # comentario de TABLAS_AUSENTES decía "no hay tabla con ese número" y sí la
    # hay, en la página 82. Vive capturada como figura de tipo `tabla`, y desde
    # ahí es un destino tan bueno como cualquier otro.
    tabla_ids |= {r['id'] for a in articles for s_ in a['sections']
                  for n in walk(s_) for f in n.get('figures', [])
                  if f.get('kind') == 'tabla' for r in f.get('rotulos', [])}

    def destino_vivo(dst):
        """¿La arista lleva a algo que existe?

        Los destinos `tabla:` quedaban fuera de esta cuenta: se daban por
        buenos sin comprobar nada, así que una referencia a una tabla
        inexistente nunca contaba como rota y el enlace moría en un ancla
        vacía de /tablas. Es justo lo que habría cazado solo que la 408-56 se
        publicara como párrafo y no como tabla, en vez de encontrarlo a mano.

        Al encenderlo salieron 20 destinos muertos, de cinco clases:

        -  6  citas partidas por el corte de línea, que el patrón degradaba a
               una tabla de dos dígitos del Capítulo 10 («Tabla 230-» -> «23»).
        -  5  la forma «Tabla 312-6 (a)», con espacio antes del paréntesis.
        -  1  la Tabla 830-15, que de verdad faltaba: el DOF titula su
               encabezado en versalitas y el detector de títulos no lo veía.
        -  1  la 300-1(c), que el DOF imprime titulada 300-16(c) (ERRATAS_TABLAS).
        -  7  referencias que no son a una tabla de esta norma (TABLAS_AUSENTES).
        """
        if dst.startswith('tabla:'):
            tid = dst[len('tabla:'):]
            return tid in tabla_ids or tid in TABLAS_AUSENTES
        if dst.startswith(('cap:', 'parte:')):
            return True
        return dst in index

    broken = sorted({e['to'] for e in edges if not destino_vivo(e['to'])})

    ranked = sorted(incoming_roll.items(), key=lambda kv: -len(kv[1]))[:30]

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
