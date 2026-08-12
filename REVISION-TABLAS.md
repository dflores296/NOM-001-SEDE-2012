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

**161 de 220 tablas ya se contrastaron celda por celda contra el PDF** y salen de esta lista; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## 1 · Prioridad alta (0)

Muy usadas y con la reconstrucción insegura: o la calidad las señala, o traen la firma de la columna fantasma en el encabezado. Un error aquí se propaga a muchos cálculos.

Ninguna: ya están todas contrastadas contra el PDF.

## 2 · Dudosas (0)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

Ninguna: ya están todas contrastadas contra el PDF.

## 3 · Verificación de control (0)

Salieron limpias, con el encabezado bien, y son muy usadas. Conviene mirarlas justamente por eso: una tabla equivocada que *parece* correcta es más peligrosa que una marcada como dudosa. Basta comprobar dos o tres renglones de cada una.

Ninguna: ya están todas contrastadas contra el PDF.

## 4 · Sin señales (59)

Ninguna heurística las marcó —ni calidad baja, ni columna fantasma, ni uso suficiente para "verificación de control"— pero eso no es lo mismo que fieles: nunca se han contrastado contra el PDF. Ordenadas por página para revisarlas de corrido.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `430-12(c)(1)` | Espacio para las terminales (Terminales fijas) | 303 | 1 | 1.00 | — | dibujada | 5×3 |
| [ ] | `430-22(e)` | Servicio por régimen de tiempo. | 304 | 4 | 0.97 | — | dibujada | 7×5 |
| [ ] | `430-23(c)` | Conductor del secundario | 305 | 1 | 1.00 | — | dibujada | 8×2 |
| [ ] | `430-29` | Factores de ampacidad del conductor para resistencias de potencia | 306 | 2 | 1.00 | — | dibujada | 9×3 |
| [ ] | `430-37` | Dispositivos de sobrecarga para protección del motor | 309 | 3 | 0.90 | — | **huecos** | 10×3 |
| [ ] | `430-72(b)` | Ajuste máximo de los dispositivos de protección contra sobrecorriente… | 314 | 4 | 1.00 | — | dibujada | 9×8 |
| [ ] | `440-3(d)` | Otros artículos | 327 | 1 | 0.94 | — | **huecos** | 6×4 |
| [ ] | `450-3(b)` | Valor nominal o ajuste máximo de la protección contra sobrecorriente p… | 336 | 1 | 1.00 | — | dibujada | 4×6 |
| [ ] | `490-24` | Espacio mínimo de seguridad de las partes vivas | 350 | 2 | 0.99 | — | dibujada | 23×7 |
| [ ] | `500-8(d)(2)` | Temperaturas Clase II | 361 | 1 | 1.00 | — | dibujada | 6×4 |
| [ ] | `504-10(b)` | Evaluación para la clasificación T4 de acuerdo con el tamaño y la temp… | 381 | 1 | 1.00 | — | dibujada | 4×2 |
| [ ] | `505-7(d)` | Distancia mínima de las obstrucciones desde aberturas bridadas a prueb… | 387 | 1 | 1.00 | — | dibujada | 5×2 |
| [ ] | `505-9(c)(1)(2)` | Grupos de clasificación de gas | 388 | 2 | 1.00 | — | dibujada | 2×2 |
| [ ] | `505-9(c)(2)(4)` | Designación de tipos de protección | 389, 390 | 3 | 0.88 | — | dibujada | 19×3 |
| [ ] | `505-9(d)(1)` | Clasificación de la temperatura superficial máxima para equipos eléctr… | 390 | 2 | 1.00 | — | dibujada | 7×2 |
| [ ] | `506-9(c)(2)(3)` | Designación de tipos de protección | 401 | 1 | 0.85 | — | **huecos** | 9×3 |
| [ ] | `514-3(b)(1)` | Areas peligrosas (clasificadas) Clase I: Estaciones de servicio y gaso… | 410, 411, 412 | 3 | 0.90 | — | **huecos** | 45×4 |
| [ ] | `515-3` | Clasificación eléctrica de las áreas | 414, 415, 416, 417 | 2 | 0.90 | — | dibujada | 55×4 |
| [ ] | `520-44` | Ampacidad permitida para cordones de uso extra rudo aprobados con una… | 454 | 4 | 0.94 | — | dibujada | 14×5 |
| [ ] | `522-22` | Ampacidad del conductor basada en conductores de cobre con aislamiento… | 460 | 2 | 1.00 | — | dibujada | 10×3 |
| [ ] | `552-10(e)(1)` | Protección contra sobrecorriente para baja tensión | 496 | 0 | 1.00 | — | **huecos** | 6×4 |
| [ ] | `555-12` | Factores de demanda | 507 | 3 | 1.00 | — | dibujada | 9×2 |
| [ ] | `610-14(a)` | Ampacidades para conductores de cobre aislados basados en una temperat… | 522, 523 | 3 | 1.00 | — | dibujada | 39×8 |
| [ ] | `610-14(b)` | Factores para determinar la ampacidad de los conductores secundarios e… | 523 | 0 | 1.00 | — | dibujada | 9×3 |
| [ ] | `610-14(d)` | Tamaño mínimo del conductor de contacto basado en la distancia entre s… | 523 | 1 | 0.88 | — | dibujada | 4×2 |
| [ ] | `610-14(e)` | Factores de demanda | 523, 524 | 1 | 1.00 | — | dibujada | 7×2 |
| [ ] | `620-14` | Factores de demanda del alimentador para elevadores | 530 | 1 | 1.00 | — | dibujada | 11×2 |
| [ ] | `630-11(a)` | Factores de multiplicación para el régimen de trabajo para soldadoras… | 547 | 1 | 1.00 | — | dibujada | 11×3 |
| [ ] | `645-5` | Tipos de cables permitidos bajo pisos falsos | 556 | 1 | 1.00 | — | dibujada | 8×4 |
| [ ] | `680-3` | Otros Artículos | 570 | 1 | 1.00 | — | **huecos** | 5×2 |
| [ ] | `680-8` | Libramientos para conductores aéreos | 571 | 3 | 0.84 | — | **huecos** | 6×4 |
| [ ] | `680-10` | Profundidad mínima del recubrimiento | 572 | 1 | 0.92 | — | **huecos** | 7×2 |
| [ ] | `690-31(c)` | Factores de corrección | 596 | 1 | 1.00 | — | **huecos** | 11×5 |
| [ ] | `705-3` | Otros artículos | 627 | 1 | 0.93 | — | dibujada | 7×2 |
| [ ] | `760-154(d)` | Sustituciones de los cables | 648 | 1 | 1.00 | — | dibujada | 4×3 |
| [ ] | `760-179(i)` | Marcados de cables | 650 | 1 | 1.00 | — | dibujada | 4×2 |
| [ ] | `770-154(b)` | Sustituciones de cables | 657, 658 | 1 | 1.00 | — | dibujada | 7×2 |
| [ ] | `770-179` | Marcado de cables | 658 | 2 | 1.00 | — | dibujada | 9×2 |
| [ ] | `800-154(b)` | Sustituciones de cables. | 669 | 1 | 1.00 | — | dibujada | 4×2 |
| [ ] | `800-179` | Marcado en cables | 670 | 1 | 1.00 | — | dibujada | 7×2 |
| [ ] | `810-16(a)` | Tamaño de los conductores de antena exterior para estaciones receptora… | 672 | 1 | 0.96 | — | dibujada | 5×7 |
| [ ] | `810-52` | Tamaño de los conductores para exteriores. | 674 | 1 | 0.94 | — | dibujada | 5×5 |
| [ ] | `820-154(b)` | Uso y sustituciones permitidas de cable coaxial | 682 | 2 | 1.00 | — | dibujada | 5×2 |
| [ ] | `820-179` | Marcado en cables coaxiales | 683 | 1 | 1.00 | — | dibujada | 5×2 |
| [ ] | `830-154(b)` | Sustitución de Cable | 694 | 3 | 1.00 | — | dibujada | 6×2 |
| [ ] | `921-25(b)` | Resistencia a tierra del sistema. | 704 | 0 | 1.00 | — | dibujada | 4×3 |
| [ ] | `922-10` | Ampacidad de conductores desnudos en amperes | 708 | 1 | 1.00 | — | dibujada | 20×5 |
| [ ] | `922-12(a)(2)` | Separación horizontal mínima "S" de conductores en sus soportes fijos,… | 710 | 1 | 0.85 | — | **huecos** | 7×11 |
| [ ] | `922-13(a)` | Separación vertical mínima entre conductores, en sus soportes en metro… | 710, 711 | 5 | 0.89 | — | dibujada | 9×7 |
| [ ] | `922-31(e)(2)` | Distancia del punto de cruce a la estructura más cercana | 716 | 1 | 1.00 | — | dibujada | 11×2 |
| [ ] | `922-83` | Condiciones meteorológicas para el cálculo de cargas mecánicas | 723 | 2 | 1.00 | — | dibujada | 8×5 |
| [ ] | `922-84` | Presiones de viento mínimas para diseño de estructura | 724 | 2 | 1.00 | — | dibujada | 7×5 |
| [ ] | `922-84(a)` | Factor de incremento de presión de viento por altura de estructura | 724 | 1 | 1.00 | — | dibujada | 6×2 |
| [ ] | `922-93(a)(1)` | Tamaño mínimo de conductores de cobre | 725 | 1 | 1.00 | — | **huecos** | 5×3 |
| [ ] | `922-94` | Clase de construcción requerida para líneas aéreas | 727 | 1 | 0.98 | — | dibujada | 12×5 |
| [ ] | `923-3(f)(1)` | Separación mínima entre cables eléctricos y de comunicación propia del… | 729 | 1 | 0.80 | — | dibujada | 5×2 |
| [ ] | `923-5(a)` | Altura mínima de partes vivas de terminales en metros | 730, 731 | 1 | 0.92 | — | dibujada | 5×3 |
| [ ] | `923-11` | Profundidad mínima de los ductos o bancos de ductos | 735 | 1 | 1.00 | — | dibujada | 6×2 |
| [ ] | `923-12(b)` | Separación mínima entre ductos o bancos de ductos y con respecto a otr… | 735 | 2 | 1.00 | — | dibujada | 4×2 |

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

- Las tablas que siguen listadas arriba, secciones 1 a 4.
