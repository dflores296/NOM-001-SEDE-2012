# Revisión de tablas — NOM-001-SEDE-2012

Lista de trabajo para contrastar las tablas reconstruidas contra el PDF del DOF.
Ordenada por **impacto por duda**: cuánto se apoya la norma en cada tabla, por lo
insegura que quedó su reconstrucción. Empezar por arriba es lo que más corrige por hora.

La versión navegable, con enlaces a cada tabla, está en
[/revision](https://dflores296.github.io/NOM-001-SEDE-2012/revision/).

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

**89 de 219 tablas ya se contrastaron celda por celda contra el PDF** y salen de esta lista; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## 1 · Prioridad alta (6)

Muy usadas y con la reconstrucción insegura: o la calidad las señala, o traen la firma de la columna fantasma en el encabezado. Un error aquí se propaga a muchos cálculos.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `922-54` | Separación de conductores a edificios y otras construcciones excepto p… | 719, 720 | 1 | 0.95 | **sí** | dibujada | 16×10 |
| [ ] | `450-3(a)` | Valor nominal o ajuste máximo de la protección contra sobrecorriente p… | 335, 336 | 1 | 0.97 | **sí** | **huecos** | 14×5 |
| [ ] | `4` | Dimensiones y porcentaje disponible para los conductores del área del… | 743, 744, 745, 746, 747 | 1 | 1.00 | **sí** | dibujada | 168×8 |
| [ ] | `5` | Dimensiones de los conductores aislados y cables para artefactos | 747, 748, 749, 750 | 1 | 1.00 | **sí** | dibujada | 187×11 |
| [ ] | `8` | Propiedades de los conductores | 750, 751 | 1 | 1.00 | **sí** | dibujada | 40×10 |
| [ ] | `10` | Número de hilos de los cables | 752 | 1 | 1.00 | **sí** | dibujada | 14×5 |

## 2 · Dudosas (0)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

Ninguna: ya están todas contrastadas contra el PDF.

## 3 · Verificación de control (9)

Salieron limpias, con el encabezado bien, y son muy usadas. Conviene mirarlas justamente por eso: una tabla equivocada que *parece* correcta es más peligrosa que una marcada como dudosa. Basta comprobar dos o tres renglones de cada una.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `1` | Porcentaje de la sección transversal en tubo conduit y en tubería para… | 742 | 34 | 1.00 | — | dibujada | 4×2 |
| [ ] | `430-52` | Ajuste máximo de los dispositivos de protección contra cortocircuito y… | 310, 311 | 15 | 1.00 | — | dibujada | 9×5 |
| [ ] | `2` | Radio de las curvas del tubo conduit y tuberías | 743 | 10 | 1.00 | — | dibujada | 14×4 |
| [ ] | `310-15(b)(19)` | Ampacidades permisibles de conductores aislados individuales para Tens… | 139 | 9 | 1.00 | — | dibujada | 17×6 |
| [ ] | `922-93` | Factores de sobrecarga mínimos para cada clase de construcción de líne… | 726, 727 | 6 | 1.00 | — | dibujada | 33×8 |
| [ ] | `310-60(c)(67)` | Ampacidad permisible de cables monoconductores de cobre aislados en co… | 143 | 5 | 1.00 | — | **huecos** | 18×6 |
| [ ] | `314-16(b)` | Volumen que es requerido considerar para cada conductor | 165 | 5 | 1.00 | — | dibujada | 9×3 |
| [ ] | `352-44` | Características de expansión del tubo conduit rígido no metálico de PV… | 196, 197 | 5 | 1.00 | — | dibujada | 21×2 |
| [ ] | `500-8(c)` | Clasificación de la temperatura superficial máxima | 360 | 5 | 1.00 | — | dibujada | 15×2 |

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
