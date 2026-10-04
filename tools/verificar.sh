#!/usr/bin/env bash
# Regenera todo desde el PDF, compila el sitio y lo verifica. Es exactamente
# lo que corre la publicación (.github/workflows/deploy.yml), así que pasar
# aquí es pasar allá.
#
#     bash tools/verificar.sh
#
# Requiere las dependencias ya instaladas: pip install -r requirements.txt,
# npm ci dentro de site/ y el Chromium de Playwright (npx playwright install
# chromium, también dentro de site/).
set -euo pipefail
cd "$(dirname "$0")/.."

paso() { printf '\n== %s\n' "$1"; }

# El corpus se regenera desde el PDF en cada publicación: así el sitio nunca
# se despega de la fuente, y si un cambio en el parser rompe algo, la
# validación lo detiene aquí y no en producción.
# El orden importa: build_corpus salta las zonas de página que ocupan las
# tablas leyendo data/tablas_regiones.json, que produce build_tables.
# Corriéndolo después, el corpus se armaba con las regiones de la corrida
# ANTERIOR y arrastraba al texto lo que la tabla ya se había llevado: las
# notas al pie de la 220-12 se quedaban pegadas a la NOTA del artículo.
paso 'Regenerar tablas, corpus, grafo e índice de búsqueda'
python3 tools/build_tables.py NOM-001-SEDE-2012.pdf data/
python3 tools/build_corpus.py NOM-001-SEDE-2012.pdf data/
python3 tools/build_graph.py data/
python3 tools/build_search.py data/ site/public/data/
python3 tools/build_revision.py data/ REVISION-TABLAS.md

# --check no escribe: falla si la tabla de cifras del README se despegó de
# los datos. Regenerarla es parte del cambio, no de la publicación.
paso 'Verificar las cifras del README'
python3 tools/build_cifras.py data/ README.md --check

paso 'Verificar cobertura del parseo'
python3 tools/check_corpus.py data/

paso 'Compilar el sitio'
(cd site && npm run build)

paso 'Verificar los enlaces internos'
python3 tools/check_enlaces.py

# Lo último: que el contenido publicado sea el mismo que el sellado en
# tools/huella_sitio.txt. Ver tools/huella_sitio.py.
paso 'Comparar contra la huella del sitio'
python3 tools/huella_sitio.py

# La huella cuida el contenido; esto, lo que vive en JavaScript: el buscador,
# el tema, el índice lateral, el mapa. Ver site/pruebas/navegador.mjs.
paso 'Pruebas en navegador'
(cd site && npm run prueba)
