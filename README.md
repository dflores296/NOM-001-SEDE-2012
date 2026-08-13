# NOM-001-SEDE-2012 — guía interactiva

Las 780 páginas de la **NOM-001-SEDE-2012, Instalaciones Eléctricas (utilización)**
convertidas en una base de datos consultable: un artículo por página, referencias
cruzadas navegables, backlinks y búsqueda instantánea que funciona sin conexión.

El PDF publicado no permite saltar entre artículos, no dice quién cita a quién y
sus tablas se parten entre páginas. Este proyecto ataca eso.

> **No es una edición oficial.** Es una reproducción del texto publicado en el
> DOF el 29 de noviembre de 2012 con fines de consulta. Ante cualquier
> discrepancia prevalece el texto del Diario Oficial de la Federación, y nada
> aquí sustituye el criterio de una Unidad de Verificación.

## Qué hay

| Ruta | Contenido |
|---|---|
| `NOM-001-SEDE-2012.pdf` | PDF fuente, 780 páginas |
| `INDICE.txt` | Índice maestro legible: títulos, capítulos, artículos, partes, secciones, tablas y apéndices |
| `data/corpus.json` | Corpus estructurado completo |
| `data/definiciones.json` | Las 185 definiciones del Artículo 100 |
| `data/grafo.json` | Grafo de referencias cruzadas con backlinks |
| `data/tablas.json` | Las tablas reconstruidas como datos, con calidad estimada |
| `data/tablas_revisadas.json` | La versión corregida a mano de cada tabla, que se aplica encima de la reconstrucción |
| `data/tablas_por_revisar.json` | Tablas cuya reconstrucción conviene contrastar (vacío: ya se revisaron todas) |
| `data/indice.json` | Índice plano `id → {título, artículo, página}` |
| `data/validacion.json` | Métricas de cobertura del parseo |
| `REVISION-TABLAS.md` | Registro de la revisión de tablas, generado desde `data/tablas.json` y `data/grafo.json` |
| `tools/` | Los scripts que generan todo lo anterior desde el PDF |
| `site/` | Sitio estático (Astro) |

## Cifras

| | |
|---|---|
| Artículos | 151 |
| Secciones | 2 897 |
| Incisos | 8 261 |
| Notas / Excepciones | 777 / 985 |
| Definiciones | 185 |
| Referencias enlazadas | 4 637 |
| Referencias rotas | 0 |
| Cobertura del texto | 100 % |
| Tablas reconstruidas | 220 |
| Tablas contrastadas contra el PDF | 220 |

## El identificador canónico

Todo se articula alrededor del identificador con el que la norma se cita a sí
misma:

```
250-32(a)(1)
└┬┘ └┬┘└─┬──┘
 │   │   └── incisos anidados
 │   └────── sección
 └────────── artículo
```

Ese id es a la vez la URL (`/art/250#250-32`), el ancla del enlace profundo, la
clave del grafo de referencias y la unidad de búsqueda. Si el parser lo asigna
bien, lo demás sale casi solo.

## Reconstruir todo desde el PDF

```bash
pip install pymupdf

python3 tools/extract_index.py NOM-001-SEDE-2012.pdf INDICE.txt
python3 tools/build_tables.py  NOM-001-SEDE-2012.pdf data/   # antes que el corpus
python3 tools/build_corpus.py  NOM-001-SEDE-2012.pdf data/
python3 tools/build_graph.py   data/
python3 tools/build_search.py  data/ site/public/data/
python3 tools/build_revision.py data/ REVISION-TABLAS.md
python3 tools/check_corpus.py  data/     # falla si el parseo se degrada

cd site && npm install && npm run build
```

El sitio queda en `site/dist/`, son archivos estáticos sin servidor detrás.
Se publica solo en GitHub Pages con cada push a `main`
(`.github/workflows/deploy.yml`), que regenera el corpus desde el PDF y corre la
verificación antes de desplegar.

Para servirlo en otro lugar —un dominio propio, la red local, una carpeta en
USB— basta cambiar `site` y `base` en `site/astro.config.mjs`.

## Dónde se rompe la norma consigo misma

El documento no es uniforme, y cada inconsistencia rompía el parser en silencio.
Quedan anotadas porque cualquiera que vuelva a procesar este PDF se las va a
encontrar:

