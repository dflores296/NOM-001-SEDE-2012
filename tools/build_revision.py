#!/usr/bin/env python3
"""Genera REVISION-TABLAS.md desde data/tablas.json y data/grafo.json.

Replica exactamente la priorización de site/src/pages/revision.astro para que
el .md y la página web nunca se cuenten historias distintas. Si cambia el
criterio en un lado, cambia también en el otro.

Uso: python3 tools/build_revision.py data/ REVISION-TABLAS.md
"""
import json
import sys
from pathlib import Path

SITIO = 'https://dflores296.github.io/NOM-001-SEDE-2012/revision/'

CABECERA = """# Revisión de tablas — NOM-001-SEDE-2012

Lista de trabajo para contrastar las tablas reconstruidas contra el PDF del DOF.
Ordenada por **impacto por duda**: cuántas veces la cita la norma, por lo insegura
que quedó su reconstrucción. Empezar por arriba es lo que más corrige por hora.

La versión navegable, con enlaces a cada tabla, está en
[/revision]({sitio}).

> Este archivo se genera con `python3 tools/build_revision.py data/
> REVISION-TABLAS.md`. No editar a mano: los cambios se pierden en la próxima
> regeneración.

Columnas: **cal.** calidad estimada de la separación en celdas (1.00 = ninguna celda
con varios valores juntos) · **rejilla** de dónde salieron las columnas: `dibujada`
son las líneas del PDF, `huecos` son los espacios entre palabras, que es mucho menos
fiable y no recupera celdas combinadas.
"""

PIE = """
## Qué mirar en cada tabla

- **Número de columnas.** Si el PDF tiene 8 y aquí ves 5, se fusionaron.
- **Celdas combinadas del encabezado.** Que cada título cubra las columnas que cubre
  en el PDF, ni más ni menos.
- **Celdas con varios valores.** Un `55 65 75` junto en una celda significa que la
  separación falló en esa fila.
- **Encabezados de dos y tres niveles.** Las de COBRE / ALUMINIO arriba y 60/75/90 °C
  abajo son las más frágiles: revisa que cada número quede bajo su material y su
  temperatura.
- **Primera y última fila.** Es donde se cuela el título de la tabla siguiente o una
  nota al pie convertida en fila.
- **Tablas que cruzan páginas.** Que no falten filas en la costura ni se repita el
  encabezado a media tabla.
- **Notas al pie.** Las que van *debajo* de la rejilla todavía no se recogen como
  notas de la tabla; pueden aparecer como texto del artículo.

Cada tabla del sitio trae un enlace «¿Ves un error? Repórtalo» que abre un issue con
el número y la página ya rellenados.
"""


def truncar(titulo, n=70):
    t = titulo.strip()
    return t if len(t) <= n else t[:n].rstrip() + '…'


def fila(t, citas):
    grid = '**huecos**' if t['grid'] == 'huecos' else 'dibujada'
    paginas = ', '.join(str(p) for p in t['pages'])
    return (
        f"| [ ] | `{t['id']}` | {truncar(t['title'])} | {paginas} | {citas} | "
        f"{t['quality']:.2f} | {grid} | {len(t['rows'])}×{t['cols']} |"
    )


def tabla_md(items):
    cab = '| | Tabla | Título | Pág. PDF | Citas | Cal. | Rejilla | Tamaño |\n'
    cab += '|---|---|---|---|---|---|---|---|\n'
    return cab + '\n'.join(fila(t, c) for t, c in items)


def main():
    data_dir = Path(sys.argv[1] if len(sys.argv) > 1 else 'data')
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else 'REVISION-TABLAS.md')

    tablas = json.loads((data_dir / 'tablas.json').read_text(encoding='utf-8'))
    grafo = json.loads((data_dir / 'grafo.json').read_text(encoding='utf-8'))

    citas = {}
    for e in grafo['edges']:
        if e['to'].startswith('tabla:'):
            tid = e['to'][6:]
            citas[tid] = citas.get(tid, 0) + 1

    # Las contrastadas a ojo contra el PDF ya no son lista de trabajo.
    verificadas = [t for t in tablas if t.get('verificada')]
    info = []
    for t in tablas:
        if t.get('verificada'):
            continue
        c = citas.get(t['id'], 0)
        q = t['quality']
        # Misma fórmula que revision.astro: citas * lo dudosa que es, más un
        # empujón fijo si quedó en una sola columna (eso ya es un fallo grave
        # aunque nadie la cite).
        prio = c * (1 - q) + (1 - q) + (3 if t['cols'] < 2 else 0)
        info.append((t, c, prio))

    criticas = sorted(
        (x for x in info if x[2] >= 1.0), key=lambda x: -x[2]
    )
    dudosas = sorted(
        (x for x in info if x[2] < 1.0 and x[0]['quality'] < 0.8),
        key=lambda x: (-x[1], x[0]['quality']),
    )
    confianza = sorted(
        (x for x in info if x[0]['quality'] >= 0.95 and x[1] >= 4),
        key=lambda x: -x[1],
    )

    secciones = [
        (
            f'## 1 · Prioridad alta ({len(criticas)})',
            'Muy citadas y con la reconstrucción insegura. Un error aquí se '
            'propaga a muchos cálculos.',
            criticas,
        ),
        (
            f'## 2 · Dudosas ({len(dudosas)})',
            'Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. '
            'Menos urgentes.',
            dudosas,
        ),
        (
            f'## 3 · Verificación de control ({len(confianza)})',
            'Salieron limpias y son muy citadas. Conviene mirarlas justamente '
            'por eso: una tabla equivocada que *parece* correcta es más '
            'peligrosa que una marcada como dudosa. Basta comprobar dos o '
            'tres renglones de cada una.',
            confianza,
        ),
    ]

    out = [CABECERA.format(sitio=SITIO).rstrip()]
    out.append(
        f'**{len(verificadas)} de {len(tablas)} tablas ya se contrastaron celda '
        f'por celda contra el PDF** y salen de esta lista; quedan registradas en '
        f'`data/tablas_revisadas.json`, que se aplica encima de la '
        f'reconstrucción automática.'
    )
    for titulo, nota, items in secciones:
        out.append(titulo + '\n\n' + nota)
        out.append(tabla_md([(t, c) for t, c, _ in items]))

    out.append(PIE.strip())

    out_path.write_text('\n\n'.join(out).rstrip() + '\n', encoding='utf-8')
    print(
        f'{out_path}: {len(criticas)} prioridad alta, {len(dudosas)} dudosas, '
        f'{len(confianza)} verificación de control, {len(verificadas)} '
        f'verificadas, {len(tablas)} tablas en total.'
    )


if __name__ == '__main__':
    main()
