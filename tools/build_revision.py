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

{intro}

La versión navegable, con enlaces a cada tabla, está en
[/revision]({sitio}).

> Este archivo se genera con `python3 tools/build_revision.py data/
> REVISION-TABLAS.md`. No editar a mano: los cambios se pierden en la próxima
> regeneración.
"""

# Mientras quedaban tablas por contrastar, este archivo era la lista de trabajo.
# Terminada la revisión sigue siendo útil, pero como registro: qué se revisó y
# contra qué. La priorización se conserva y vuelve a encenderse sola si una
# tabla nueva o reprocesada se queda sin marca de `verificada`.
INTRO_PENDIENTE = """Lista de trabajo para contrastar las tablas reconstruidas contra el PDF del DOF.
Ordenada por **impacto por duda**: cuánto se apoya la norma en cada tabla, por lo
insegura que quedó su reconstrucción. Empezar por arriba es lo que más corrige por hora."""

INTRO_TERMINADO = """Registro de la revisión de las tablas contra el PDF del DOF. **No queda ninguna
pendiente**: las tablas se reconstruyen automáticamente desde el PDF y ese proceso no
es exacto, así que se contrastaron todas celda por celda contra el documento original."""

# La leyenda de columnas solo hace falta cuando hay filas que leer.
LEYENDA = """Columnas: **usos** cuántas veces se apoya la norma en esa tabla · **cal.** calidad
estimada de la separación en celdas (1.00 = ninguna celda con varios valores juntos)
· **rejilla** de dónde salieron las columnas: `dibujada` son las líneas del PDF,
`huecos` son los espacios entre palabras, que es mucho menos fiable y no recupera
celdas combinadas. Una tabla marcada **enc.** trae la firma de la columna fantasma:
una celda vacía en el encabezado junto a un título de grupo, que es como se ve una
columna inventada. La calidad no detecta eso —los valores están perfectos— así que
esas tablas salían con 1.00 y sin una sola marca."""

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
  columna de menos. Es el fallo que tenía la 310-15(b)(16), donde COBRE cubría dos de
  las tres columnas de cobre, y la firma que delata la columna fantasma es una celda
  vacía en el encabezado junto a un título de grupo.

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
- **Dónde acaba el encabezado.** El fallo más repetido de toda la revisión: las
  primeras filas de datos contadas como parte del título, con su mismo estilo.
- **Notas al pie.** Que estén y que terminen donde termina la tabla. Se recogen de
  debajo de la rejilla, y ahí el recorte se pasaba de largo con frecuencia: la nota
  arrastraba el artículo siguiente completo, o hasta el pie de página del PDF.

Cada tabla del sitio trae un enlace «¿Ves un error? Repórtalo» que abre un issue con
el número y la página ya rellenados.
"""

CIERRE_PENDIENTE = """## Lo que falta

- Las tablas que siguen listadas arriba, secciones 1 a 4.
"""

CIERRE_TERMINADO = """## Lo que la revisión dejó anotado

Tres tablas traen valores mal impresos **en el PDF de origen**, no en la
reconstrucción. Se comprobó con las coordenadas del texto y con el render de la
página, y se dejaron tal como los imprime el DOF: corregirlos sería editar la norma,
no transcribirla.

- **505-9(d)(1)** — la columna de temperatura superficial máxima dice `≤4`, `≤3`,
  `≤2`, `≤1`, `≤1`, `≤85`. Por las clases T1–T6 deberían ser 450, 300, 200, 135,
  100 y 85 °C.
- **922-12(a)(2)** — en la columna de flecha 2.5 m, las filas de 6 600 y 23 000 volts
  dicen `96` y `105` donde el patrón pide `960` y `1 050` milímetros.
- **220-42** — el último tramo de «Hoteles y moteles» dice `A partir de 1 00000`
  donde debería decir `A partir de 100 000`. Aquí **los dígitos son los correctos**
  (son seis: 1-0-0-0-0-0) y lo que está fuera de lugar es el separador de miles. Se
  confirma por el renglón inmediato anterior, `De 20 001 a 100 000`: el tramo
  siguiente arranca justo donde termina ése. En la capa de texto de la página 47 son
  dos palabras, `1` en x≈335.1 y `00000` en x≈342.6, mientras el renglón de arriba
  trae `100` en x≈338.9 y `000` en x≈356.4 — o sea que el espacio existe en el PDF y
  no lo introdujo la extracción.

El PDF tampoco es un documento nativo: es una impresión de Chrome de
`dof.gob.mx/normasOficiales/4951/SENER/SENER.html` hecha el 19/11/2019. De ese HTML
las tablas saldrían como `<table><tr><td>` sin inferir nada, y sería la forma de
verificar de raíz lo que aquí se contrastó a ojo.
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
    # Lo que ninguna heurística marcó: ni calidad baja, ni columna fantasma,
    # ni suficientes usos para "verificación de control". Que salgan limpias
    # no es lo mismo que fieles, y nunca se han contrastado contra el PDF.
    # Se ordenan por página para revisarlas de corrido junto con el PDF.
    marcadas = {t['id'] for t, c, p in criticas + dudosas + confianza}
    sin_senales = sorted(
        (x for x in info if x[0]['id'] not in marcadas),
        key=lambda x: (x[0]['pages'][0], x[0]['id']),
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
        (
            f'## 4 · Sin señales ({len(sin_senales)})',
            'Ninguna heurística las marcó —ni calidad baja, ni columna fantasma, '
            'ni uso suficiente para "verificación de control"— pero eso no es lo '
            'mismo que fieles: nunca se han contrastado contra el PDF. Ordenadas '
            'por página para revisarlas de corrido.',
            sin_senales,
        ),
    ]

    terminado = not info
    intro = INTRO_TERMINADO if terminado else INTRO_PENDIENTE
    out = [CABECERA.format(intro=intro, sitio=SITIO).rstrip()]
    if not terminado:
        out.append(LEYENDA)
    out.append(
        f'**{len(verificadas)} de {len(tablas)} tablas ya se contrastaron celda '
        f'por celda contra el PDF**'
        + ('' if terminado else ' y salen de esta lista')
        + '; quedan registradas en `data/tablas_revisadas.json`, que se aplica '
        'encima de la reconstrucción automática.'
    )
    # Con la revisión cerrada, las cuatro secciones son cuatro encabezados
    # seguidos de «Ninguna»: cuatro veces la misma buena noticia. Se omiten y el
    # documento pasa a ser lo que quedó anotado.
    if not terminado:
        for titulo, nota, items in secciones:
            out.append(titulo + '\n\n' + nota)
            out.append(tabla_md([(t, c) for t, c, _ in items]))

    out.append(PIE.strip())
    out.append((CIERRE_PENDIENTE if not terminado else CIERRE_TERMINADO).strip())

    out_path.write_text('\n\n'.join(out).rstrip() + '\n', encoding='utf-8')
    print(
        f'{out_path}: {len(criticas)} prioridad alta, {len(dudosas)} dudosas, '
        f'{len(confianza)} verificación de control, {len(sin_senales)} sin '
        f'señales, {len(verificadas)} verificadas, {len(tablas)} tablas en total.'
    )


if __name__ == '__main__':
    main()
