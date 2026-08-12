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

**111 de 220 tablas ya se contrastaron celda por celda contra el PDF** y salen de esta lista; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## 1 · Prioridad alta (0)

Muy usadas y con la reconstrucción insegura: o la calidad las señala, o traen la firma de la columna fantasma en el encabezado. Un error aquí se propaga a muchos cálculos.

Ninguna: ya están todas contrastadas contra el PDF.

## 2 · Dudosas (0)

Bajo el umbral de confianza (calidad < 0.80), pero poco citadas. Menos urgentes.

Ninguna: ya están todas contrastadas contra el PDF.

## 3 · Verificación de control (0)

Salieron limpias, con el encabezado bien, y son muy usadas. Conviene mirarlas justamente por eso: una tabla equivocada que *parece* correcta es más peligrosa que una marcada como dudosa. Basta comprobar dos o tres renglones de cada una.

Ninguna: ya están todas contrastadas contra el PDF.

## 4 · Sin señales (109)

Ninguna heurística las marcó —ni calidad baja, ni columna fantasma, ni uso suficiente para "verificación de control"— pero eso no es lo mismo que fieles: nunca se han contrastado contra el PDF. Ordenadas por página para revisarlas de corrido.

| | Tabla | Título | Pág. PDF | Usos | Cal. | Enc. | Rejilla | Tamaño |
|---|---|---|---|---|---|---|---|---|
| [ ] | `110-26(a)(1)` | Espacios de trabajo | 22 | 2 | 1.00 | — | dibujada | 4×4 |
| [ ] | `110-31` | Distancia mínima desde la cerca hasta las partes vivas | 25 | 1 | 0.88 | — | dibujada | 4×2 |
| [ ] | `110-34(a)` | Distancia mínima del espacio de trabajo en una instalación eléctrica | 26, 27 | 2 | 0.89 | — | dibujada | 9×4 |
| [ ] | `110-34(e)` | Altura de las partes vivas sin proteger sobre el espacio de trabajo | 27 | 1 | 0.86 | — | **huecos** | 4×3 |
| [ ] | `210-2` | Circuitos derivados de propósito específico | 32 | 1 | 0.98 | — | dibujada | 28×3 |
| [ ] | `210-21(b)(3)` | Capacidad nominal de contactos en circuitos de varias capacidades | 37 | 2 | 0.85 | — | dibujada | 7×2 |
| [ ] | `220-44` | Factores de demanda para cargas de contactos en inmuebles que no son u… | 48 | 1 | 1.00 | — | dibujada | 3×2 |
| [ ] | `220-54` | Factores de demanda para secadoras domésticas de ropa | 48 | 2 | 1.00 | — | dibujada | 12×2 |
| [ ] | `220-56` | Factores de demanda para equipos de cuartos de cocina diferentes a uni… | 50 | 2 | 1.00 | — | **huecos** | 7×2 |
| [ ] | `220-84` | Cálculo opcional. Factores de demanda para unidades multifamiliares co… | 52 | 2 | 1.00 | — | **huecos** | 24×2 |
| [ ] | `220-86` | Método opcional - Factores de demanda para conductores de alimentadore… | 53 | 2 | 0.88 | — | dibujada | 4×2 |
| [ ] | `220-88` | Método opcional - Cálculos de la carga permitida para los conductores… | 53 | 1 | 0.80 | — | dibujada | 5×3 |
| [ ] | `220-102` | Método para calcular las cargas de instalaciones agrícolas que no sean… | 54 | 2 | 1.00 | — | dibujada | 4×2 |
| [ ] | `220-103` | Método para calcular la carga total de una instalación agrícola | 54 | 2 | 1.00 | — | dibujada | 5×2 |
| [ ] | `225-3` | Otros Artículos | 54, 55 | 1 | 0.98 | — | **huecos** | 25×2 |
| [ ] | `225-60` | Libramientos sobre carretera, pasillos, rieles, agua y campo abierto | 59 | 2 | 1.00 | — | dibujada | 8×2 |
| [ ] | `225-61` | Libramientos sobre edificios y otras estructuras | 59 | 1 | 1.00 | — | **huecos** | 8×3 |
| [ ] | `230-51(c)` | Soportes y separación de los conductores individuales de recepción del… | 65 | 0 | 1.00 | — | dibujada | 6×4 |
| [ ] | `240-3` | Otros artículos | 71, 72 | 2 | 0.98 | — | **huecos** | 36×2 |
| [ ] | `300-16(c)` | Designación métrica y tamaños comerciales | 118 | 0 | 1.00 | — | **huecos** | 14×2 |
| [ ] | `300-50` | Requisitos de profundidad mínimaa | 130 | 2 | 0.95 | — | dibujada | 7×7 |
| [ ] | `310-15(b)(2)(a)` | Factores de Corrección basados en una temperatura ambiente de 30 °C. | 134 | 3 | 1.00 | — | dibujada | 18×4 |
| [ ] | `310-15(b)(3)(a)` | Factores de ajuste para más de tres conductores portadores de corrient… | 135 | 2 | 1.00 | — | dibujada | 7×2 |
| [ ] | `310-15(b)(7)` | Tipos y tamaño o designación de conductores para alimentadores monofás… | 137 | 1 | 1.00 | — | **huecos** | 14×5 |
| [ ] | `310-15(b)(18)` | Ampacidades permisibles de conductores aislados para tensiones hasta e… | 139 | 2 | 1.00 | — | dibujada | 17×6 |
| [ ] | `310-60(c)(4)` | Factores de corrección a temperatura ambiente | 142, 143 | 1 | 1.00 | — | dibujada | 20×3 |
| [ ] | `310-60(c)(68)` | Ampacidad de cables de ternas de conductores individuales de aluminio,… | 143, 144 | 2 | 1.00 | — | **huecos** | 17×6 |
| [ ] | `310-60(c)(71)` | Ampacidad de cables de tres conductores de cobre, aislados, separados… | 145 | 0 | 1.00 | — | **huecos** | 18×6 |
| [ ] | `310-60(c)(72)` | Ampacidad de cables de tres conductores de aluminio, aislados, separad… | 146 | 1 | 1.00 | — | **huecos** | 17×6 |
| [ ] | `310-60(c)(73)` | Ampacidad de cables de tres conductores o ternas de cables individuale… | 146 | 0 | 1.00 | — | **huecos** | 18×6 |
| [ ] | `310-60(c)(74)` | Ampacidad de cables de tres conductores o ternas de cables individuale… | 146, 147 | 0 | 0.98 | — | **huecos** | 17×6 |
| [ ] | `310-60(c)(76)` | Ampacidad de cables de tres conductores de aluminio aislados, en un tu… | 147, 148 | 2 | 1.00 | — | **huecos** | 17×6 |
| [ ] | `310-60(c)(80)` | Ampacidad de tres conductores de aluminio aislados, alambrados dentro… | 150, 151 | 0 | 1.00 | — | **huecos** | 50×6 |
| [ ] | `310-60(c)(81)` | Ampacidad de conductores individuales de cobre, aislados, directamente… | 151, 152 | 1 | 0.99 | — | **huecos** | 35×6 |
| [ ] | `326-116` | Dimensiones del conduit | 177 | 1 | 1.00 | — | **huecos** | 5×4 |
| [ ] | `326-24` | Radio mínimo de curvatura | 177 | 1 | 1.00 | — | **huecos** | 5×3 |
| [ ] | `326-80` | Ampacidad de los cables tipo IGS | 177 | 1 | 1.00 | — | **huecos** | 10×6 |
| [ ] | `344-30(b)(2)` | Soportes para tubo conduit metálico pesado | 191 | 2 | 1.00 | — | dibujada | 7×3 |
| [ ] | `352-30` | Soportes para tubo conduit rígido de policloruro de vinilo (PVC) | 196 | 3 | 0.80 | — | dibujada | 7×3 |
| [ ] | `354-24` | Radio mínimo de curvatura para tubo conduit subterráneo no metálico co… | 199, 200 | 2 | 1.00 | — | **huecos** | 11×3 |
| [ ] | `355-44` | Características de expansión del tubo conduit de resina termofija refo… | 202 | 1 | 1.00 | — | dibujada | 21×2 |
| [ ] | `360-24(a)` | Radios mínimos de curvatura para uso en flexión | 207 | 1 | 1.00 | — | dibujada | 5×3 |
| [ ] | `360-24(b)` | Radios mínimos para dobleces fijos | 207 | 1 | 1.00 | — | dibujada | 5×3 |
| [ ] | `384-22` | Dimensiones del canal y área de la sección transversal interior | 224, 225 | 1 | 1.00 | — | dibujada | 12×4 |
| [ ] | `392-10(a)` | Métodos de alambrado | 229 | 2 | 0.99 | — | **huecos** | 35×2 |
| [ ] | `392-60(a)` | Requisitos de área de metal para charolas portacables utilizadas como… | 234 | 1 | 1.00 | — | dibujada | 12×3 |
| [ ] | `402-5` | Ampacidad admisible de alambres para artefactos | 249, 250 | 4 | 1.00 | — | **huecos** | 6×3 |
| [ ] | `408-5` | Espacio mínimo para los conductores que entran en los envolventes de l… | 259 | 1 | 1.00 | — | dibujada | 4×2 |
| [ ] | `409-3` | Otros Artículos | 262, 263 | 1 | 0.91 | — | **huecos** | 15×3 |
| [ ] | `430-10(b)` | Espacio mínimo para el acomodo del alambrado en las terminales en los… | 301 | 1 | 0.95 | — | dibujada | 16×4 |
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
