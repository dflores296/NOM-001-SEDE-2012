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

# Las versiones van fijadas en requirements.txt (extracción) y en
# requirements-dev.txt (ruff, pytest, mypy: lo que corre tools/verificar.sh).
pip install --quiet -r requirements.txt -r requirements-dev.txt

# El sitio se construye con Astro. npm ci y no npm install: instala
# exactamente lo de package-lock.json y nunca lo reescribe. Con npm install,
# la versión de npm del contenedor le quitaba campos («libc») que escribe la
# de Dependabot, y cada sesión arrancaba con el lockfile modificado.
npm ci --prefix site --no-audit --no-fund
