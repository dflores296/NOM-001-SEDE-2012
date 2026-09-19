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
python3 tools/build_search.py   data/ site/public/data/
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

El sitio queda en `site/dist/`, archivos estáticos sin servidor detrás. Se
publica en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`),
que regenera el corpus desde el PDF y corre la verificación antes de desplegar.
Para servirlo en otro lugar —un dominio propio, la red local, una carpeta en
USB— basta cambiar `site` y `base` en `site/astro.config.mjs`.

## Las cifras del README se generan

La tabla de `Cifras` del README sale de `data/validacion.json` y `data/grafo.json`
con `tools/build_cifras.py`, entre los marcadores `CIFRAS:INICIO` y `CIFRAS:FIN`.
No se edita a mano: se regenera.

En integración continua corre con `--check`, que no escribe nada y **falla el
build** si la tabla del README no coincide con los datos. Antes de esto las
cifras estaban transcritas y se despegaron: el README llegó a publicar 8 326
incisos donde había 8 315, y 225 tablas donde había 226.

## Cómo se protege la captura verificada

Las 226 tablas se contrastaron celda por celda contra el PDF, y `data/tablas.json`
se regenera en cada publicación. Sin nada que lo impida, un cambio en
`build_tables.py` —o en la versión de `pymupdf`, o un merge mal resuelto— movería
celdas de una tabla ya verificada y el sitio la publicaría igual, con su insignia
intacta. El detalle de las tres reglas que lo evitan, y de cómo sellar un cambio
deliberado, está en [reconstruccion-tablas.md](reconstruccion-tablas.md).

## El entorno de desarrollo

`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`, instala
`requirements.txt` y las dependencias del sitio al arrancar una sesión remota.
Solo actúa cuando `CLAUDE_CODE_REMOTE` vale `true`; en una máquina local no toca
el entorno.