- **Acentos en los encabezados.** `ARTICULO` sin acento 151 veces y `ARTÍCULO`
  con acento 2 veces, en los artículos **250** y **555**. Buscar solo la forma
  acentuada devuelve 2 artículos de 151; buscar solo la otra pierde el 250, que
  es Puesta a Tierra. La detección normaliza acentos pero conserva mayúsculas:
  eso es lo que separa el encabezado `ARTICULO 250` de las 1 406 menciones en
  prosa `el Artículo 250`.
- **Separador de sección en tres formas.** `210-8. Título` lo normal,
  `384-1 Título` sin punto (arts. 384, 506 y 522) y `701-1.Título` sin espacio
  (art. 701). Con el patrón estricto, esos artículos salían vacíos.
- **Títulos de parte que empiezan con dígito.** `B. 600 volts o menos` en el
  artículo 110; exigir letra inicial hacía desaparecer la parte completa.
- **Referencias cruzadas al inicio de línea.** En `220-14(j)` la frase «…de
  alumbrado general del **220-12**. No se deben exigir…» parte justo antes de la
  cita, que entonces se lee como encabezado. Se descarta exigiendo que las
  secciones de un artículo sean estrictamente crecientes, cosa que se cumple en
  todo el documento.
- **La profundidad no se deduce del marcador.** En `110-14(c)` el anidamiento es
  `c) → a. → (1)(2)`, mientras que en otros artículos es `c) → (1) → a.`. Con
  niveles fijos por tipo de marcador, los `(1)` de 110-14 se colgaban del padre
  equivocado y chocaban entre sí: 273 identificadores duplicados. El nivel se
  infiere de la secuencia de rótulos.

## Estado

- [x] **Fase 1** — Corpus estructurado
- [x] **Fase 2** — Grafo de referencias cruzadas y backlinks
- [x] **Fase 3** — Sitio navegable con búsqueda y uso sin conexión
- [x] **Fase 4** — Tablas como datos
- [x] **Fase 4.5** — Las 220 tablas contrastadas celda por celda contra el PDF
- [ ] **Fase 5** — Búsqueda semántica y servidor MCP
- [ ] **Fase 6** — Calculadoras (ampacidad, caída de tensión, llenado de tubería)

### Cómo se reconstruyeron las tablas

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
  el que separa mejor. De 220 tablas, 156 traen rejilla dibujada.
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
  final. Las 208 tablas de artículo quedan ancladas; las 12 del Capítulo 10 no
  pertenecen a ningún artículo y se publican en su propia página.

### La revisión a mano: 220 de 220

**El reparto automático llegó hasta donde llega, así que las 220 tablas se
contrastaron celda por celda contra el PDF.** Se renderiza la zona de cada tabla
desde sus coordenadas, se compara con lo publicado y la versión corregida se
escribe en `data/tablas_revisadas.json`, que se aplica ENCIMA de lo reconstruido
—editar `data/tablas.json` no sirve: `build_tables.py` lo sobrescribe en cada
publicación—. Cada tabla del sitio lleva en su pie la marca de esa revisión.

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

Dos tablas traen valores truncados **en el PDF de origen** y se dejaron tal como
los imprime el DOF: la 505-9(d)(1) (`≤4`, `≤3`, `≤2`… donde las clases T1–T6
piden 450, 300, 200 °C) y la 922-12(a)(2) (`96` y `105` donde el patrón pide 960
y 1 050 mm). Quedan anotadas en `REVISION-TABLAS.md`; corregirlas sería editar la
norma, no transcribirla.

Sigue en pie el atajo para verificar todo esto de raíz: el PDF no es un documento
nativo, es una impresión de Chrome de
`dof.gob.mx/normasOficiales/4951/SENER/SENER.html` hecha el 19/11/2019 (lo
delatan los metadatos, productor `Skia/PDF`, y el pie en las 780 páginas). Con
ese HTML las tablas vendrían como `<table><tr><td>` y no habría que inferir nada.

## Licencia

- **Texto de la norma**: los textos reglamentarios no son objeto de protección
  por derecho de autor conforme al artículo 14 de la Ley Federal del Derecho de
  Autor. Se reproduce fiel al texto oficial y no confiere derecho sobre la
  edición.
- **Código** (`tools/`, `site/`): MIT.
- **Estructura y anotaciones derivadas** (`data/`): CC BY-SA 4.0.

Las normas referenciadas por la NOM (NMX, ANCE, IEC, NFPA 70) sí tienen derechos
de autor y aquí solo se citan, nunca se reproducen.
