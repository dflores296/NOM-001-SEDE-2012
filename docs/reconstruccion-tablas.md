# Reconstrucción de las tablas

Cómo se obtuvieron las 226 tablas de un PDF que no las contiene como tablas, y
qué encontró la revisión a mano.

## De dónde salen las filas y las columnas

En la capa de texto del PDF las tablas se aplanan a un valor por línea y
pierden filas y columnas por completo; `find_tables()` de PyMuPDF tampoco las
recupera, colapsa varias filas en una celda. Lo que sí funciona es aprovechar
que el PDF se imprimió desde HTML y conserva las líneas de la rejilla como
rectángulos vectoriales:

- **Filas**: de las líneas horizontales y de los extremos verticales de los
  bordes de celda. Varias tablas no dibujan horizontales y en cambio cada celda
  traza su propio borde izquierdo, segmentado fila por fila.
- **Columnas**: se prueban dos métodos y se elige el mejor por tabla. Uno usa
  las líneas verticales de la rejilla; el otro proyecta las palabras sobre el
  eje x y busca franjas sin tinta. Ninguno gana siempre: hay tablas con rejilla
  completa y otras que solo trazan el borde exterior. Se puntúa cada resultado
  —una celda con varios números sueltos delata que la separación falló— y gana
  el que separa mejor. De las 219 que salen del reparto automático, 157 traen rejilla dibujada y 62 se resolvieron por huecos.
- **Celdas combinadas**: el PDF fusiona celdas en el encabezado para que se
  entienda —«Rango de temperatura del conductor» cubre las tres columnas de
  60/75/90 °C, y «Temperatura ambiente (°C)» ocupa dos filas—. Esa jerarquía
  también está en el trazado: una celda se extiende hasta donde hay línea
  dibujada. Cada celda se publica como `{t, cs, rs}` (texto, colspan, rowspan)
  y el sitio la reproduce con las mismas combinaciones que el original. Sin
  esto, los títulos de columna no decían a qué se referían y aparecían
  columnas vacías donde el PDF solo tenía una celda ancha.
- **Frase de entrada**: cuando la primera fila es una sola celda a todo lo
  ancho con una frase («Para temperaturas ambiente distintas de 30 °C,
  multiplique...»), no es un encabezado: se publica aparte, en `intro`.
- **Continuación entre páginas**: las tablas largas siguen en la página
  siguiente sin repetir el título, así que se sigue la rejilla; y terminan donde
  empieza el título de la siguiente tabla, esté donde esté en la página.
- **Título y notas al pie**: el título puede ocupar cuatro renglones y quedar al
  pie de una página con la tabla en la siguiente; las notas al pie van por
  debajo de la rejilla, fuera del rectángulo que se recorta. Ambos se recogen
  con la tabla. Si no, se colaban en el texto del artículo: la NOTA de
  310-60(c)(4) llegó a acumular 287 palabras con nueve notas al pie de nueve
  tablas distintas y el pie de la Figura 310-60.
- **Dónde va cada tabla**: al recortar la tabla se deja una marca en esa misma
  posición del flujo de texto, y el parser la cuelga del inciso por el que iba
  pasando. Así cada tabla se publica donde la norma la imprime —la
  310-15(b)(2)(a) dentro del inciso 310-15(b)(2)— en vez de amontonarse al
  final. Las tablas de artículo quedan ancladas; las 12 del Capítulo 10 no
  pertenecen a ningún artículo y se publican en su propia página.

## La revisión a mano: 226 de 226

**El reparto automático llegó hasta donde llega, así que las 226 tablas se
contrastaron celda por celda contra el PDF.** Se renderiza la zona de cada tabla
desde sus coordenadas, se compara con lo publicado y la versión corregida se
escribe en `data/tablas_revisadas.json`, que se aplica ENCIMA de lo reconstruido
—editar `data/tablas.json` no sirve: `build_tables.py` lo sobrescribe en cada
publicación—. Cada tabla del sitio lleva en su pie la marca de esa revisión.

### Cómo se protege esa captura

Contrastar 226 tablas celda por celda contra el PDF no fue barato, y
`data/tablas.json` se regenera en cada publicación. Sin nada que lo impida, un
cambio en `build_tables.py` —o en la versión de `pymupdf`, o un merge mal
resuelto— movería celdas de una tabla ya verificada y el sitio la publicaría
igual, con su insignia de «Verificada contra el PDF» intacta. Tres reglas lo
evitan, y las tres fallan el build:

1. **Las 226 están congeladas.** Cada entrada de `data/tablas_revisadas.json`
   trae sus propias `rows`, `cols` y `header_rows`, así que el reconstructor ya
   no decide el contenido de una tabla verificada: lo decide la captura.
   `build_tables.py` queda como herramienta de arranque para tablas nuevas.
