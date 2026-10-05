"""La reconstrucción de tablas y lo que protege la captura manual.

Las 245 tablas se contrastaron a ojo contra el PDF y viven en
data/tablas_revisadas.json. Lo que importa aquí es que esa captura mande
siempre sobre lo que el algoritmo reconstruya, y que la huella delate
cualquier cambio en una tabla ya verificada."""
import copy
import json

from build_tables import apply_revisiones, cluster, pegar, separar_notas, sigue_la_frase
from huella import canonico, desalineadas, discrepancias, huella, sin_congelar


def tabla(**kw):
    t = {'id': '999-1', 'title': 'Prueba', 'cols': 2, 'header_rows': 1, 'notes': [],
         'rows': [[{'t': 'A'}, {'t': 'B'}], [{'t': '1'}, {'t': '2'}]]}
    t.update(kw)
    return t


# ------------------------------------------------------------------ huella

def test_la_huella_no_depende_del_orden_de_claves_ni_de_cs_rs_en_1():
    a = tabla()
    b = tabla(rows=[[{'t': 'A', 'cs': 1}, {'rs': 1, 't': 'B'}], [{'t': '1'}, {'t': '2'}]])
    assert canonico(a) == canonico(b) and huella(a) == huella(b)


def test_la_huella_cambia_si_cambia_una_celda_o_una_fusion():
    base = huella(tabla())
    assert huella(tabla(rows=[[{'t': 'A'}, {'t': 'B'}], [{'t': '1'}, {'t': '3'}]])) != base
    assert huella(tabla(rows=[[{'t': 'A', 'cs': 2}], [{'t': '1'}, {'t': '2'}]])) != base
    assert huella(tabla(title='Otra')) != base


def test_discrepancias_delata_una_tabla_verificada_que_cambio():
    t = tabla()
    rev = {'999-1': {'sha': huella(t), 'verificada': '2026-08-12'}}
    assert discrepancias([t], rev) == []
    movida = tabla(rows=[[{'t': 'A'}, {'t': 'B'}], [{'t': '1'}, {'t': '9'}]])
    assert discrepancias([movida], rev) == [('999-1', huella(t), huella(movida))]


def test_sin_congelar_y_desalineadas():
    t = tabla()
    assert sin_congelar({'999-1': {'verificada': 'sí', 'rows': t['rows']}}) == [
        ('999-1', ['cols', 'header_rows'])]
    rev = {'999-1': {'rows': [[{'t': 'otra'}]]}}
    assert desalineadas([t], rev) == [('999-1', ['rows'])]


# ------------------------------------------------ la captura manual manda

def test_la_captura_manual_reemplaza_lo_reconstruido(tmp_path):
    reconstruida = tabla(rows=[[{'t': 'A'}, {'t': 'B'}], [{'t': '1'}, {'t': 'MAL'}]], quality=0.4)
    captura = {'999-1': {'verificada': '2026-08-12', 'cols': 2, 'header_rows': 1,
                         'rows': [[{'t': 'A'}, {'t': 'B'}], [{'t': '1'}, {'t': '2'}]]}}
    ruta = tmp_path / 'tablas_revisadas.json'
    ruta.write_text(json.dumps(captura), encoding='utf-8')
    tablas = [reconstruida]
    assert apply_revisiones(tablas, str(ruta)) == 1
    assert tablas[0]['rows'] == captura['999-1']['rows']
    assert tablas[0]['verificada'] == '2026-08-12' and tablas[0]['quality'] == 1.0


def test_una_tabla_que_el_pdf_no_numera_se_da_de_alta_desde_la_captura(tmp_path):
    # Como la del inciso 922-17(c): no hay «Tabla N» que reconstruir.
    captura = {'922-17(c)': {'verificada': 'sí', 'article': 922, 'pages': [700],
                             'regions': [{'page': 700, 'y0': 100.0}], 'cols': 2,
                             'header_rows': 1, 'rows': [[{'t': 'x'}, {'t': 'y'}]]}}
    ruta = tmp_path / 'tablas_revisadas.json'
    ruta.write_text(json.dumps(captura), encoding='utf-8')
    tablas = []
    apply_revisiones(tablas, str(ruta))
    assert tablas[0]['id'] == '922-17(c)' and tablas[0]['sin_numero'] is True
    assert tablas[0]['grid'] == 'manual'


# ------------------------------------------------------------- ayudantes

def test_cluster_junta_valores_cercanos():
    assert cluster([10.0, 11.0, 30.0, 31.5]) == [10.5, 30.75]


def test_un_titulo_partido_en_el_numero_se_pega_sin_espacio():
    # «…según se indica en la Figura 310-» / «60, factor de carga» (310-60(c)(85)).
    assert sigue_la_frase('60, factor de carga', 'en la Figura 310-')
    assert pegar('en la Figura 310-', '60, factor de carga') == 'en la Figura 310-60, factor de carga'
    assert not sigue_la_frase('Tabla nueva', 'Termina aquí.')


def test_separar_notas_saca_las_filas_de_nota_al_pie():
    filas = [[{'t': '1'}, {'t': '2'}],
             [{'t': 'NOTA: Véase 310-15(b)(2).'}, {'t': ''}],
             [{'t': '**Para conductores de aluminio.'}, {'t': ''}]]
    cuerpo, notas = separar_notas(copy.deepcopy(filas))
    assert cuerpo == [filas[0]]
    assert notas == ['NOTA: Véase 310-15(b)(2).', '**Para conductores de aluminio.']


def test_una_fila_de_datos_de_una_sola_celda_no_es_nota():
    filas = [[{'t': 'COBRE'}, {'t': ''}]]
    assert separar_notas(copy.deepcopy(filas)) == (filas, [])
