#!/usr/bin/env python3
"""
Verifica que todo enlace interno del sitio compilado lleve a algo que existe:
la página de destino y, si el enlace trae ancla (#250-32), un elemento con ese
id en esa página. Falla con código distinto de cero si encuentra uno roto.

    python3 tools/check_enlaces.py            # revisa site/dist/
    python3 tools/check_enlaces.py otra/dist  # o la carpeta que se le dé

Existe porque un enlace roto no rompe nada visible al compilar: las tablas
del Capítulo 10 se enlazaron a /tablas#tabla-N, donde esa ancla no existe,
y el lector caía al principio del índice sin que ninguna verificación lo
notara. tools/verificar.sh lo corre después de compilar.

Revisa los href del HTML. Los enlaces que arma el buscador en el navegador
no están en el HTML, así que esta revisión no los cubre.
"""
import os, re, sys
from collections import Counter
from urllib.parse import unquote

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DIST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'site', 'dist')
BASE = '/NOM-001-SEDE-2012'

RE_HREF = re.compile(r'\bhref="([^"]*)"')
RE_ID = re.compile(r'\bid="([^"]+)"')


def destino(href, origen):
    """(ruta del archivo en dist/, ancla) de un href interno, o None si el
    enlace sale del sitio o no apunta a un archivo (mailto:, https://...)."""
    if href.startswith('#'):
        return origen, unquote(href[1:])
    if not href.startswith(BASE + '/') and href != BASE:
        return None
    ruta, _, ancla = href[len(BASE):].partition('#')
    ruta = unquote(ruta.split('?', 1)[0]).lstrip('/')
    if ruta == '' or ruta.endswith('/') or '.' not in os.path.basename(ruta):
        ruta = os.path.join(ruta, 'index.html')
    return os.path.normpath(ruta), unquote(ancla)


def main():
    if not os.path.isdir(DIST):
        sys.exit(f'No existe {DIST}: compila el sitio antes (cd site && npm run build).')
    ids = {}

    def ids_de(ruta):
        if ruta not in ids:
            p = os.path.join(DIST, ruta)
            if not os.path.isfile(p):
                ids[ruta] = None
            elif ruta.endswith('.html'):
                with open(p, encoding='utf-8') as f:
                    ids[ruta] = set(RE_ID.findall(f.read()))
            else:
                ids[ruta] = set()
        return ids[ruta]

    total, rotos = 0, []
    for base, _, nombres in os.walk(DIST):
        for n in nombres:
            if not n.endswith('.html'):
                continue
            origen = os.path.relpath(os.path.join(base, n), DIST)
            with open(os.path.join(base, n), encoding='utf-8') as f:
                html = f.read()
            for href in RE_HREF.findall(html):
                d = destino(href, origen)
                if d is None:
                    continue
                ruta, ancla = d
                total += 1
                existentes = ids_de(ruta)
                if existentes is None:
                    rotos.append((origen, href, 'no existe la página'))
                elif ancla and ancla not in existentes:
                    rotos.append((origen, href, 'no existe el ancla'))

    if not rotos:
        print(f'Enlaces correctos: {total} enlaces internos, ninguno roto.')
        return
    print(f'{len(rotos)} de {total} enlaces internos están rotos:')
    for origen, href, motivo in rotos[:40]:
        print(f'  {origen}: {href}  ({motivo})')
    if len(rotos) > 40:
        print(f'  … y {len(rotos) - 40} más')
    destinos = Counter(h.split('#')[0] for _, h, _ in rotos)
    print('\nDestinos más repetidos:', ', '.join(f'{d} ({c})' for d, c in destinos.most_common(5)))
    sys.exit(1)


if __name__ == '__main__':
    main()
