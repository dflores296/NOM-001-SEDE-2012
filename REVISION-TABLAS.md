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

**29 de 219 tablas ya se contrastaron celda por celda contra el PDF** y salen de esta lista; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## 1 · Prioridad alta (47)

Muy usadas y con la reconstrucción insegura: o la calidad las señala, o traen la firma de la columna fantasma en el encabezado. Un error aquí se propaga a muchos cálculos.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `250-122` | Tamaño mínimo de los conductores de puesta a tierra para canalizacione… | 108 | 24 | 1.00 | **sí** | dibujada | 22×5 |
| [ ] | `430-249` | Corriente a plena carga para motores de dos fases de corriente alterna… | 325 | 14 | 1.00 | **sí** | dibujada | 24×7 |
| [ ] | `430-248` | Corriente a plena carga de motores monofásicos de corriente alterna | 324 | 12 | 1.00 | **sí** | dibujada | 14×6 |
| [ ] | `312-6(a)` | Espacio mínimo para el doblado de los cables en las terminales, y anch… | 161 | 11 | 1.00 | **sí** | dibujada | 17×7 |
| [ ] | `430-247` | Corriente a plena carga para motores de corriente continua Los siguien… | 324 | 9 | 1.00 | **sí** | dibujada | 26×5 |
| [ ] | `220-55` | Factores de demanda y cargas para estufas eléctricas domésticas, horno… | 49 | 8 | 0.98 | **sí** | **huecos** | 32×4 |
| [ ] | `310-15(b)(17)` | Ampacidades permisibles de conductores individuales aislados para tens… | 138, 139 | 7 | 1.00 | **sí** | dibujada | 34×8 |
| [ ] | `310-60(c)(70)` | Ampacidad de conductores individuales de aluminio, aislados, separados… | 144, 145 | 5 | 0.99 | **sí** | **huecos** | 21×8 |
| [ ] | `430-251(a)` | Conversión de corrientes monofásicas a rotor bloqueado, para la selecc… | 326 | 5 | 1.00 | **sí** | dibujada | 12×5 |
| [ ] | `430-251(b)` | Conversión de corriente polifásica máxima a rotor bloqueado, diseños B… | 326 | 5 | 1.00 | **sí** | dibujada | 31×8 |
| [ ] | `210-21(b)(2)` | Carga máxima conectada a un contacto por medio de un cordón y clavija. | 37 | 4 | 0.92 | **sí** | dibujada | 5×3 |
| [ ] | `11(A)` | Limitaciones de las fuentes de alimentación de corriente alterna de Cl… | 752, 753 | 4 | 0.95 | **sí** | dibujada | 9×10 |
| [ ] | `300-5` | Requisitos de profundidad mínima en instalaciones de 0 a 600 volts | 121 | 4 | 0.96 | **sí** | dibujada | 11×6 |
| [ ] | `310-60(c)(69)` | Ampacidad de conductores de cobre individuales, aislados, y separados… | 144 | 4 | 0.98 | **sí** | dibujada | 22×8 |
| [ ] | `110-28` | Tipos de envolvente | 24, 25 | 4 | 1.00 | **sí** | dibujada | 26×19 |
| [ ] | `400-5(a)(1)` | Ampacidad permisible para cables y cordones flexibles a temperatura am… | 244, 245 | 4 | 1.00 | **sí** | dibujada | 17×6 |
| [ ] | `400-5(a)(2)` | Ampacidad de los cables tipo SC, SCE, SCT, PPE, G, G-GC y W (Basada en… | 245 | 4 | 1.00 | **sí** | dibujada | 26×11 |
| [ ] | `314-16(a)` | Cajas metálicas | 164 | 3 | 0.92 | **sí** | **huecos** | 26×10 |
| [ ] | `830-47` | Requisitos de profundidad mínima de los sistemas de comunicaciones de… | 688 | 3 | 0.96 | **sí** | dibujada | 7×4 |
| [ ] | `310-60(c)(86)` | Ampacidad de tres ternas de conductores individuales de aluminio, aisl… | 154, 155 | 3 | 0.99 | **sí** | **huecos** | 34×6 |
| [ ] | `310-15(b)(20)` | Ampacidades de no más de tres conductores individuales aislados para T… | 139, 140 | 3 | 0.99 | **sí** | dibujada | 26×6 |
| [ ] | `312-6(b)` | Espacio mínimo para el doblado del alambre en las terminales | 161, 162 | 3 | 0.99 | **sí** | dibujada | 29×7 |
| [ ] | `430-97` | Espacio mínimo entre partes metálicas desnudas | 317 | 3 | 1.00 | **sí** | dibujada | 6×4 |
| [ ] | `770-154(a)` | Aplicaciones canalizaciones y cable de fibra óptica aprobados, y ensam… | 656, 657 | 3 | 1.00 | **sí** | dibujada | 24×10 |
| [ ] | `800-154(a)` | Aplicaciones de alambres, cables y canalizaciones de comunicaciones ap… | 668, 669 | 3 | 1.00 | **sí** | dibujada | 27×12 |
| [ ] | `820-154(a)` | Aplicaciones de cables coaxiales aprobados para su uso en edificios | 683, 684 | 3 | 1.00 | **sí** | dibujada | 28×6 |
| [ ] | `922-33` | Separación vertical entre conductores soportados en diferentes estruct… | 717 | 2 | 0.92 | **sí** | dibujada | 10×9 |
| [ ] | `310-104(e)` | Espesor del aislamiento para cables con dieléctricos sólidos, con pant… | 158 | 2 | 0.94 | **sí** | **huecos** | 15×12 |
| [ ] | `922-41` | Altura mínima de conductores sobre el suelo, agua o vías férreas (m)(1… | 717, 718 | 2 | 0.96 | **sí** | dibujada | 14×11 |
| [ ] | `310-15(b)(2)(b)` | Factores de Corrección basados en una temperatura ambiente de 40 °C. | 134, 135 | 2 | 1.00 | **sí** | dibujada | 27×7 |
| [ ] | `310-60(c)(75)` | Ampacidad de cables de tres conductores de cobre aislados y en un tubo… | 147 | 2 | 1.00 | **sí** | dibujada | 18×6 |
| [ ] | `348-22` | Número máximo de conductores aislados en el tubo conduit metálico flex… | 192 | 2 | 1.00 | **sí** | **huecos** | 7×10 |
| [ ] | `392-22(a)(5)` | Area de ocupación permisible para cables multiconductores en charolas… | 232 | 2 | 1.00 | **sí** | **huecos** | 6×3 |
| [ ] | `392-22(a)(6)` | Area de ocupación permisible para cables multiconductores en charolas… | 232 | 2 | 1.00 | **sí** | dibujada | 7×3 |
| [ ] | `625-29(d)(2)` | Ventilación mínima requerida en ft3/min, por cada número total de vehí… | 542 | 2 | 1.00 | **sí** | dibujada | 16×8 |
| [ ] | `310-106(a)` | Tamaño o designación mínimo de los conductores | 158 | 1 | 0.87 | **sí** | dibujada | 9×5 |
| [ ] | `430-12(b)` | Medidas mínimas de las cajas terminales para conexiones de cable a cab… | 302 | 1 | 0.91 | **sí** | dibujada | 28×10 |
| [ ] | `11(B)` | Limitaciones de las fuentes de alimentación de corriente continua de C… | 753 | 1 | 0.94 | **sí** | dibujada | 8×11 |
| [ ] | `922-54` | Separación de conductores a edificios y otras construcciones excepto p… | 719, 720 | 1 | 0.95 | **sí** | dibujada | 16×10 |
| [ ] | `450-3(a)` | Valor nominal o ajuste máximo de la protección contra sobrecorriente p… | 335, 336 | 1 | 0.97 | **sí** | **huecos** | 14×5 |
| [ ] | `310-60(c)(82)` | Ampacidad de conductores individuales de aluminio, aislados, directame… | 152 | 1 | 0.99 | **sí** | dibujada | 34×6 |
| [ ] | `4` | Dimensiones y porcentaje disponible para los conductores del área del… | 743, 744, 745, 746, 747 | 1 | 1.00 | **sí** | dibujada | 168×8 |
| [ ] | `310-15(b)(21)` | Ampacidades de conductores desnudos o recubiertos, al aire libre, con… | 140 | 1 | 1.00 | **sí** | dibujada | 23×8 |
| [ ] | `830-154(a)` | Aplicaciones de cables de comunicaciones de banda ancha para su uso en… | 694, 695 | 1 | 1.00 | **sí** | dibujada | 27×9 |
| [ ] | `5` | Dimensiones de los conductores aislados y cables para artefactos | 747, 748, 749, 750 | 1 | 1.00 | **sí** | dibujada | 187×11 |
| [ ] | `8` | Propiedades de los conductores | 750, 751 | 1 | 1.00 | **sí** | dibujada | 40×10 |
| [ ] | `10` | Número de hilos de los cables | 752 | 1 | 1.00 | **sí** | dibujada | 14×5 |

## 2 · Dudosas (0)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

Ninguna: ya están todas contrastadas contra el PDF.

## 3 · Verificación de control (11)

Salieron limpias, con el encabezado bien, y son muy usadas. Conviene mirarlas justamente por eso: una tabla equivocada que *parece* correcta es más peligrosa que una marcada como dudosa. Basta comprobar dos o tres renglones de cada una.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `1` | Porcentaje de la sección transversal en tubo conduit y en tubería para… | 742 | 34 | 1.00 | — | dibujada | 4×2 |
| [ ] | `310-104(a)` | Aplicaciones y aislamientos de conductores de 600 volts | 155, 156, 157 | 18 | 1.00 | — | dibujada | 46×6 |
| [ ] | `430-250` | Corriente a plena carga de motores trifásicos de corriente alterna | 325 | 16 | 1.00 | — | dibujada | 29×13 |
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
