"""El lector de artículos de build_corpus, con renglones armados a mano.

Cada prueba es una regla que costó encontrar en el PDF: si alguien la toca,
aquí sale cuál y con qué renglón."""
import pytest

from build_corpus import limpiar_texto, parse_article, sec_re
from comun import fix_glifos, unaccent, walk


def leer(num, renglones):
    """Las secciones e incisos que salen de parsear esos renglones, por id."""
    art = parse_article(num, renglones, [1] * len(renglones), 0, len(renglones))
    return {n['id']: n for s in art['sections'] for n in walk(s)}


@pytest.mark.parametrize('renglon, esperado', [
    ('210-8. Protección', ('210-8', 'Protección')),    # punto y espacio, lo normal
    ('384-1 Alcance.', ('384-1', 'Alcance.')),          # sin punto (arts. 384, 506, 522)
    ('701-1.Alcance.', ('701-1', 'Alcance.')),          # sin espacio (art. 701)
    ('513-10.- Equipo', ('513-10', 'Equipo')),          # punto y guion (513, una vez)
])
def test_encabezado_de_seccion_en_sus_cuatro_formas(renglon, esperado):
    assert sec_re(int(renglon[:3])).match(renglon).groups() == esperado


def test_una_cita_al_inicio_del_renglon_no_es_encabezado():
    # El título de una sección arranca en mayúscula; «210-8 de la …» es prosa.
    assert sec_re(210).match('210-8 de la sección anterior') is None


def test_incisos_anidados():
    n = leer(220, [
        '220-13. Título. Texto de la sección.',
        'a) Primer inciso.',
        '(1) Numeral uno.',
        '(2) Numeral dos.',
        'b) Segundo inciso.',
    ])
    assert list(n) == ['220-13', '220-13(a)', '220-13(a)(1)', '220-13(a)(2)', '220-13(b)']
    assert n['220-13(a)(2)']['text'] == 'Numeral dos.'


def test_inciso_con_la_errata_del_punto():
    # La norma imprime «e). Pozos verticales» entre hermanos sin punto (28 veces).
    n = leer(800, ['800-1. Título. Texto.', 'd) Uno.', 'e). Pozos verticales.'])
    assert n['800-1(e)']['text'] == 'Pozos verticales.'


def test_inciso_con_la_errata_mayuscula_se_identifica_en_minuscula():
    # 220-14 imprime «J) Alojamientos» entre i) y k); su id sigue siendo (j).
    n = leer(220, ['220-14. Título. Texto.', 'i) Uno.', 'J) Alojamientos.', 'k) Dos.'])
    assert '220-14(j)' in n and '220-14(J)' not in n


def test_nota_y_excepcion_conservan_su_orden():
    n = leer(250, [
        '250-4. Título. Texto.',
        'Excepción: Primero la excepción.',
        'NOTA: Luego la nota.',
    ])
    s = n['250-4']
    exc, nota = s['exceptions'][0], s['notes'][0]
    assert exc['text'] == 'Primero la excepción.' and nota['text'] == 'Luego la nota.'
    assert exc['seq'] < nota['seq']


def test_una_seccion_fuera_de_orden_es_texto_y_no_seccion_nueva():
    # Las secciones van en orden creciente: un «220-3.» después de la 220-14
    # es una cita que cayó al inicio del renglón.
    n = leer(220, ['220-14. Título. Texto.', '220-3. Parece encabezado.', '220-15. Otra. Sigue.'])
    assert '220-3' not in n
    assert '220-3. Parece encabezado.' in n['220-14']['text']
    assert '220-15' in n


def test_340_6_sin_el_punto_tras_el_titulo():
    n = leer(340, ['340-6 Requisitos de aprobación Los cables tipo UF deben ser aprobados.'])
    assert n['340-6']['title'] == 'Requisitos de aprobación'
    assert n['340-6']['text'] == 'Los cables tipo UF deben ser aprobados.'


def test_el_guion_de_no_separacion_se_normaliza_solo_entre_digitos():
    # Escondía el encabezado «520‑81. Puesta a tierra.» dentro de la 520-73.
    assert limpiar_texto('520‑81. Puesta a tierra') == '520-81. Puesta a tierra'
    assert limpiar_texto('anti‑flama') == 'anti‑flama'


def test_con_el_guion_normalizado_la_520_81_es_su_propia_seccion():
    renglones = [limpiar_texto(r) for r in [
        '520-73. Interruptores requeridos. Todas las lámparas.',
        '520‑81. Puesta a tierra. Todas las canalizaciones.',
    ]]
    n = leer(520, renglones)
    assert n['520-81']['title'] == 'Puesta a tierra'
    assert '520-81' not in n['520-73']['text']


def test_glifos_rotos_de_la_fuente():
    assert fix_glifos('165 ೦C') == '165 °C'        # cero kannada → grados
    assert fix_glifos('1Ф - 3Ф') == '1Φ - 3Φ'  # efe cirílica → fi griega


def test_unaccent_conserva_mayusculas():
    assert unaccent('Protección ÑANDÚ') == 'Proteccion NANDU'
