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
Ordenada por **impacto por duda**: cuánto se apoya la norma en cada tabla, por lo
insegura que quedó su reconstrucción. Empezar por arriba es lo que más corrige por hora.

La versión navegable, con enlaces a cada tabla, está en
[/revision]({sitio}).

> Este archivo se genera con `python3 tools/build_revision.py data/
> REVISION-TABLAS.md`. No editar a mano: los cambios se pierden en la próxima
> regeneración.

Columnas: **usos** cuántas veces se apoya la norma en esa tabla · **cal.** calidad
estimada de la separación en celdas (1.00 = ninguna celda con varios valores juntos)
· **rejilla** de dónde salieron las columnas: `dibujada` son las líneas del PDF,
`huecos` son los espacios entre palabras, que es mucho menos fiable y no recupera
celdas combinadas. Una tabla marcada **enc.** trae la firma de la columna fantasma:
una celda vacía en el encabezado junto a un título de grupo, que es como se ve una
columna inventada. La calidad no detecta eso —los valores están perfectos— así que
esas tablas salían con 1.00 y sin una sola marca.
"""

PIE = """
## Cómo se corrige una tabla

La reconstrucción automática llegó hasta donde llega y el PDF no va a cambiar, así
que a partir de aquí las tablas se corrigen **a mano** sobre el PDF, no tocando el
algoritmo. El procedimiento:

1. Renderizar la zona de la tabla desde el PDF (los campos `regions` de
   `data/tablas.json` dan página y coordenadas) y compararla con lo publicado.
2. Escribir la versión corregida en `data/tablas_revisadas.json`, con la fecha en
   `verificada`. Se aplica ENCIMA de lo reconstruido, así que sobrevive a que
   `build_tables.py` regenere todo en cada publicación —editar `data/tablas.json`
   directamente NO sirve: se sobrescribe—.
3. Correr el proceso completo en el orden del README y `check_corpus.py`, que valida
   las filas corregidas igual que las automáticas: si las columnas no cuadran,
   detiene el despliegue.

Dos cosas que conviene saber antes de empezar:

- **La calidad estimada da falsas alarmas.** Penaliza las celdas con varios números,
  y un rango («De 50 001 a 100 000», «127 – 507», «0 – 3.14») es un valor legítimo.
  Varias tablas señaladas resultaron estar perfectas; se marcan verificadas sin
  tocarles un dato.
- **Y también se queda corta.** Hay tablas peores de lo que dice su nota. Las que el
  PDF no separa con líneas horizontales colapsan todas sus filas en una sola. Y sobre
  todo: cuando el reparto se inventa una columna, los valores quedan perfectos y la
  calidad da 1.00, pero el encabezado se corre y cada título de grupo cubre una
  columna de menos. Eso es lo que marca la columna **enc.**, y es el fallo que tenía
  la 310-15(b)(16), donde COBRE cubría dos de las tres columnas de cobre.

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

## Lo que falta

- Las tablas que siguen listadas arriba.
- Un repaso rápido a las que **no** están señaladas. Nunca se han contrastado contra
  el PDF; que la reconstrucción saliera limpia no garantiza que sea fiel, y una
  tabla equivocada que *parece* correcta es la más peligrosa de todas.
"""


def truncar(titulo, n=70):
    t = titulo.strip()
    return t if len(t) <= n else t[:n].rstrip() + '…'


def fila(t, usos):
    grid = '**huecos**' if t['grid'] == 'huecos' else 'dibujada'
    paginas = ', '.join(str(p) for p in t['pages'])
    enc = '**sí**' if t.get('encabezado_dudoso') else '—'
    return (
        f"| [ ] | `{t['id']}` | {truncar(t['title'])} | {paginas} | {usos} | "
        f"{t['quality']:.2f} | {enc} | {grid} | {len(t['rows'])}×{t['cols']} |"
    )


def tabla_md(items):
    # Una sección vacía es una buena noticia, no una tabla sin filas: el
    # encabezado suelto se lee como si faltaran datos.
    if not items:
        return 'Ninguna: ya están todas contrastadas contra el PDF.'
    cab = '| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |\n'
    cab += '|---|---|---|---|---|---|---|---|---|\n'
    return cab + '\n'.join(fila(t, c) for t, c in items)


def main():
    data_dir = Path(sys.argv[1] if len(sys.argv) > 1 else 'data')
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else 'REVISION-TABLAS.md')

    tablas = json.loads((data_dir / 'tablas.json').read_text(encoding='utf-8'))
    grafo = json.loads((data_dir / 'grafo.json').read_text(encoding='utf-8'))

    # Cuánto se apoya la norma en cada tabla, medido sobre el texto por
    # build_graph. Contar aristas del grafo se quedaba corto: una cita desnuda
    # como "250-122" se resuelve antes a la sección del mismo número.
    uso = grafo.get('uso_tablas', {})

    # Las contrastadas a ojo contra el PDF ya no son lista de trabajo.
    verificadas = [t for t in tablas if t.get('verificada')]
    info = []
    for t in tablas:
        if t.get('verificada'):
            continue
        c = uso.get(t['id'], {}).get('usos', 0)
        q = t['quality']
        # Misma fórmula que revision.astro. El riesgo ya no es solo la calidad:
        # un encabezado con la columna fantasma es un fallo confirmado y la
        # calidad no lo ve, así que pesa aunque la tabla salga con 1.00.
        riesgo = (1 - q) + (0.6 if t.get('encabezado_dudoso') else 0)
        prio = c * riesgo + riesgo + (3 if t['cols'] < 2 else 0)
        info.append((t, c, prio))

    criticas = sorted(
        (x for x in info if x[2] >= 1.0), key=lambda x: -x[2]
    )
    dudosas = sorted(
        (x for x in info if x[2] < 1.0 and x[0]['quality'] < 0.8),
        key=lambda x: (-x[1], x[0]['quality']),
    )
    confianza = sorted(
        (x for x in info if x[0]['quality'] >= 0.95
         and not x[0].get('encabezado_dudoso') and x[1] >= 5),
        key=lambda x: -x[1],
    )

    secciones = [
        (
            f'## 1 · Prioridad alta ({len(criticas)})',
            'Muy usadas y con la reconstrucción insegura: o la calidad las '
            'señala, o traen la firma de la columna fantasma en el '
            'encabezado. Un error aquí se propaga a muchos cálculos.',
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
            'Salieron limpias, con el encabezado bien, y son muy usadas. '
            'Conviene mirarlas justamente '
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
