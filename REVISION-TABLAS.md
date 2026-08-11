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

## 1 · Prioridad alta (8)

Muy citadas y con la reconstrucción insegura. Un error aquí se propaga a muchos cálculos.

| | Tabla | Título | Pág. PDF | Citas | Cal. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|
| [ ] | `400-4` | Cordones y cables flexibles (Ver 400-4) | 241, 242, 243, 244 | 22 | 0.75 | dibujada | 132×14 |
| [ ] | `250-66` | Conductor del electrodo de puesta a tierra para sistemas de corriente… | 98 | 9 | 0.79 | dibujada | 10×8 |
| [ ] | `392-22(a)` | Area de ocupación permisible para cables multiconductores en charolas… | 231 | 2 | 0.58 | **huecos** | 16×3 |
| [ ] | `922-22(a)` | Separación de conductores eléctricos verticales y derivados con respec… | 715 | 2 | 0.58 | dibujada | 3×4 |
| [ ] | `220-42` | Factores de demanda de cargas de alumbrado | 47 | 4 | 0.75 | **huecos** | 12×5 |
| [ ] | `392-22(b)(1)` | Area de ocupación permisible para cables de un solo conductor en charo… | 233 | 2 | 0.59 | **huecos** | 15×4 |
| [ ] | `630-31(a)(2)` | Factores de multiplicación del régimen de trabajo para soldadoras por… | 548 | 1 | 0.43 | **huecos** | 3×3 |
| [ ] | `402-3` | Cables para artefactos | 248, 249 | 4 | 0.79 | dibujada | 34×9 |

## 2 · Dudosas (14)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

| | Tabla | Título | Pág. PDF | Citas | Cal. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|
| [ ] | `400-5(a)(3)` | Factores de ajuste para más de tres conductores de fase en un cable o… | 245 | 2 | 0.67 | **huecos** | 7×3 |
| [ ] | `922-15(a)` | Separación mínima en cualquier dirección (milímetros) | 711, 712 | 2 | 0.73 | **huecos** | 22×6 |
| [ ] | `210-24` | Resumen de requisitos de los circuitos derivados | 38 | 2 | 0.79 | **huecos** | 11×6 |
| [ ] | `326-112` | Espesor del papel separador | 177 | 1 | 0.56 | dibujada | 3×3 |
| [ ] | `430-7(b)` | Letras de código de indicación para rotor bloqueado | 300 | 1 | 0.57 | **huecos** | 20×4 |
| [ ] | `690-7` | Factores de corrección de la tensión para | 592 | 1 | 0.58 | **huecos** | 15×3 |
| [ ] | `310-15(b)(3)(c)` | Ajustes a la temperatura ambiente para canalizaciones circulares expue… | 136 | 1 | 0.64 | **huecos** | 5×3 |
| [ ] | `530-19(a)` | Factores de demanda para el alumbrado del escenario | 465 | 1 | 0.67 | **huecos** | 5×4 |
| [ ] | `725-179` | Marcado de los cables | 640, 641 | 1 | 0.67 | dibujada | 3×2 |
| [ ] | `355-30` | Soportes para tubo conduit de resina termofija reforzada (RTRC) | 201, 202 | 1 | 0.68 | **huecos** | 7×4 |
| [ ] | `551-73(a)` | Factores de demanda para los conductores de entrada de acometida y ali… | 493 | 1 | 0.78 | dibujada | 8×4 |
| [ ] | `550-31` | Factores de demanda para conductores de entrada de acometida y aliment… | 481 | 1 | 0.79 | dibujada | 14×2 |
| [ ] | `922-93(b)(1)` | Porcentaje de tensión mecánica máxima del cable de acero a 0 °C sin ca… | 725, 726 | 0 | 0.67 | dibujada | 2×3 |
| [ ] | `430-12(c)(2)` | Volúmenes utilizables (Terminales fijos) | 303 | 0 | 0.75 | **huecos** | 5×4 |

## 3 · Verificación de control (13)

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
| [ ] | `430-22(e)` | Servicio por régimen de tiempo. | 304 | 4 | 0.97 | dibujada | 7×5 |
| [ ] | `725-154(g)` | Sustituciones de los cables | 638, 639 | 4 | 1.00 | dibujada | 10×2 |

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
