# Arquitectura

El corpus se regenera desde el PDF en cada publicación, así el sitio nunca se
despega de la fuente. Si un cambio en el parser rompe algo, la validación lo
detiene en el build y no en producción.

## Los datos

| Archivo | Contenido |
|---|---|
| `data/corpus.json` | Corpus estructurado completo |
| `data/definiciones.json` | Las 185 definiciones del Artículo 100 |
| `data/grafo.json` | Grafo de referencias cruzadas con backlinks |
| `data/tablas.json` | Las tablas reconstruidas como datos, con calidad estimada |
| `data/tablas_revisadas.json` | La versión contrastada a mano de cada tabla, que se aplica encima de la reconstrucción |
| `data/tablas_por_revisar.json` | Tablas cuya reconstrucción conviene contrastar (vacío: ya se revisaron todas) |
| `data/tablas_regiones.json` | Zonas de página que ocupan las tablas, que el corpus salta |
| `data/figuras.json` | La leyenda de cada imagen, capturada a mano, sellada con la huella del PNG |
| `data/indice.json` | Índice plano `id → {título, artículo, página}` |
| `data/validacion.json` | Métricas de cobertura del parseo |

## Reconstruir desde el PDF

Requisitos: Python 3.12 y Node 22.

```bash
pip install -r requirements.txt

python3 tools/extract_index.py  NOM-001-SEDE-2012.pdf INDICE.txt
python3 tools/build_tables.py   NOM-001-SEDE-2012.pdf data/   # antes que el corpus
python3 tools/build_corpus.py   NOM-001-SEDE-2012.pdf data/
python3 tools/build_graph.py    data/
python3 tools/build_search.py   data/ site/src/generado/
python3 tools/build_revision.py data/ REVISION-TABLAS.md
python3 tools/build_cifras.py   data/ README.md
python3 tools/check_corpus.py   data/     # falla si el parseo se degrada

cd site && npm install && npm run build
```

**El orden importa.** `build_corpus.py` salta las zonas de página que ocupan las
tablas leyendo `data/tablas_regiones.json`, que produce `build_tables.py`.
Corriéndolo después, el corpus se armaba con las regiones de la corrida ANTERIOR
y arrastraba al texto lo que la tabla ya se había llevado: las notas al pie de la
220-12 se quedaban pegadas a la NOTA del artículo.

`tools/build_redirects.py` no aparece en la lista porque no deriva del PDF: mapea
los identificadores que una ronda de cambios retiró al destino donde vive hoy su
contenido, y su salida se versiona ya construida.

Todo eso, más el linter de los scripts (`ruff`, ver `ruff.toml`), el linter y
formateador del JavaScript del sitio (Biome, ver `site/biome.json`), las
pruebas unitarias del extractor (`tools/pruebas/`: las reglas del lector de
artículos, las citas del grafo, la huella de las tablas y casos conocidos de
la norma sobre `data/`), la compilación, la revisión de enlaces (`check_enlaces.py`:
que cada enlace interno lleve a una página y un ancla que existan), la
huella del sitio y las pruebas (`site/pruebas/`: en navegador, el buscador,
el tema, el índice lateral y el mapa; sin navegador, la geometría del hilo
del mapa y sus sugerencias), lo corre en orden
`bash tools/verificar.sh`.

