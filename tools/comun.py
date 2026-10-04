"""
Utilidades que comparten los scripts de tools/.

Antes cada script traía su propia copia, y una corrección en una no llegaba a
las otras. Solo vive aquí lo que es idéntico en todos los que lo usan: dos
funciones que se llaman igual pero hacen cosas distintas (el norm() de
build_redirects.py y el de build_tables.py, por ejemplo) se quedan en su
script.
"""
import unicodedata


def unaccent(s):
    """Quita acentos conservando mayúsculas/minúsculas."""
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


# La fuente incrustada del PDF tiene el cmap roto para un puñado de glifos:
# se ven bien al ojo pero PyMuPDF extrae el código Unicode equivocado. Pasa
# con el símbolo de grados, que sale como el dígito cero kannada ("165 ೦C"
# en vez de "165 °C", 24 veces en el documento) y con la letra griega fase,
# que sale como la efe cirílica ("1Ф - 3 Ф" en vez de "1Φ - 3Φ", en 430-83).
# build_corpus.py y build_tables.py lo corrigen en cada punto donde sacan
# texto del PDF, para que ningún camino del parser vuelva a dejarlo pasar.
GLIFOS_ROTOS = {'೦': '°', 'Ф': 'Φ'}


def fix_glifos(s):
    for malo, bueno in GLIFOS_ROTOS.items():
        if malo in s:
            s = s.replace(malo, bueno)
    return s


def walk(node):
    """Un nodo del corpus y todos sus descendientes, en orden de documento."""
    yield node
    for ch in node.get('children', []):
        yield from walk(ch)
