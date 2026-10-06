# NOM-001-SEDE-2012 — guía interactiva

Antes de tocar nada, lee `CONTEXTO.md`: es la memoria del proyecto (dónde
estamos, qué hay que entender antes de tocar, qué se hizo en cada ronda y
por qué). `README.md` dice qué es; `docs/arquitectura.md`, cómo funciona.

## Verificar

```
bash tools/verificar.sh     # lo mismo que corre la publicación; debe salir con 0
git status --porcelain      # después de eso, debe quedar vacío
```

## Reglas que no se rompen

- **La captura manual manda.** Las 245 tablas (`data/tablas_revisadas.json`) y
  las leyendas de figuras (`data/figuras.json`) están contrastadas a mano y
  selladas con huella. No se regeneran desde el PDF ni se editan para que un
  check pase. Ver §1 y §1b de `CONTEXTO.md`.
- **El texto de la norma no se corrige.** Una errata del DOF se reproduce y se
  anota; no se edita.
- **La huella del sitio** (`tools/huella_sitio.txt`) solo se vuelve a sellar
  por un cambio de contenido deliberado, y el diff dice qué páginas cambiaron.
- **pymupdf no se sube sola.** Está fijada y Dependabot la ignora: de su
  versión depende cómo se lee el PDF. Ver «Ronda de seguridad» en
  `CONTEXTO.md`.
- **`three` sube junto con `3d-force-graph`**, nunca sola.
- **`playwright` va en la versión del Chromium preinstalado** en el entorno de
  Claude en la nube (`ls /opt/pw-browsers`); Dependabot la ignora.
- **CSP:** un `<script is:inline>` o con `define:vars` queda bloqueado; los
  datos van por un atributo `data-`. Una conexión nueva del sitio se da de alta
  en `site/astro.config.mjs`.
- **El formulario de `/observaciones`** manda solo lo que arma
  `site/src/scripts/observaciones/limpieza.js`. Un campo nuevo se agrega ahí y
  en sus pruebas.

## Al terminar una ronda

Deja la bitácora en `CONTEXTO.md` (qué se hizo, por qué, qué quedó fuera) y
actualiza su fecha. Las cifras del README las escribe
`tools/build_cifras.py`; las del texto, no: revísalas a mano.
