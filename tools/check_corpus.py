#!/usr/bin/env python3
"""
Verificación del corpus. Falla con código distinto de cero si el parseo se
degrada, para que un cambio en los patrones no llegue al sitio publicado.

    python3 tools/check_corpus.py data/

Los umbrales son deliberadamente cercanos a los valores actuales: la norma no
cambia, así que cualquier variación significa que el parser se rompió.
"""
import json, os, sys
from collections import Counter

MIN = {
    'articulos': 151,
    'secciones': 2890,
    'incisos': 7000,
    'definiciones': 185,
    'cobertura_pct': 99.5,
}

# Tablas: umbrales aparte, porque su reconstrucción es aproximada por
# naturaleza y conviene vigilar que no se degrade, no que sea perfecta.
MIN_TABLAS = 200
MIN_TABLAS_FIABLES = 100


def walk(n):
    yield n
    for c in n.get('children', []):
        yield from walk(c)


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else 'data'
    val = json.load(open(os.path.join(d, 'validacion.json')))
    corpus = json.load(open(os.path.join(d, 'corpus.json')))
    grafo = json.load(open(os.path.join(d, 'grafo.json')))

    fails = []

    for k, floor in MIN.items():
        got = val.get(k, 0)
        if got < floor:
            fails.append('%s = %s, se esperaba >= %s' % (k, got, floor))

    if val['articulos'] != val['articulos_esperados']:
        fails.append('artículos del cuerpo (%d) != artículos del índice (%d)'
                     % (val['articulos'], val['articulos_esperados']))

    if grafo['meta']['referencias_rotas'] != 0:
        fails.append('%d referencias rotas en el grafo'
                     % grafo['meta']['referencias_rotas'])

    # ids duplicados: romperían la búsqueda y los enlaces profundos
    ids = Counter()
    for a in corpus['articles']:
        for s in a['sections']:
            for n in walk(s):
                ids[n['id']] += 1
    dups = [i for i, c in ids.items() if c > 1]
    if dups:
        fails.append('ids duplicados: %s' % dups[:10])

    # las secciones de un artículo deben ir en orden creciente
    for a in corpus['articles']:
        nums = [int(s['id'].split('-')[1]) for s in a['sections']]
        if any(nums[i] <= nums[i - 1] for i in range(1, len(nums))):
            fails.append('artículo %d: secciones fuera de orden' % a['num'])

    tpath = os.path.join(d, 'tablas.json')
    if os.path.exists(tpath):
        tabs = json.load(open(tpath))
        if len(tabs) < MIN_TABLAS:
            fails.append('tablas = %d, se esperaban >= %d' % (len(tabs), MIN_TABLAS))
        fiables = sum(1 for t in tabs if t['quality'] >= 0.95)
        if fiables < MIN_TABLAS_FIABLES:
            fails.append('tablas de alta confianza = %d, se esperaban >= %d'
                         % (fiables, MIN_TABLAS_FIABLES))
        sin_grid = [t['id'] for t in tabs if t['cols'] < 2]
        if len(sin_grid) > 12:
            fails.append('%d tablas quedaron en una sola columna' % len(sin_grid))

    if fails:
        print('VERIFICACIÓN FALLIDA')
        for f in fails:
            print('  - %s' % f)
        sys.exit(1)

    msg = ('Verificación correcta: %d artículos, %d secciones, %d incisos, '
           'cobertura %.2f%%, 0 referencias rotas.'
           % (val['articulos'], val['secciones'], val['incisos'],
              val['cobertura_pct']))
    if os.path.exists(tpath):
        msg += ('\n  Tablas: %d reconstruidas, %d de alta confianza.'
                % (len(tabs), fiables))
    print(msg)


if __name__ == '__main__':
    main()
