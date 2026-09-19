# Contexto de trabajo

Estado del proyecto para retomarlo desde otra sesión o cuenta. El README explica
**qué es** el proyecto y cómo está construido; esto explica **dónde va**, qué hay
que entender antes de tocarlo y qué queda pendiente.

Última actualización: 19 de septiembre de 2026.

## Dónde estamos

El sitio está publicado y el pipeline es reproducible: correr las herramientas
sobre el PDF deja el árbol idéntico a lo commiteado, byte a byte.

| | |
|---|---|
| Artículos | 151 |
| Secciones | 2 897 |
| Incisos | 8 315 |
| Notas / Excepciones | 777 / 987 |
| Definiciones | 185 |
| Referencias distintas | 1 850 |
| Referencias rotas | 0 |
| Cobertura | 100 % (31 858 de 31 859 renglones) |
| Ids retirados con destino | 143 de 143 |
| Tablas | 226, todas contrastadas a mano y congeladas |
| Figuras | 51 números en 45 imágenes, más 13 fórmulas; leyendas capturadas a mano |

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

`tools/build_redirects.py` **no** va en esa lista: no deriva del PDF sino de la
historia del repositorio, y su salida (`site/public/ids-retirados.json`) se
versiona ya construida. Solo se vuelve a correr cuando una ronda mueve
identificadores; ver «Enlaces profundos» más abajo.

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

### 1b. El rótulo de una figura tampoco sale del PDF

De las 59 imágenes, **45 llevan su leyenda dibujada dentro del PNG**: «Figura
230-1.- Acometidas» es parte del mapa de bits. Solo 9 la tienen en la capa de
texto, y de esas 9 sale todo lo que el parser podía saber. Las demás están
capturadas a mano en `data/figuras.json`, con la misma política que las tablas:

- **La captura manda.** No hay reconstrucción de la que echar mano, así que una
  figura nueva sin capturar **aborta el build** en `aplicar_figuras`.
- **Cada entrada sella la huella del PNG** que describe. Si la extracción
  cambiara, la leyenda dejaría de estar respaldada: `build_corpus.py` aborta
  antes de escribir y `check_corpus.py` lo vuelve a comprobar por su cuenta.
- **`check_corpus.py` cuida el directorio de imágenes**: que cada `src` exista y
  que no sobre ningún PNG. `site/public/img/` se versiona y el pipeline lo
  reescribe sin limpiarlo, así que un huérfano se publicaría para siempre.

Dos cosas que hay que tener presentes al tocarlo:

- **Una imagen puede traer más de una figura.** La 516-3(c)(1) y la (c)(2)
  comparten dibujo, igual que la 517-30(a) y la (b), la 923-10(a)(3) y la (c), y
  las dos del 694. Por eso `rotulos` es una lista: tratarlo como un campo dejaba
  tres figuras citadas por el texto sin existir en ninguna parte.
- **La figura no vive donde la citan.** La norma la imprime donde cabe en la
  página: la «Figura 551-46(c)» está en 551-47(a), la 760-154(d) en 760-176(b),
  la 922-54 en 922-55(b). Por eso el ancla se calcula desde el rótulo capturado
  y no desde el nodo, y por eso `linkify` tiene una rama propia para «Figura»:
  sin ella enlazaba el número desnudo y mandaba al lector a la sección homónima,
  que en 12 de las 51 citas no es donde está la figura.

Y una tercera, de contenido: **15 imágenes encierran texto que el PDF no tiene
como texto** —la Excepción entera de 922-12(a)(2), el inciso d) de 310-60(c)(4),
la Tabla 240-92(b) completa—. Va en `transcripcion` y de ahí sale a la búsqueda
y al `<details>` de la figura. La cobertura del 100 % no puede verlo: cuenta
renglones de la capa de texto, y esto nunca estuvo ahí.

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
son 91 nodos con `parrafos`.

Las figuras entran en la misma lista: la fórmula de 504-10(b)(2) se pintaba
después de todo el texto, así que el «Donde, T = es la temperatura superficial»
salía antes que la fórmula que explica. Si agregas otra cosa que se intercale,
dale `seq` y métela en esa lista en los dos renderizadores.

