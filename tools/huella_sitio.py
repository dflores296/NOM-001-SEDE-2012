#!/usr/bin/env python3
"""
Huella del sitio: el SHA-256 de todo el contenido que se publica, comparado
contra tools/huella_sitio.txt. Es la red de seguridad para reestructurar el
código: un cambio que solo reorganiza no puede mover ni una coma de una tabla
revisada sin que esto lo detenga.

    python3 tools/huella_sitio.py              # compara; falla si algo cambió
    python3 tools/huella_sitio.py --escribir   # vuelve a sellar

Se corre después de regenerar todo y compilar (tools/verificar.sh lo hace en
orden). Sellar de nuevo es para un cambio de contenido DELIBERADO, como
corregir una tabla: el diff de huella_sitio.txt en ese commit dice
exactamente qué páginas y qué datos cambiaron.

Qué cubre:
- data/*.json y REVISION-TABLAS.md, byte por byte. El README no: lo escribe
  una persona, y sus cifras ya las vigila build_cifras.py --check.
- site/dist/, todo lo que se publica: imágenes, video, índice de búsqueda,
  datos del mapa y las páginas. El HTML se compara sin lo que es código y
  no contenido (ver normalizar_html).

Qué no cubre: el código del navegador, que vive en site/dist/_astro/ con un
hash en el nombre, y el service worker. Reorganizar ese código cambia sus
bytes sin cambiar lo que se lee; eso lo cuidan las pruebas en navegador.
"""
import hashlib, os, re, sys

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
MANIFIESTO = os.path.join(RAIZ, 'tools', 'huella_sitio.txt')
DIST = os.path.join(RAIZ, 'site', 'dist')

# Rutas de dist/ que son código, no contenido.
CODIGO = ('_astro/', 'sw.js')

RE_SCRIPT = re.compile(r'<script\b[^>]*>.*?</script>', re.S)
RE_STYLE = re.compile(r'<style\b[^>]*>.*?</style>', re.S)
RE_LINK_ASTRO = re.compile(r'<link\b[^>]*/_astro/[^>]*>')
# Astro marca cada elemento de un componente con estilos propios con
# data-astro-cid-<hash>, y ese hash cambia si se reorganiza el componente.
RE_CID = re.compile(r' data-astro-cid-[a-z0-9]+')


def normalizar_html(b):
    """El HTML sin lo que es código: los <script> y <style> en línea, los
    enlaces a los archivos de /_astro/ y la marca de alcance de Astro. Todo
    lo demás (texto, tablas, enlaces, anclas, clases, el orden de los
    elementos) queda y se compara."""
    t = b.decode('utf-8')
    t = RE_SCRIPT.sub('', t)
    t = RE_STYLE.sub('', t)
    t = RE_LINK_ASTRO.sub('', t)
    t = RE_CID.sub('', t)
    return t.encode('utf-8')


def archivos():
    """(ruta relativa a la raíz, ruta absoluta) de todo lo que se sella."""
    out = []
    data = os.path.join(RAIZ, 'data')
    for n in sorted(os.listdir(data)):
        if n.endswith('.json'):
            out.append((f'data/{n}', os.path.join(data, n)))
    out.append(('REVISION-TABLAS.md', os.path.join(RAIZ, 'REVISION-TABLAS.md')))
    if not os.path.isdir(DIST):
        sys.exit(f'No existe {DIST}: compila el sitio antes (cd site && npm run build).')
    for base, _, ns in os.walk(DIST):
        for n in ns:
            ab = os.path.join(base, n)
            rel = os.path.relpath(ab, DIST).replace(os.sep, '/')
            if rel.startswith(CODIGO):
                continue
            out.append((f'site/dist/{rel}', ab))
    return sorted(out)


def huella(rel, ab):
    with open(ab, 'rb') as f:
        b = f.read()
    if rel.endswith('.html'):
        b = normalizar_html(b)
    return hashlib.sha256(b).hexdigest()


def leer_manifiesto():
    sellos = {}
    with open(MANIFIESTO, encoding='utf-8') as f:
        for linea in f:
            if linea.startswith('#') or not linea.strip():
                continue
            h, rel = linea.rstrip('\n').split('  ', 1)
            sellos[rel] = h
    return sellos


def main():
    escribir = '--escribir' in sys.argv[1:]
    actual = {rel: huella(rel, ab) for rel, ab in archivos()}

    if escribir:
        with open(MANIFIESTO, 'w', encoding='utf-8') as f:
            f.write('# Huella del contenido publicado. La genera y la compara\n')
            f.write('# tools/huella_sitio.py; no se edita a mano.\n')
            for rel in sorted(actual):
                f.write(f'{actual[rel]}  {rel}\n')
        print(f'Sellados {len(actual)} archivos en {os.path.relpath(MANIFIESTO, RAIZ)}.')
        return

    if not os.path.exists(MANIFIESTO):
        sys.exit(f'Falta {os.path.relpath(MANIFIESTO, RAIZ)}: créalo con --escribir.')
    sellos = leer_manifiesto()
    cambiados = sorted(r for r in actual if r in sellos and actual[r] != sellos[r])
    nuevos = sorted(r for r in actual if r not in sellos)
    faltan = sorted(r for r in sellos if r not in actual)

    if not (cambiados or nuevos or faltan):
        print(f'Contenido idéntico: {len(actual)} archivos coinciden con la huella.')
        return

    print('EL CONTENIDO PUBLICADO CAMBIÓ respecto de la huella:')
    for titulo, lista in (('cambiaron', cambiados), ('nuevos', nuevos), ('ya no están', faltan)):
        if lista:
            print(f'\n  {len(lista)} {titulo}:')
            for r in lista[:40]:
                print(f'    {r}')
            if len(lista) > 40:
                print(f'    … y {len(lista) - 40} más')
    print('\nSi el cambio es deliberado (por ejemplo, se corrigió una tabla), vuelve a'
          '\nsellar con: python3 tools/huella_sitio.py --escribir, y revisa el diff.'
          '\nSi solo se reorganizó código, algo se rompió: no publiques.')
    sys.exit(1)


if __name__ == '__main__':
    main()
