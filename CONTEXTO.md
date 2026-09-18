# Contexto de trabajo

Estado del proyecto para retomarlo desde otra sesión o cuenta. El README explica
**qué es** el proyecto y cómo está construido; esto explica **dónde va**, qué hay
que entender antes de tocarlo y qué queda pendiente.

Última actualización: 18 de septiembre de 2026.

## Dónde estamos

El sitio está publicado y el pipeline es reproducible: correr las herramientas
sobre el PDF deja el árbol idéntico a lo commiteado, byte a byte.

| | |
|---|---|
| Artículos | 151 |
| Secciones | 2 897 |
| Incisos | 8 326 |
| Notas / Excepciones | 777 / 987 |
| Definiciones | 185 |
| Referencias distintas | 1 850 |
| Referencias rotas | 0 |
| Cobertura | 100 % (31 858 de 31 859 renglones) |
| Tablas | 226, todas contrastadas a mano y congeladas |

Para verificar el estado en cualquier momento:

```
python3 tools/build_tables.py NOM-001-SEDE-2012.pdf data/
python3 tools/build_corpus.py NOM-001-SEDE-2012.pdf data/
python3 tools/build_graph.py data/
python3 tools/build_search.py data/ site/public/data/
python3 tools/build_revision.py data/ REVISION-TABLAS.md
python3 tools/check_corpus.py data/        # debe salir con 0
git status --porcelain                      # debe quedar vacío
```

Si `git status` no queda vacío después de eso, algo dejó de ser reproducible y
eso es el problema a resolver antes que cualquier otra cosa.

## Lo que hay que entender antes de tocar

### 1. La captura manual manda sobre la reconstrucción

Las 226 tablas se contrastaron celda por celda contra el PDF. Ese trabajo vive en
`data/tablas_revisadas.json` y **no es barato de rehacer**. `data/tablas.json` es
derivado y se regenera en cada publicación.

Tres reglas lo protegen, y las tres rompen el build:

- **Las 226 están congeladas**: cada entrada trae sus propias `rows`, `cols` y
  `header_rows`. `build_tables.py` ya no decide el contenido de una tabla
  verificada; es una herramienta de arranque para tablas nuevas.
- **Cada entrada guarda la huella de su contenido** (`sha`, ver `tools/huella.py`).
  `build_tables.py` la recalcula y aborta **antes de escribir**; `check_corpus.py`
  la comprueba por su cuenta y además compara los dos archivos campo por campo,
  que es lo que caza una edición de la captura sin regenerar.
- **`verificada` exige congelado**: marcar una tabla como verificada sin sus
  celdas rompe `check_corpus.py`, para que la insignia del sitio no pueda mentir.

Cambiar una tabla a propósito es un paso explícito:

```
python3 tools/build_tables.py NOM-001-SEDE-2012.pdf data/ --sellar
```

La huella nueva aparece en el diff. Eso es la señal de revisión, no un trámite.

`pymupdf` está fijado a `1.28.2` en el workflow por la misma razón: una versión
que extrajera un título distinto abortaría la publicación.

### 2. La sangría del PDF es una señal, y se usa

Un párrafo nuevo arranca en `x0=47.0` (o `68.8` anidado); la continuación del
anterior va en `32.8`. Entre las dos se reparte el 85 % de las líneas de prosa.
`build_linemap` la conserva y el parser la usa para cerrar una NOTA o Excepción
cuando lo que sigue ya no es suyo.

Excepción deliberada: **si la anotación termina en dos puntos, lo que sigue sí es
suyo** (es la enumeración que anuncia), y la decisión se toma una sola vez, en el
primer renglón. La NOTA de 300-17 enumera 27 secciones y las conserva.

### 3. `parrafos` y el `seq`: todo lo intercalado va en orden

Un nodo tiene `text`, `notes`, `exceptions` y `tables`, y el renderizador los
pintaba en ese orden fijo. La prosa que en el documento va **después** de una
nota, de una excepción o de una tabla no cabe en `text`, que se pinta primero.

Vive en `parrafos`, cada bloque con su `seq`, y **notas, excepciones, tablas y
párrafos se ordenan todos por ese `seq`**, que es su posición real en el PDF. Hoy
son 83 nodos con `parrafos`.

Si agregas otra cosa que se intercale, dale `seq` y métela en esa misma lista en
los dos renderizadores. Las figuras todavía no participan.

Si mudas texto de campo, **enséñale el campo nuevo a todo lo que lo lee**:
`collect_refs` y el contador de cobertura en `build_corpus.py`, `node_text` en
`build_graph.py`, `flat_text` en `build_search.py` y los dos renderizadores
(`Sub.astro` y `art/[num].astro`). Omitir uno pierde el texto sin ruido.

### 4. Las zonas de tabla recortan el flujo de texto

`data/tablas_regiones.json` marca qué zonas de página ocupa una tabla, para que su
contenido no reaparezca como párrafo. Dos formas de equivocarse, las dos vistas ya:

- **Región corta**: las notas al pie quedan fuera y se publican dos veces, una en
  la tabla y otra como prosa del inciso siguiente (pasó en 514-3(b)(1) y 515-3).
- **Región larga**: se traga prosa que no es de la tabla y el texto desaparece
  (pasó en 690-31(d), donde el inciso dejó de existir). Hoy una tabla solo puede
  tragarse el texto que de veras capturó.