**Un bloque de `parrafos` no es un solo párrafo.** Dentro de él, cada renglón en
sangría de párrafo (47.0) abre uno nuevo: tras esa misma fórmula el PDF imprime
«Donde,», «T = …», «Po = …», «Rt = …» y «Tamb = …» como cinco párrafos, uno por
renglón, y concatenados se leían como una frase corrida. Son siete nodos, entre
ellos las variables de 922-12(a)(2) y las observaciones de 924-24.

Si mudas texto de campo, **enséñale el campo nuevo a todo lo que lo lee**:
`collect_refs` y el contador de cobertura en `build_corpus.py`, `node_text` en
`build_graph.py`, `flat_text` en `build_search.py` y los dos renderizadores
(`Sub.astro` y `art/[num].astro`). Omitir uno pierde el texto sin ruido.

### 3b. Un item de anotación puede no tener rótulo

La Excepción de 250-32(b)(1) enumera tres requisitos, luego dice «Si el conductor
puesto a tierra se usa … de acuerdo con las disposiciones de **esta excepción**,
el tamaño … no debe ser menor que el mayor de cualquiera de los siguientes:» y
enumera dos más. Ese párrafo intermedio es de la excepción —se cita a sí misma—,
pero no es un item numerado.

Se guarda como item con `label: null` para conservar el orden, y eso tiene un
efecto de segundo orden que hay que respetar: **un item sin rótulo reinicia la
numeración**, porque la lista que sigue empieza de cero legítimamente. Sin eso,
la comprobación de continuidad (§5) cortaba la excepción ahí y soltaba los dos
últimos incisos al nivel del requisito. Hoy son 5 items sin rótulo.

Los dos renderizadores los pintan sin viñeta (`li.anot-parr`). Si agregas un
campo a los items, acuérdate de que `label` puede ser `null`.

### 4. Las zonas de tabla recortan el flujo de texto

`data/tablas_regiones.json` marca qué zonas de página ocupa una tabla, para que su
contenido no reaparezca como párrafo. Dos formas de equivocarse, las dos vistas ya:

- **Región corta**: las notas al pie quedan fuera y se publican dos veces, una en
  la tabla y otra como prosa del inciso siguiente (pasó en 514-3(b)(1) y 515-3).
- **Región larga**: se traga prosa que no es de la tabla y el texto desaparece
  (pasó en 690-31(d), donde el inciso dejó de existir). Hoy una tabla solo puede
  tragarse el texto que de veras capturó.

### 5. Dos señales más que el parser ya usa

- **Un marcador en sangría de continuación (`x0=32.8`) que sigue en minúscula no
  abre inciso.** Es una frase que se partió de renglón justo antes del marcador:
  725-121(a) dice «una de las fuentes (1), (2), (3), (4) ó (5) siguientes» y la
  segunda línea abre con «(4) ó (5) siguientes.». Tomarla por inciso creaba un
  nodo fantasma del que colgaban los incisos de verdad, un nivel más abajo. Son
  16 renglones en las 780 páginas; los cuatro incisos legítimos impresos en esa
  sangría (pág. 158) abren en mayúscula y se conservan.
- **Los items de una anotación tienen que CONTINUAR su numeración.** Si el
  marcador repite el anterior o vuelve a empezar, la lista terminó: el «(4)» que
  sigue a la NOTA de 725-121(a)(3) es el cuarto inciso de la sección, no un
  quinto ejemplo. Salvo que el item anterior sea uno sin rótulo, ver §3b.

### 5b. El pie de figura tiene dos trampas, las dos vistas

El detector (`RE_FIGCAP`) admite sufijo de inciso en el número —«Figura
550-10 (c).-» con espacio y «Figura 690-1(a).-» sin él—, y eso abre dos formas
de equivocarse que ya costaron contenido:

- **Una cita del cuerpo que se parte de renglón justo antes queda sola en la
  línea y parece leyenda.** 820-154 dice «…e ilustrados en la / Figura
  820-154.» y 551-46(c) «…que cumpla con la configuración mostrada en la /
  Figura 551-46 (c).» Se distinguen por la sangría de continuación (32.8), que
  una leyenda de verdad nunca usa. Es la misma señal del punto anterior.