El sitio queda en `site/dist/`, archivos estáticos sin servidor detrás. Se
publica en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`),
que corre `tools/verificar.sh` antes de desplegar. En las demás ramas corre la
misma verificación, sin publicar: un cambio se sabe sano antes de llegar a
`main`.
Para servirlo en otro lugar —un dominio propio, la red local, una carpeta en
USB— basta cambiar `site` y `base` en `site/astro.config.mjs`.

## La huella del sitio

`tools/huella_sitio.txt` guarda el SHA-256 de todo el contenido publicado:
`data/*.json`, `REVISION-TABLAS.md` y cada archivo de `site/dist/` (páginas,
imágenes, video, índice de búsqueda, datos del mapa). `tools/huella_sitio.py`
lo compara al final de `verificar.sh` y falla si algo cambió.

Existe porque todo el proceso, del PDF al sitio, es determinista: regenerar y
compilar da los mismos bytes cada vez. Eso permite reorganizar el código con
una garantía fuerte: si una reestructuración mueve una sola palabra del texto,
la clase de una celda o un enlace, la huella lo detiene. `check_corpus.py`
cuenta y mide (artículos, secciones, cobertura), pero no ve una palabra
cambiada; la huella de cada tabla (`huella.py`) protege las tablas, pero no el
texto ni cómo se dibujan.

Del HTML se compara todo menos lo que es código: los `<script>` y `<style>` en
línea, los enlaces a `/_astro/`, la marca `data-astro-cid-*` de Astro y la
`<meta>` de la Content-Security-Policy (hecha de hashes de ese código), que
cambian al reorganizar componentes sin cambiar lo que se lee. Por la misma
razón quedan fuera `site/dist/_astro/` y `sw.js`.

Un cambio de contenido deliberado —corregir una tabla, arreglar el parser— se
vuelve a sellar con `python3 tools/huella_sitio.py --escribir`, y el diff de
`huella_sitio.txt` en ese commit dice qué páginas y qué datos cambiaron.

## Las cifras del README se generan

La tabla de `Cifras` del README sale de `data/validacion.json` y `data/grafo.json`
con `tools/build_cifras.py`, entre los marcadores `CIFRAS:INICIO` y `CIFRAS:FIN`.
No se edita a mano: se regenera.

En integración continua corre con `--check`, que no escribe nada y **falla el
build** si la tabla del README no coincide con los datos. Antes de esto las
cifras estaban transcritas y se despegaron: el README llegó a publicar 8 326
incisos donde había 8 315, y 225 tablas donde había 226.

## Las figuras se capturan a mano

El PDF no entrega el rótulo de una figura como texto: en 45 de las 59 imágenes
va dibujado dentro del propio mapa de bits, así que no hay detector que pueda
leerlo. `data/figuras.json` lo guarda capturado a mano y `build_corpus.py` lo
cuelga de cada figura del corpus (`aplicar_figuras`), de donde salen el número,
el ancla, el índice de `/figuras` y los documentos de la búsqueda.

Cada entrada trae la **huella del PNG** que describe. `build_corpus.py` la
comprueba y aborta antes de escribir nada; `check_corpus.py` la vuelve a
comprobar por su cuenta, y además exige que toda figura esté capturada, que
cada archivo exista y que no sobre ningún PNG en `site/public/img/` —ese
directorio se versiona y el pipeline lo reescribe sin limpiarlo, así que una
imagen que dejara de extraerse se quedaría publicada sin que nadie la cite—.

Los campos de una entrada:

| Campo | Para qué |
|---|---|
| `kind` | `figura`, `formula` o `tabla` (la 240-92(b), que el DOF imprime como imagen) |
| `rotulos` | Los números que la imagen lleva impresos, con su título. Puede haber más de uno |
| `titulo` | Lo que es, cuando no lleva número (las fórmulas) |
| `informativa` | La norma dice de ella que no es exigible (solo la 620-2) |
| `nota` | Lo que hay que saber de cómo la imprime el DOF |
| `transcripcion` | El texto que la imagen encierra y el PDF no tiene como texto |
| `sha` | Huella del PNG: la captura describe ESA imagen |

## Cómo se protege la captura verificada

Las 226 tablas se contrastaron celda por celda contra el PDF, y `data/tablas.json`
se regenera en cada publicación. Sin nada que lo impida, un cambio en
`build_tables.py` —o en la versión de `pymupdf`, o un merge mal resuelto— movería
celdas de una tabla ya verificada y el sitio la publicaría igual, con su insignia
intacta. El detalle de las tres reglas que lo evitan, y de cómo sellar un cambio
deliberado, está en [reconstruccion-tablas.md](reconstruccion-tablas.md).

## Seguridad

El sitio es estático: no hay servidor, base de datos ni cuentas. Lo que se
cuida es que no corra código ajeno en la página y que el formulario de
observaciones no sirva para mandar correos maliciosos.

**Content-Security-Policy en todas las páginas** (`site/astro.config.mjs`).
Solo corre el JavaScript que compila Astro: un script metido en un texto, en
una URL o en un `onerror=` no se ejecuta. El sitio solo puede conectarse a sí
mismo, a `api.github.com` (las estrellas), a `formspree.io` y, si está
conectado, al Worker del asistente (ver «El asistente»), y los formularios
solo pueden enviar a Formspree. GitHub Pages no deja poner encabezados, así que va como
`<meta>`; por eso no lleva `frame-ancestors`, que desde una `<meta>` no aplica.
Dos reglas para quien toque el sitio:

- Un `<script is:inline>` o con `define:vars` queda **bloqueado**: Astro no le
  calcula hash. Los datos se pasan por un atributo `data-`, como en la 404.
- Las librerías del mapa 3D crean su propio `<style>`. Su hash se calcula al
  compilar leyéndolo de la librería; si una versión nueva deja de traerlo
  donde se busca, la compilación se detiene.

Las pruebas en navegador fallan con cualquier error de consola, y bloquear algo
de la CSP es uno: si la política le quita algo legítimo al sitio, se nota ahí.
Una prueba, además, inyecta un script y comprueba que no corra.

**El formulario de `/observaciones`** manda a Formspree, que reenvía al correo
del proyecto. Lo que sale de la página lo arma
`site/src/scripts/observaciones/limpieza.js`, probado en
`site/pruebas/observaciones.mjs`:

- **La referencia y el origen que traen la URL** (`?ref=…&de=…`) solo se toman
  si tienen la forma de los que generan los botones «Reportar». Un enlace hecho
  a mano para que el asunto dijera «Urgente: verifica tu cuenta» llega con el
  campo vacío. Una prueba recorre los más de 3 000 «Reportar» del sitio
  compilado y comprueba que todos pasan el filtro.
- **Solo viajan los campos esperados**, sin etiquetas HTML ni caracteres
  invisibles (los de dirección bidi disfrazan un `.exe` de `.jpg`), y con los
  enlaces desarmados: `hxxps://sitio[.]com` se puede leer y copiar, pero no se
  abre con un clic.
- **Contra bots y avalanchas**: un señuelo que las personas no ven, un mínimo
  de tres segundos entre abrir la página y enviar, y un tope de cinco envíos por
  hora en cada navegador.

**Las dependencias.** Las acciones de `.github/workflows/` van fijadas por SHA,
con la versión en comentario, y `.github/dependabot.yml` propone cada mes subir
acciones, pip y npm. Tres excepciones: `pymupdf` no se sube sola (de su
versión depende cómo se lee el PDF), `playwright` va en la versión del Chromium
que trae el entorno de Claude en la nube, y `three` sube siempre junto con
`3d-force-graph`.
El porqué y cuándo revisarlas, en «Ronda de seguridad» de `CONTEXTO.md`.

**Lo que esto no cubre.** La dirección de Formspree va en el HTML, así que
cualquiera puede mandarle un POST directo sin pasar por la página, y entonces
nada de lo anterior aplica. Esa parte se cuida en el panel de Formspree:
restringir el formulario al dominio `dflores296.github.io`, activar su filtro
de spam y el reCAPTCHA. Y al leer los correos, lo de siempre: es texto que
escribió un desconocido. El `Reply-To` es el correo que la persona dijo tener,
no uno verificado.

## El asistente

`/preguntar` contesta preguntas en lenguaje natural con el texto de la norma.
El sitio sigue siendo estático: lo único que vive fuera es un Worker de
Cloudflare (`ia/agente.js`) que llama a un modelo de código abierto
(gpt-oss-20b) en Workers AI, dentro del plan gratis. Cómo se publica, qué
cuesta (nada) y qué hacer cuando algo falla: `ia/README.md`.

El asistente no recibe la norma entera —son 3.5 millones de caracteres, más de
lo que el modelo lee de una vez y más que la cuota de un día—: la recorre como
una persona con el libro, en tres consultas que dirige la página
(`preguntar/chat.js`):

| Paso | Lee | Escoge |
|---|---|---|
| 1. `articulos` | El índice general: los 151 artículos, el Capítulo 10, los Apéndices y los Títulos de cierre (`/data/ia/indice.json`, unos 2 000 tokens) | De 1 a 3 claves |
| 2. `secciones` | El índice de esas claves: secciones, incisos con título, tablas y figuras (`/data/ia/<clave>.json`; el más largo, el 250, unos 4 800 tokens) | Hasta 6 identificadores |
| 3. `responder` | Eso completo, hasta 4 partes y 22 000 caracteres: cada renglón con su identificador entre corchetes, las tablas renglón por renglón | — contesta citando |

Los pasos 1 y 2 los hace gpt-oss-20b pensando poco; el 3, gpt-oss-120b
pensando más, porque ahí se equivocaba el chico: le aplicó al 14 AWG la
condición del 18 AWG y tomó los 20 A de un artículo de vehículos
recreativos. Si el grande no está disponible (error 5035 o 3040), redacta el
chico.

- **Lo que lee lo arma `lib/asistente-datos.js`** desde el corpus, con el mismo
  orden que pinta el sitio (notas, excepciones, párrafos, tablas y figuras por
  su `seq`). Un campo nuevo del corpus va ahí también (CONTEXTO §3). Las
  pruebas comprueban que cada sección e inciso, cada tabla y cada definición se
  pueda leer.
- **Lo que pide el modelo lo entiende `preguntar/lectura.js`** con manga ancha
  —numera, copia títulos, escribe «240.4(D)» al estilo del NEC— y solo acepta
  lo que existe. «Tabla 240-4(g)» es la tabla y «240-4(g)» el inciso: los dos
  existen, y el alias de la tabla sin «Tabla» pierde.
- **Se lee primero el inciso pedido**, luego las secciones, las definiciones
  y al final las tablas (`PRIORIDAD` en `lectura.js`): si no cabe todo, lo
  que se queda fuera es una tabla, no la sección con la respuesta.
- **Si no pide nada que exista**, la página busca con el buscador de siempre
  (`buscarPregunta` + `pasajes.js`) y el paso 3 sigue con eso.
- **La respuesta** la parte `preguntar/respuesta.js` en párrafos, listas y
  citas, y va con `textContent`. Solo es enlace la cita de algo que se leyó, y
  una cita a un inciso ([240-4(d)(3)]) lleva a su ancla.
- **Memoria:** cada consulta lleva las dos preguntas y respuestas anteriores;
  «Nueva conversación» la borra.
- **«¿Algo está mal en esta respuesta?»** lleva a `/observaciones` con la
  pregunta, la respuesta y lo que leyó escritos. Viajan por `sessionStorage`,
  no por la URL, y el formulario los limpia como todo lo demás.
- **Topes en cascada:** `LECTURA` y `TOPE_INDICE` (página) van por debajo de
  `TOPES` (Worker, `ia/nucleo.js`), y una prueba lo comprueba con las partes
  más largas de la norma.

La dirección del Worker vive en `site/src/lib/asistente.js`. Vacía, no hay
pestaña «Preguntar», la CSP no cambia y la página avisa que el asistente no
está conectado. Las pruebas en navegador no dependen de eso: le dan a la página
un asistente de mentiras en el mismo servidor.

## El entorno de desarrollo

`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`, instala
`requirements.txt`, `requirements-dev.txt` (ruff, pytest, mypy) y las
dependencias del sitio al arrancar una sesión remota.
Solo actúa cuando `CLAUDE_CODE_REMOTE` vale `true`; en una máquina local no toca
el entorno.
