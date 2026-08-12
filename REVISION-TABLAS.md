# Revisión de tablas — NOM-001-SEDE-2012

Lista de trabajo para contrastar las tablas reconstruidas contra el PDF del DOF.
Ordenada por **impacto por duda**: cuántas veces la cita la norma, por lo insegura
que quedó su reconstrucción. Empezar por arriba es lo que más corrige por hora.

La versión navegable, con enlaces a cada tabla, está en
[/revision](https://dflores296.github.io/NOM-001-SEDE-2012/revision/).

> Este archivo se genera con `python3 tools/build_revision.py data/
> REVISION-TABLAS.md`. No editar a mano: los cambios se pierden en la próxima
> regeneración.

Columnas: **cal.** calidad estimada de la separación en celdas (1.00 = ninguna celda
con varios valores juntos) · **rejilla** de dónde salieron las columnas: `dibujada`
son las líneas del PDF, `huecos` son los espacios entre palabras, que es mucho menos
fiable y no recupera celdas combinadas.

**26 de 219 tablas ya se contrastaron celda por celda contra el PDF** y salen de esta lista; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## 1 · Prioridad alta (0)

Muy citadas y con la reconstrucción insegura. Un error aquí se propaga a muchos cálculos.

Ninguna: ya están todas contrastadas contra el PDF.

## 2 · Dudosas (0)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

Ninguna: ya están todas contrastadas contra el PDF.

## 3 · Verificación de control (14)

Salieron limpias y son muy citadas. Conviene mirarlas justamente por eso: una tabla equivocada que *parece* correcta es más peligrosa que una marcada como dudosa. Basta comprobar dos o tres renglones de cada una.

| | Tabla | Título | Pág. PDF | Citas | Cal. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|
| [ ] | `1` | Porcentaje de la sección transversal en tubo conduit y en tubería para… | 742 | 23 | 1.00 | dibujada | 4×2 |
| [ ] | `250-122` | Tamaño mínimo de los conductores de puesta a tierra para canalizacione… | 108 | 22 | 1.00 | dibujada | 22×5 |
| [ ] | `310-104(a)` | Aplicaciones y aislamientos de conductores de 600 volts | 155, 156, 157 | 14 | 1.00 | dibujada | 46×6 |
| [ ] | `430-52` | Ajuste máximo de los dispositivos de protección contra cortocircuito y… | 310, 311 | 11 | 1.00 | dibujada | 9×5 |
| [ ] | `2` | Radio de las curvas del tubo conduit y tuberías | 743 | 10 | 1.00 | dibujada | 14×4 |
| [ ] | `220-55` | Factores de demanda y cargas para estufas eléctricas domésticas, horno… | 49 | 7 | 0.98 | **huecos** | 32×4 |
| [ ] | `312-6(a)` | Espacio mínimo para el doblado de los cables en las terminales, y anch… | 161 | 6 | 1.00 | dibujada | 17×7 |
| [ ] | `922-93` | Factores de sobrecarga mínimos para cada clase de construcción de líne… | 726, 727 | 6 | 1.00 | dibujada | 33×8 |
| [ ] | `314-16(b)` | Volumen que es requerido considerar para cada conductor | 165 | 5 | 1.00 | dibujada | 9×3 |
| [ ] | `500-8(c)` | Clasificación de la temperatura superficial máxima | 360 | 5 | 1.00 | dibujada | 15×2 |
| [ ] | `110-28` | Tipos de envolvente | 24, 25 | 4 | 1.00 | dibujada | 26×19 |
| [ ] | `402-5` | Ampacidad admisible de alambres para artefactos | 249, 250 | 4 | 1.00 | **huecos** | 6×3 |
| [ ] | `430-22(e)` | Servicio por régimen de tiempo. | 304 | 4 | 0.97 | dibujada | 7×5 |
| [ ] | `725-154(g)` | Sustituciones de los cables | 638, 639 | 4 | 1.00 | dibujada | 10×2 |

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
- **Y también se queda corta.** Hay tablas peores de lo que dice su nota: las que el
  PDF no separa con líneas horizontales colapsan todas sus filas en una sola, y eso
  la métrica no lo ve. Conviene mirar el número de filas contra el PDF, no solo la
  calidad.

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