- **La segunda línea de una leyenda se reconoce por empezar en minúscula, y un
  marcador de inciso también lo hace.** La leyenda de la Figura 450-4 se tragaba
  «b) Transformador conectado en campo…», la de la 515-3 los incisos b) y c) de
  515-8, y la de la 550-10 (c) el inciso d) entero. Hoy se exige que la línea no
  abra inciso.

Hoy hay 9 figuras con leyenda. Si tocas ese detector, compruébalas todas: cada
una que se pierda se publica como prosa, y cada una que se pase de largo se
come el inciso siguiente.

### 6. Las listas blancas se justifican una por una

`HUECOS_DEL_DOF` en `check_corpus.py`, `TABLAS_AUSENTES` y `ERRATAS_TABLAS` en
`build_graph.py`. Cada entrada lleva su cita y su página. **No agregues una para
que el check pase**: la diferencia entre una errata del DOF y un defecto del
parser no se deduce del corpus, hay que abrir el PDF.

### 7. El DOF tiene erratas de puntuación que rompen detectores

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

## Qué se hizo en la ronda de las figuras

Las figuras eran el único contenido de la norma sin número, sin ancla, sin
índice y sin búsqueda: se publicaban con `alt="Figura de la página 84 del PDF"`.

- **Las 59 imágenes capturadas a mano** en `data/figuras.json`: 51 números de
  figura, 13 fórmulas y una tabla. Ver §1b.
- **Ancla por figura**, índice en `/figuras` agrupado por capítulo, documentos
  `kind: "fig"` en la búsqueda y bloque de Figuras en el índice lateral del
  artículo.
- **`linkify` conoce «Figura»**: las 76 citas del texto y de las celdas de tabla
  aterrizan en la figura. Antes, 12 caían en una sección que no la contiene.
- **`Figura.astro`**: el bloque `<figure>` estaba duplicado palabra por palabra
  en `Sub.astro` y en `art/[num].astro`.
- **La Tabla 240-92(b) existe.** `TABLAS_AUSENTES` decía «No hay tabla con ese
  número» y sí la hay, en la página 82: el DOF la imprime como imagen. Se
  transcribió, se le dio ancla en el espacio de nombres de las tablas y su cita
  dejó de estar en la lista blanca del grafo.
- **El `width`/`height` sale de los píxeles del PNG** y no del rectángulo en
  puntos donde el PDF coloca la imagen: la del 310-15(c) se publicaba estirada
  un 3.6 %.

**Redes de seguridad nuevas**

| Detector | Qué caza | Dónde |
|---|---|---|
| Piso de figuras en `MIN` | Que una regresión deje artículos sin su diagrama | `check_corpus.py` |
| Huella del PNG | Que la imagen cambie y la leyenda deje de describirla | `check_corpus.py`, `build_corpus.py` |
| Captura obligatoria | Una figura nueva publicada sin rótulo | `build_corpus.py` |
| Archivo ausente / huérfano | Una imagen rota, o un PNG publicado que nadie cita | `check_corpus.py` |
| Anclas repetidas | Dos figuras que se disputan el mismo enlace | `check_corpus.py` |

Las cinco están probadas: al romper cada cosa a propósito, el build falla.

## Qué se hizo en la ronda anterior

Once merges (23 commits) sobre `4af7f0b`. Lo sustantivo:

**Contenido recuperado**

- Seis tablas que no existían en el corpus: **408-56**, **685-3**, **830-15**,
  **220-83(a)**, **220-83(b)** y la del **922-56(b)**. Todas se publicaban como párrafo corrido.
- **Incisos**: 8 261 → 8 315 (neto: se rescataron más de los que se retiraron al
  deshacer anidamientos falsos). Estaban escondidos dentro de notas, excepciones,
  zonas de tabla o pies de figura. `690-31(d)` no estaba mal colocado: **no
  estaba**.
