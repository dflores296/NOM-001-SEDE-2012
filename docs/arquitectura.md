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
mismo, a `api.github.com` (las estrellas) y a `formspree.io`, y los formularios
solo pueden enviar ahí. GitHub Pages no deja poner encabezados, así que va como
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

**Lo que esto no cubre.** La dirección de Formspree va en el HTML, así que
cualquiera puede mandarle un POST directo sin pasar por la página, y entonces
nada de lo anterior aplica. Esa parte se cuida en el panel de Formspree:
restringir el formulario al dominio `dflores296.github.io`, activar su filtro
de spam y el reCAPTCHA. Y al leer los correos, lo de siempre: es texto que
escribió un desconocido. El `Reply-To` es el correo que la persona dijo tener,
no uno verificado.

## El entorno de desarrollo

`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`, instala
`requirements.txt` y las dependencias del sitio al arrancar una sesión remota.
Solo actúa cuando `CLAUDE_CODE_REMOTE` vale `true`; en una máquina local no toca
el entorno.
