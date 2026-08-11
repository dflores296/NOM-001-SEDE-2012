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
| `data/tablas_por_revisar.json` | Tablas cuya reconstrucción conviene contrastar |
| `data/indice.json` | Índice plano `id → {título, artículo, página}` |
| `data/validacion.json` | Métricas de cobertura del parseo |
| `tools/` | Los cuatro scripts que generan todo lo anterior desde el PDF |
| `site/` | Sitio estático (Astro) |

## Cifras

| | |
|---|---|
| Artículos | 151 |
| Secciones | 2 896 |
| Incisos | 7 084 |
| Notas / Excepciones | 789 / 987 |
| Definiciones | 185 |
| Referencias enlazadas | 4 942 |
| Referencias rotas | 0 |
| Cobertura del texto | 99.99 % |
| Tablas reconstruidas | 209 |
| Tablas de alta confianza | 107 |

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
python3 tools/build_corpus.py  NOM-001-SEDE-2012.pdf data/
python3 tools/build_graph.py   data/
python3 tools/build_tables.py  NOM-001-SEDE-2012.pdf data/
python3 tools/build_search.py  data/ site/public/data/
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
  el que separa mejor.
- **Continuación entre páginas**: las tablas largas siguen en la página
  siguiente sin repetir el título, así que se sigue la rejilla; y terminan donde
  empieza el título de la siguiente tabla, esté donde esté en la página.

**Esto es aproximado y se publica como tal.** Cada tabla lleva una calidad
estimada; las que no llegan a 0.80 salen marcadas en el sitio con un aviso para
contrastar contra el PDF, y se listan en `data/tablas_por_revisar.json`. Es
preferible señalar la duda que presentar 209 tablas con la misma confianza.

Sigue en pie el atajo para mejorarlas: el PDF no es un documento nativo, es una
impresión de Chrome de `dof.gob.mx/normasOficiales/4951/SENER/SENER.html` hecha
el 19/11/2019 (lo delatan los metadatos, productor `Skia/PDF`, y el pie en las
780 páginas). Con ese HTML las tablas vendrían como `<table><tr><td>` y no
habría que inferir nada.

## Licencia

- **Texto de la norma**: los textos reglamentarios no son objeto de protección
  por derecho de autor conforme al artículo 14 de la Ley Federal del Derecho de
  Autor. Se reproduce fiel al texto oficial y no confiere derecho sobre la
  edición.
- **Código** (`tools/`, `site/`): MIT.
- **Estructura y anotaciones derivadas** (`data/`): CC BY-SA 4.0.

Las normas referenciadas por la NOM (NMX, ANCE, IEC, NFPA 70) sí tienen derechos
de autor y aquí solo se citan, nunca se reproducen.