- **67 notas y excepciones** se habían quedado con 139 párrafos ajenos
  (~100 000 caracteres devueltos a su inciso).
- **610-14(a)**: el renglón de temperaturas estaba corrido un grupo de columnas;
  «Tipos MTW, RHW…» —que es 75 °C— aparecía bajo 90 °C.
- **922-55**: cuatro bandas partidas y con el orden de palabras revuelto.
- **Cuatro incisos dentro de un pie de figura**: `450-4(b)`, `515-8(b)`,
  `515-8(c)` y `550-10(d)`. Tampoco estaban mal colocados: no estaban (§5b).

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

## Enlaces profundos: los identificadores que cambiaron

Al destapar estructura mal anidada, **143 identificadores dejaron de existir y
aparecieron 197**. `800-113(d)(3)c.a.` pasó a `800-113(d)(3)c.(3)a.`, y los peores
del Artículo 800 se llamaban `800-113(f)(3)e.e.(3)c.(3)e.(7)(7)(4)a.`, que nunca
describió la estructura real de la norma. El grueso es del 800 (87 retirados,
119 nuevos); el resto se reparte entre el 522, el 725, el 430 y el 250.

La lista completa está revisada, y el resultado es que **no se perdió contenido**:
de los 143 retirados, el texto de todos aparece publicado en el corpus de hoy.
Los seis que a primera vista no aparecían eran textos que el parser viejo tenía
pegados —«Ensamble de cable ruteador de propósito general. h). Charolas porta
cables…»— y hoy están partidos en incisos con título propio (`800-113(h)`,
`800-113(j)`, `800-44(b)`…). Que la cadena completa ya no exista es el arreglo,
no una pérdida.

Un enlace profundo anterior sigue siendo un problema real: el ancla no existe, el
navegador se queda arriba de la página **sin decir nada** y parece que el
contenido se perdió. Contra eso hay un mapa de 143 entradas en
`site/public/ids-retirados.json`, que `Base.astro` consulta **solo cuando el ancla
falla** —la navegación normal no paga nada— y que lleva al lector al destino con
un aviso de qué pasó. Los destinos salen de dos reglas:

| Regla | Cuántos | Cuándo |
|---|---|---|
| Por contenido | 79 | El título y el texto aparecen idénticos en un único nodo nuevo |
| Por ancestro | 64 | El prefijo más largo que sí existe; 52 de ellos caen en `800-113(f)(3)e.` |

El identificador viejo se deja en la URL a propósito: reescribirla borraría la
única pista de a dónde quería ir el lector.

Para regenerarlo tras otra ronda que mueva ids:

```
git show <commit-anterior>:data/corpus.json > /tmp/antes.json
python3 tools/build_redirects.py /tmp/antes.json data/corpus.json \
        site/public/ids-retirados.json
```

Va en `site/public/` y no en `site/public/data/` **a propósito**: ese directorio
está en `.gitignore` porque `build_search.py` lo regenera en cada publicación, así
que un archivo puesto ahí existiría en local y desaparecería en CI.

## Pendientes

De la ronda de figuras, tres cosas que quedaron fuera a propósito:

- **`fig-996.png` (550-18(b)(6)) sin transcribir.** Es un ejemplo de cálculo
  numérico de media página; las 15 transcritas son las que encierran texto
  normativo o definiciones de variables.
- **Miniaturas para `/figuras`.** El índice va en texto, como el de tablas.
  Poner las 59 imágenes a tamaño completo son 4.1 MB; con miniaturas generadas
  desde `pymupdf` bajaría a unos 600 KB, a cambio de más binarios versionados.
- **Backlinks de figura en el grafo.** Hoy una figura no sabe quién la cita; la
  «Figura 551-46(c)» tiene 7 citas y no se ven. Sería un destino `figura:` en
  `build_graph.py`, análogo a `tabla:`.

Y una que no es de figuras: **el Anexo B cuelga del Artículo 924.** Las tablas y
figuras `B.310-15(B)(2)(x)` están dentro de `924-24`, que se titula «Tarimas y
tapetes aislantes». El contenido está publicado y no se pierde, pero su lugar en
el árbol no es el que le toca.

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
