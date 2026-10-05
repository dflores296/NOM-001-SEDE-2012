"""Las citas que build_graph encuentra en el texto, con el contexto real.

De aquí salen los «Citado por» de cada sección y los enlaces del sitio."""
import pytest

from build_graph import citas, frase


@pytest.mark.parametrize('texto, esperado', [
    ('conforme a 250-122', [('250-122', 'seccion')]),
    ('Tabla 250-122', [('tabla:250-122', 'tabla')]),
    ('véase 250-32(b)(1)', [('250-32(b)(1)', 'seccion')]),
    ('ver el Artículo 250', [('art:250', 'articulo')]),
    ('Capítulo 9', [('cap:9', 'capitulo')]),
    ('Figura 250-1', [('figura:250-1', 'figura')]),
    # El DOF a veces separa el paréntesis con un espacio o un punto.
    ('Véase la Tabla 312-6 (a) para el espacio.', [('tabla:312-6(a)', 'tabla')]),
    ('Tabla 430-22.(e)', [('tabla:430-22(e)', 'tabla')]),
    # Las del Capítulo 10 se citan con un número suelto.
    ('Tabla 8 del Capítulo 10', [('tabla:8', 'tabla'), ('cap:10', 'capitulo')]),
])
def test_cita(ctx, texto, esperado):
    assert citas(texto, ctx) == esperado


def test_una_tabla_del_apendice_no_se_confunde_con_la_seccion_310_15(ctx):
    assert citas('la Tabla B.310-15(b)(2)(11) da el factor', ctx) == [
        ('tabla:B.310.15(B)(2)(11)', 'tabla')]


def test_la_figura_que_el_dof_no_imprime_no_se_enlaza_a_otra(ctx):
    # La Figura B.310.15(B)(2)(1) no existe en el PDF: mejor sin enlace.
    assert citas('la Figura B.310.15(B)(2)(1)', ctx) == []


def test_la_frase_de_una_cita_es_la_suya_y_marca_la_referencia():
    # El título va en otra parte del nodo: no se pega a la frase.
    partes = ['Alcance', 'Primera idea. Debe ser conforme a 250-122 en todo caso. Otra.']
    txt = ' '.join(partes)
    ini = txt.index('250-122')
    texto, (i, j) = frase(partes, (ini, ini + len('250-122')))
    assert texto == 'Debe ser conforme a 250-122 en todo caso.'
    assert texto[i:j] == '250-122'


def test_una_frase_larga_se_recorta_alrededor_de_la_cita():
    largo = ' '.join(['palabra'] * 60)
    partes = [largo + ' según la Tabla 310-15(b)(16) ' + largo + '.']
    ini = partes[0].index('Tabla')
    texto, (i, j) = frase(partes, (ini, ini + len('Tabla 310-15(b)(16)')))
    assert texto.startswith('…') and texto.endswith('…')
    assert texto[i:j] == 'Tabla 310-15(b)(16)'
    assert len(texto) < 260
