"""Pruebas unitarias del extractor (tools/).

Dos clases de prueba:

- Las piezas sueltas, con entradas armadas a mano: el lector de artículos,
  las citas del grafo, la huella de las tablas, los ayudantes de la
  reconstrucción. No necesitan el PDF y dicen exactamente qué regla se rompió.
- Lo que ya está en data/, sobre casos conocidos de la norma: que la 520-81
  sea su propia sección, que la 310-15(b)(16) traiga los valores revisados,
  que toda tabla salga de la captura manual. Esos datos los regenera el
  pipeline desde el PDF, así que estas pruebas vigilan el resultado entero.

    python3 -m pytest tools/pruebas
"""
import json
import os
import sys

import pytest

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.path.dirname(TOOLS), 'data')
sys.path.insert(0, TOOLS)

from comun import walk  # noqa: E402


def _leer(nombre):
    with open(os.path.join(DATA, nombre), encoding='utf-8') as fh:
        return json.load(fh)


@pytest.fixture(scope='session')
def corpus():
    return _leer('corpus.json')


@pytest.fixture(scope='session')
def tablas():
    return {t['id']: t for t in _leer('tablas.json')}


@pytest.fixture(scope='session')
def revisadas():
    return _leer('tablas_revisadas.json')


@pytest.fixture(scope='session')
def nodos(corpus):
    """Cada sección e inciso del articulado, por id."""
    return {n['id']: n for a in corpus['articles'] for s in a['sections'] for n in walk(s)}


@pytest.fixture(scope='session')
def ctx(corpus):
    """El mismo contexto con que build_graph resuelve las citas."""
    from build_graph import contexto, indice_plano, numeros_de_figura
    _, sec_ids = indice_plano(corpus)
    return contexto(corpus, _leer('tablas.json'), sec_ids, numeros_de_figura(corpus))
