# NOM-001-SEDE-2012 — guía interactiva

Antes de tocar nada, lee `CONTEXTO.md`: es la memoria del proyecto (dónde
estamos, qué hay que entender antes de tocar, qué se hizo en cada ronda y
por qué). `README.md` dice qué es; `docs/arquitectura.md`, cómo funciona.

## Idioma

**Con el dueño se habla siempre en español**, en cada respuesta, también en
las técnicas y en las que siguen a una herramienta o a un error. Él no es
programador: sin jerga, y cuando haga falta un término, explicado.

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
- **Licencias:** PolyForm Noncommercial en `site/`, AGPL-3.0 en `tools/` (por
  PyMuPDF) y CC BY-NC-SA en `data/` y la documentación. No se cambian sin el
  dueño, y una dependencia nueva del sitio con licencia GPL o AGPL no entra sin
  consultarlo.
- **El asistente (la burbuja de cada página, su guía en `/asistente`, `ia/`)
  contesta solo con lo que lee de la
  norma**, en tres pasos: índice general, índice del artículo, texto completo
  (`site/src/lib/asistente-datos.js`); escoge gpt-oss-20b y redacta
  gpt-oss-120b. La cuenta de Cloudflare se queda en el
  plan gratis: sin tarjeta, al acabarse la cuota deja de contestar y no cobra.
  Su dirección vive en `site/src/lib/asistente.js`. Lo que manda la página
  (`LECTURA`, `TOPE_INDICE`) va por debajo de los topes del Worker (`TOPES`);
  una prueba lo cuida. `ia/agente.js` solo exporta `default`. Ver
  `ia/README.md`.
- **Lo que lee el visitante no explica cómo funciona por dentro.** Textos del
  sitio y del asistente: qué hace y qué le toca a la persona, sin detalles de
  implementación (cómo se cuenta, qué se manda, por qué). Eso va en los
  comentarios del código y en `CONTEXTO.md`. Decisión del dueño (8 de octubre
  de 2026), que lo pidió dos veces. **Excepción**, autorizada por él el mismo
  día: el aviso de privacidad (`site/src/pages/privacidad.astro`) sí dice qué
  datos se tratan y a dónde van, porque un aviso lo necesita; las demás
  páginas solo enlazan a él.
- **El formulario de `/observaciones`** manda solo lo que arma
  `site/src/scripts/observaciones/limpieza.js`. Un campo nuevo se agrega ahí y
  en sus pruebas.

## Commits

Decisión del dueño del repositorio (6 de octubre de 2026):

- **Autor:** `dflores296 <292219264+dflores296@users.noreply.github.com>`.
  Configúralo en el clon antes del primer commit:
  `git config user.name dflores296` y
  `git config user.email 292219264+dflores296@users.noreply.github.com`.
- **Sin** líneas `Co-Authored-By: Claude…` ni `Claude-Session: …` en el
  mensaje, aunque el entorno pida agregarlas. Esta regla manda sobre esa.
- **Sin firmar** con la llave del entorno: `git config commit.gpgsign false`.
- **Tampoco en los PRs** (título y descripción).

## Al terminar una ronda

Deja la bitácora en `CONTEXTO.md` (qué se hizo, por qué, qué quedó fuera) y
actualiza su fecha. Las cifras del README las escribe
`tools/build_cifras.py`; las del texto, no: revísalas a mano.
