#!/usr/bin/env python3
"""Escribe la tabla de cifras del README desde los datos.

Las cifras estaban transcritas a mano y se despegaron: el README publicaba 8 326
incisos donde había 8 315, y 225 tablas donde había 226. Aquí salen de
data/validacion.json y data/grafo.json, entre los marcadores CIFRAS:INICIO y
CIFRAS:FIN.

Uso:
  python3 tools/build_cifras.py data/ README.md            # reescribe
  python3 tools/build_cifras.py data/ README.md --check    # solo verifica
"""
import json
import sys
from pathlib import Path

INICIO = '<!-- CIFRAS:INICIO -->'
FIN = '<!-- CIFRAS:FIN -->'

AVISO = ('<!-- Generado por tools/build_cifras.py desde data/validacion.json y\n'
         '     data/grafo.json. No editar a mano: se regenera. -->')


def miles(n):
    """1234567 -> '1 234 567'. Espacio fino, como el resto del proyecto."""
    return f'{n:,}'.replace(',', ' ')


def tabla(val, grafo):
    lineas = val['lineas_contenido']
    capturadas = lineas - val['lineas_no_capturadas']
    filas = [
        ('Artículos', miles(val['articulos'])),
        ('Secciones', miles(val['secciones'])),
        ('Incisos', miles(val['incisos'])),
        ('Notas / Excepciones', f"{miles(val['notas'])} / {miles(val['excepciones'])}"),
        ('Definiciones', miles(val['definiciones'])),
        ('Figuras', miles(val['figuras'])),
        ('Tablas', miles(len(grafo['uso_tablas']))),
        ('Referencias enlazadas', miles(len(grafo['edges']))),
        ('Referencias rotas', miles(len(grafo['rotas']))),
        ('Cobertura del texto',
         f"{miles(capturadas)} de {miles(lineas)} renglones "
         f"({val['cobertura_pct']:.0f} %)"),
    ]
    out = [AVISO, '', '| | |', '|---|---|']
    out += [f'| {k} | {v} |' for k, v in filas]
    return '\n'.join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)

    datos, readme = Path(args[0]), Path(args[1])
    val = json.loads((datos / 'validacion.json').read_text())
    grafo = json.loads((datos / 'grafo.json').read_text())

    texto = readme.read_text()
    if INICIO not in texto or FIN not in texto:
        sys.exit(f'{readme}: faltan los marcadores {INICIO} / {FIN}')

    i = texto.index(INICIO) + len(INICIO)
    j = texto.index(FIN)
    nuevo = texto[:i] + '\n' + tabla(val, grafo) + '\n' + texto[j:]

    if nuevo == texto:
        print(f'{readme}: las cifras ya están al día.')
        return

    if check:
        sys.exit(f'{readme}: las cifras no coinciden con los datos. '
                 f'Correr: python3 tools/build_cifras.py {datos} {readme}')

    readme.write_text(nuevo)
    print(f'{readme}: cifras actualizadas.')


if __name__ == '__main__':
    main()
