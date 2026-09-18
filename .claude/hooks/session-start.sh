#!/bin/bash
# Deja el contenedor listo para correr el pipeline y construir el sitio.
# Sin esto, build_tables.py falla con ModuleNotFoundError: No module named 'pymupdf'.
set -euo pipefail

# Solo en las sesiones remotas (Claude Code en la web): en una máquina local el
# entorno es del desarrollador y no le toca a un hook instalarle paquetes.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# La versión va fijada en requirements.txt; ver el comentario de ahí.
pip install --quiet -r requirements.txt

# El sitio se construye con Astro. npm install (no ci) para aprovechar el
# cacheo del contenedor entre sesiones.
npm install --prefix site --no-audit --no-fund
