"""Casos conocidos de la norma, sobre lo que el pipeline dejó en data/.

Cada uno fue un error real en algún momento; si vuelve, la prueba dice cuál
y dónde, antes que la huella del sitio, que solo dice que algo cambió."""
import pytest

from comun import walk
from huella import desalineadas, discrepancias, sin_congelar


# --------------------------------------------------------------- texto

def test_250_32_b_1_existe_con_su_titulo(nodos):
    assert nodos['250-32(b)(1)']['title'] == 'Alimentado por un circuito alimentador o derivado'


def test_520_81_es_su_propia_seccion_y_no_cuelga_de_la_520_73(nodos):
    assert nodos['520-81']['title'] == 'Puesta a tierra'
    assert '520-81' not in nodos['520-73'].get('text', '')


def test_220_14_j_conserva_su_id_pese_a_la_mayuscula_del_pdf(nodos):
    assert nodos['220-14(j)']['title'] == 'Alojamientos'


def test_340_6_tiene_titulo_y_texto(nodos):
    assert nodos['340-6']['title'] == 'Requisitos de aprobación'
    assert nodos['340-6']['text'] == 'Los cables tipo UF deben ser aprobados.'


def test_ninguna_cita_conserva_el_guion_de_no_separacion(corpus):
    textos = [z['text'] for a in corpus['articles'] for s in a['sections'] for n in walk(s)
              for z in [{'text': n.get('text') or ''}] + n.get('notes', []) + n.get('exceptions', [])]
    con_guion = [t for t in textos if any(c.isdigit() and d == '‑' for c, d in zip(t, t[1:]))]
    assert con_guion == []


def test_ningun_articulo_tiene_secciones_repetidas(corpus):
    for a in corpus['articles']:
        ids = [s['id'] for s in a['sections']]
        assert len(ids) == len(set(ids)), a['num']


# -------------------------------------------------------------- tablas

def fila(t, primera):
    """La fila del cuerpo cuya primera celda es `primera`, como textos."""
    for r in t['rows'][t['header_rows']:]:
        if r[0]['t'] == primera:
            return [c['t'] for c in r]
    raise AssertionError('no hay fila %r en %s' % (primera, t['id']))


@pytest.mark.parametrize('mm2, awg, a60, a75, a90', [
    ('2.08', '14**', '15', '20', '25'),
    ('3.31', '12**', '20', '25', '30'),
    ('5.26', '10**', '30', '35', '40'),
])
def test_310_15_b_16_ampacidades_de_cobre(tablas, mm2, awg, a60, a75, a90):
    t = tablas['310-15(b)(16)']
    assert (t['cols'], t['header_rows']) == (8, 4)
    assert fila(t, mm2)[:5] == [mm2, awg, a60, a75, a90]


@pytest.mark.parametrize('amperes, awg', [('15', '14'), ('20', '12'), ('60', '10'), ('100', '8')])
def test_250_122_tamano_del_conductor_de_puesta_a_tierra(tablas, amperes, awg):
    assert fila(tablas['250-122'], amperes)[2] == awg


def test_430_250_motor_de_un_hp(tablas):
    t = tablas['430-250']
    assert t['cols'] == 13
    assert fila(t, '0.75')[:7] == ['0.75', '1', '8.4', '4.8', '4.6', '4.2', '2.1']


def test_todas_las_tablas_salen_de_la_captura_manual(tablas, revisadas):
    assert len(tablas) == 245
    assert all(t.get('verificada') for t in tablas.values())
    assert set(revisadas) == set(tablas)


def test_la_captura_manual_y_lo_publicado_coinciden(tablas, revisadas):
    lista = list(tablas.values())
    assert discrepancias(lista, revisadas) == []
    assert sin_congelar(revisadas) == []
    assert desalineadas(lista, revisadas) == []