### 5. Las listas blancas se justifican una por una

`HUECOS_DEL_DOF` en `check_corpus.py`, `TABLAS_AUSENTES` y `ERRATAS_TABLAS` en
`build_graph.py`. Cada entrada lleva su cita y su página. **No agregues una para
que el check pase**: la diferencia entre una errata del DOF y un defecto del
parser no se deduce del corpus, hay que abrir el PDF.

### 6. El DOF tiene erratas de puntuación que rompen detectores

Ya van cuatro, y cada una escondió contenido normativo. Súmales las tablas que
la norma imprime SIN número ni título —`220-83(a)`, `220-83(b)`, `922-17(c)` y la
del `922-56(b)`—, que el detector tampoco puede ver porque no hay título que
detectar: se dan de alta a mano y se declaran `sin_numero`, sin inventarles uno.

| Impreso | Debía decir | Qué escondía |
|---|---|---|
| `Tabla 408.- 56` | `Tabla 408-56.-` | La tabla, publicada como párrafo |
| `Tabla 685.-3.` | `Tabla 685-3.-` | Igual |
| `e).` (28 casos, 26 en el art. 800) | `e)` | Incisos enteros colgando un nivel abajo |
| `TABLA 830-15.-` en versalitas | `Tabla 830-15.-` | La tabla de límites de potencia |

Cuando algo no cuadre, **mira cómo lo imprime el PDF antes de sospechar del
parser**.

## Qué se hizo en esta ronda

Dieciséis merges sobre `4af7f0b`. Lo sustantivo:

**Contenido recuperado**

- Seis tablas que no existían en el corpus: **408-56**, **685-3**, **830-15**,
  **220-83(a)**, **220-83(b)** y la del **922-56(b)**. Todas se publicaban como párrafo corrido.
- **Incisos**: 8 261 → 8 326. Estaban escondidos dentro de notas, excepciones o
  zonas de tabla. `690-31(d)` no estaba mal colocado: **no estaba**.
- **67 notas y excepciones** se habían quedado con 139 párrafos ajenos
  (~100 000 caracteres devueltos a su inciso).
- **610-14(a)**: el renglón de temperaturas estaba corrido un grupo de columnas;
  «Tipos MTW, RHW…» —que es 75 °C— aparecía bajo 90 °C.
- **922-55**: cuatro bandas partidas y con el orden de palabras revuelto.

**Redes de seguridad nuevas**

| Detector | Qué caza | Dónde |
|---|---|---|
| Huella de contenido | Que una tabla verificada cambie sola | `tools/huella.py` |
| Huecos de numeración | Un inciso mal colocado o perdido | `check_corpus.py` |
| Destinos `tabla:` | Una referencia a una tabla que no existe | `build_graph.py` |
| Congelado obligatorio | La insignia «Verificada» sin respaldo | `check_corpus.py` |

Las cuatro están probadas: al romper algo a propósito, el build falla.

**Limpieza**

- Se retiró `encabezado_dudoso`: marcaba cinco tablas sanas y ninguna enferma.
- El aviso de tabla sin contrastar en `Tabla.astro` vuelve a poder renderizarse.
- El exportador ya no promete tablas que no escribe, y su manifiesto se adapta al
  recorte de `--solo-mt`.

## Pendientes

Ninguno bloquea nada. En orden de valor:

1. **`240-4(d)`: los huecos 4 y 6 parecen contenido ausente, no renumeración.**
   Los cinco incisos impresos son todos de cobre (18, 16, 14, 12, 10 AWG) y los
   huecos caen justo donde irían las entradas de aluminio. Está anotado en
   `HUECOS_DEL_DOF` como salto de numeración; vale la pena precisar en el
   comentario que lo que falta es contenido, porque cambia cómo se lee.

2. **`grid` tiene dos valores para lo mismo.** La reconstrucción escribe
   `"rejilla"` y las altas manuales `"dibujada"` (6 entradas). Hoy no afecta nada
   —solo lo lee una señal que no se muestra en tablas verificadas— pero es una
   trampa para el siguiente que escriba una condición sobre ese campo.

3. **Cobertura: 31 858 de 31 859.** El renglón que falta es
   `366-58. Conductores aislados.` El README redondea a «100 %».

4. **104 identificadores dejaron de existir y hay 169 nuevos.** Al destapar
   estructura mal anidada, ids como `800-113(d)(3)c.a.` pasaron a
   `800-113(d)(3)c.(3)a.`. El grueso es del artículo 800 (87 de los 104), y el
   resto se reparte sobre todo entre el 522, el 430 y el 220. Cualquier enlace
   profundo anterior a esta ronda puede no servir. No es un defecto —la
   estructura nueva es la correcta— pero nadie ha revisado la lista completa.

## Trampas del entorno

- **`dflores296.github.io` está bloqueado** desde el entorno de Claude Code en la
  nube. Se puede construir el sitio y servirlo en `localhost` para revisarlo con
  Playwright, pero no abrir la URL publicada. Verificar el deploy es mirar que el
  workflow salga en verde.
- **Borrar ramas remotas devuelve 403.** Hay que hacerlo desde la web o desde un
  clon local.
- **Chromium está preinstalado** en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Para medir geometría de tablas renderizadas hay que servir `site/dist` por HTTP
  con la ruta base `/NOM-001-SEDE-2012`: con `file://` no cargan los estilos.