2. **Cada entrada guarda la huella de su contenido** (`sha`, en
   `tools/huella.py`: sha256 sobre título, prosa de entrada, rejilla, celdas con
   sus fusiones y notas). `build_tables.py` la recalcula y **aborta antes de
   escribir** `tablas.json` si no coincide; `check_corpus.py` la vuelve a
   comprobar por su cuenta, y además compara los dos archivos campo por campo
   para cazar una edición de la captura sin regenerar.
3. **`verificada` exige congelado.** Una tabla marcada como verificada que no
   traiga sus celdas rompe `check_corpus.py`, para que la insignia del sitio no
   pueda mentir.

Cambiar una tabla a propósito es un paso explícito:

```
python3 tools/build_tables.py NOM-001-SEDE-2012.pdf data/ --sellar
```

La huella nueva aparece en el diff de `tablas_revisadas.json`, que es justamente
la señal de revisión que se quiere. Lo que no puede pasar es que cambie sola.

La calidad estimada resultó ser un mal juez en las dos direcciones: daba falsas
alarmas con los rangos legítimos («De 50 001 a 100 000» tiene dos números y no
está mal separado) y en cambio puntuaba 1.00 tablas con la columna inventada,
donde los valores están perfectos pero el encabezado se corre y cada título
cubre una columna de menos. Lo que la revisión encontró, por frecuencia:

- **Dónde acaba el encabezado.** El fallo más repetido: las primeras filas de
  datos contadas como parte del título.
- **Notas al pie que se pasan de largo.** El recorte de la nota arrastraba el
  artículo siguiente completo —la NOTA 3 de la 430-72(b) se llevaba el inciso c)
  y su excepción— o hasta el pie de página del PDF.
- **Columnas inventadas o fusionadas**, con el encabezado corrido detrás.
- **Filas partidas en la costura entre páginas**, con la segunda mitad como fila
  aparte y las demás celdas vacías.
- **Dónde empieza y termina la tabla.** La 922-15(a) se llevaba dentro dos
  secciones enteras del artículo 922; la 400-4 dejaba fuera sus quince notas,
  que acababan pegadas al texto de 400-5(c).
- **Glitches de fuente del propio PDF**, con `ºC` y `₀C` donde debía ir `°C`.

Siete tablas no salen del reparto automático y se dan de alta a mano en
`data/tablas_revisadas.json` con los campos de `CAMPOS_ALTA`: la **408-56**
(espacio mínimo entre partes metálicas desnudas), la **685-3** (aplicación de
otros Artículos), la **922-17(c)**, la **922-56(b)** —factores de reducción por
punto de cruce—, la **220-83(a)** y la **220-83(b)** —porcentajes de carga para
equipo adicional de aire acondicionado— y la **5A** (dimensiones y áreas
nominales de cables de aluminio tipo X).

El detector de títulos no las veía, por dos causas distintas. En la 408-56 y la
685-3 el DOF imprime el guion fuera de sitio —`Tabla 408.- 56` y `Tabla 685.-3.`
en vez de `Tabla 408-56.-` y `Tabla 685-3.-`—, así que su contenido se publicaba
como párrafo corrido dentro del artículo. La 922-17(c) y la 922-56(b) la norma
las imprime sin número alguno: no hay título que detectar.

De ahí que el total sea 226 y no 219.

Cuatro tablas traen valores mal impresos **en el PDF de origen** y se dejaron tal
como los imprime el DOF: la 505-9(d)(1) (`≤4`, `≤3`, `≤2`… donde las clases T1–T6
piden 450, 300, 200 °C), la 922-12(a)(2) (`96` y `105` donde el patrón pide 960 y
1 050 mm), la 220-42 (`A partir de 1 00000` donde debería decir `A partir de
100 000`, con los dígitos correctos y el separador de miles fuera de lugar) y la
**430-250**, cuya fila de 10 hp dice `44` A en la columna de 575 V donde debería
decir `11` — rompe la monotonía de su propia columna (7½ hp da 9 y 15 hp da 17) y
el cociente con la de 460 V lo confirma. Quedan anotadas en `REVISION-TABLAS.md`;
corregirlas sería editar la norma, no transcribirla.

> ⚠ **La 430-250 es la que más importa de las cuatro**, porque es una tabla de
> diseño: quien calcule un motor de 10 hp en 575 V con ese valor saldrá con un
> conductor y una protección cuatro veces más grandes de lo que toca.

Sigue en pie el atajo para verificar todo esto de raíz: el PDF no es un documento
nativo, es una impresión de Chrome de
`dof.gob.mx/normasOficiales/4951/SENER/SENER.html` hecha el 19/11/2019 (lo
delatan los metadatos, productor `Skia/PDF`, y el pie en las 780 páginas). Con
ese HTML las tablas vendrían como `<table><tr><td>` y no habría que inferir nada.
