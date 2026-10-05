"""Lo que build_search y build_revision derivan de los datos."""
import pytest

from build_revision import truncar
from build_search import docs_de_tablas, verificar_ids_unicos


def test_ids_duplicados_detienen_el_indice():
    with pytest.raises(SystemExit):
        verificar_ids_unicos([{'id': 'a'}, {'id': 'a'}])


def test_tabla_de_apendice_se_rotula_con_su_apendice_y_lleva_usos():
    t = {'id': 'C-1', 'title': 'x', 'apendice': 'C', 'article': None, 'rows': [], 'header_rows': 0}
    d, = docs_de_tablas([t], {}, {'C-1': {'usos': 3}})
    assert d['id'] == 'tabla:C-1' and d['artTitle'] == 'Apéndice C'
    assert d['apendice'] == 'C' and d['usos'] == 3


def test_tabla_del_capitulo_10_sin_articulo_ni_apendice():
    t = {'id': '8', 'title': 'x', 'article': None, 'rows': [], 'header_rows': 0}
    d, = docs_de_tablas([t], {}, {})
    assert d['artTitle'] == 'Capítulo 10' and d['usos'] == 0


def test_truncar_aguanta_una_tabla_sin_titulo():
    assert truncar(None) == ''
    assert truncar('x' * 80, n=10) == 'x' * 10 + '…'
