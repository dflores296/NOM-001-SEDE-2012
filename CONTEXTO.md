# Contexto de trabajo

Estado del proyecto para retomarlo desde otra sesión o cuenta. El README explica
**qué es** el proyecto y cómo está construido; esto explica **dónde va**, qué hay
que entender antes de tocarlo y qué queda pendiente.

Última actualización: 8 de octubre de 2026.

## Dónde estamos

El sitio está publicado y el pipeline es reproducible: correr las herramientas
sobre el PDF deja el árbol idéntico a lo commiteado, byte a byte.

| | |
|---|---|
| Artículos | 151 |
| Secciones | 2 898 |
| Incisos | 8 306 |
| Notas / Excepciones | 773 / 986 |
| Definiciones | 185 |
| Referencias distintas | 1 685 |
| Referencias enlazadas / rotas | 4 530 / 0 |
| Cobertura | 100 % (31 452 de 31 453 renglones) |
| Ids retirados con destino | 143 de 143 |
| Tablas | 245, todas contrastadas a mano y congeladas |
| Figuras | 51 números en 45 imágenes, más 13 fórmulas; leyendas capturadas a mano |
| Cierre | 7 hitos (Capítulo 10, Títulos 6 a 8, Apéndices A, B y C), 123 bloques |

Para verificar el estado en cualquier momento:

```
bash tools/verificar.sh                     # debe salir con 0
git status --porcelain                      # debe quedar vacío
```

`verificar.sh` es lo mismo que corre la publicación: regenera todo desde el
PDF en orden, corre `build_cifras.py --check` y `check_corpus.py`, compila el
sitio, revisa que ningún enlace interno esté roto (`check_enlaces.py`) y compara el contenido publicado contra `tools/huella_sitio.txt` (ver
«La huella del sitio» en `docs/arquitectura.md`).

`tools/build_redirects.py` **no** va en esa lista: no deriva del PDF sino de la
historia del repositorio, y su salida (`site/public/ids-retirados.json`) se
versiona ya construida. Solo se vuelve a correr cuando una ronda mueve
identificadores; ver «Enlaces profundos» más abajo.

Si `git status` no queda vacío después de eso, algo dejó de ser reproducible y
eso es el problema a resolver antes que cualquier otra cosa.

## Lo que hay que entender antes de tocar

### 1. La captura manual manda sobre la reconstrucción

Las 245 tablas de la norma se contrastaron celda por celda contra el PDF. Ese
trabajo vive en `data/tablas_revisadas.json` y **no es barato de rehacer**. `data/tablas.json` es
derivado y se regenera en cada publicación.

Tres reglas lo protegen, y las tres rompen el build:

- **Las 245 están congeladas**: cada entrada trae sus propias `rows`, `cols` y
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

## El asistente de /preguntar (7 de octubre de 2026)

El dueño quería un chat con IA en la guía sin pagar un servicio. Se
descartaron, por este orden: un modelo dentro del navegador (cientos de MB
de descarga, casi inútil en el celular, y los modelos que caben inventan
números de sección y ampacidades); la API de un modelo comercial (se paga por
pregunta); el plan gratis de Gemini (usa las preguntas para entrenar y lo
recortaron varias veces en 2026); y un dominio u hosting propio, que no hacen
falta para nada de esto.

Quedó: **un Worker de Cloudflare en el plan gratis** (`ia/agente.js`) que
llama a **gpt-oss-20b** (OpenAI, Apache-2.0) en Workers AI. 10 000 neuronas
al día, unas 130 preguntas **entre todos** (estimación inicial; medido el 8 de
octubre, con los tres pasos, unas 40 a 45: ver «Cuánto se usa»); al acabarse
no cobra, contesta el
error 3036 hasta las 00:00 UTC (6 pm en el centro de México). Cómo se publica
y qué hacer si algo falla: `ia/README.md`. El reparto, en «El asistente» de
`docs/arquitectura.md`.

Lo que hay que entender antes de tocarlo:

- **Buscar lo hace el navegador**, con el índice de siempre. El Worker no
  carga la norma: el plan gratis le da 10 ms de CPU por petición.
- **El buscador no sirve tal cual para una pregunta entera.** Con
  «¿qué calibre… circuito de 20 A?» el «20» encontraba el 668-20, el 250-20 y
  el 300-20 por su número, y las definiciones (títulos cortos) llenaban el
  envío: salían la Tabla 250-122 y cinco definiciones, sin la sección 250-122.
  Por eso `buscarPregunta` busca solo en título y texto, sin números, y
  `elegir` pone cupo por tipo. Un código escrito («el 250-122») va primero y
  exacto.
- **Las tablas van renglón por renglón** (`lib/tabla-texto.js`), no aplanadas
  como en el buscador. Las celdas con `rs`/`cs` se repiten en cada posición
  que cubren.
- **La respuesta es texto ajeno**: se pinta con `textContent`, y solo es enlace
  una cita de algo que se mandó. Una referencia inventada queda como texto.
- **Los topes van en cascada**: el campo admite 500 caracteres y el Worker
  también; `PRESUPUESTO` (página) por debajo de `TOPES` (Worker).
  `site/pruebas/preguntar.mjs` lo comprueba, y también que el Worker acepte el
  rótulo y el título de los 3 399 documentos del buscador: había 17 tablas con
  títulos de más de 300 caracteres que se habrían rechazado.
- **El modelo puede salir del plan gratis.** En julio Cloudflare pasó tres
  modelos a «solo de pago» (error 5035). gpt-oss-20b sigue gratis; si cambia,
  se cambia `MODELO` en `ia/wrangler.jsonc`.

**Conectado el mismo día** en `https://nom-001-ia.bettofe.workers.dev`: cuenta
de Cloudflare del dueño, plan gratis, con Workers Builds conectado al
repositorio (rama `main`, carpeta raíz `ia`). Cada cambio en `ia/` que llega a
`main` se vuelve a publicar solo (en realidad, cualquier cambio que llega a
`main`: ver el paso 0 en «La auditoría del asistente»). El primer intento falló con «root directory
not found» porque `ia/` aún no estaba en `main`: el Worker se publica desde
ahí, no desde la rama de trabajo. El registro del Worker (Observability) guarda
solo lo que escribe `console.error` —el error del modelo, nunca la pregunta—,
sin registros por petición, que traerían la IP de cada visitante. *(Ya no es
así: después anota también lo que tarda y gasta cada consulta y los eventos
`pregunta` y `respuesta_generada`; ver «Cuánta gente lo usa» en
`ia/README.md` y el aviso de privacidad.)*

Con `site/src/lib/asistente.js` vacío no hay pestaña ni conexión en la CSP, y
`/preguntar` avisa que no está conectado: así se desconecta si hiciera falta.

**La primera pregunta real falló** con «No me pude conectar con el asistente»:
la página no recibió nada legible del Worker. Abierta directo, la dirección del
Worker sí contestaba (`{"error":"origen"}`, que es lo correcto fuera de la
guía). Lo que se encontró y se cambió:

- **`agente.js` exportaba de más.** Cloudflare toma cada `export` del archivo
  principal como una entrada del Worker, y `workerd` en local no arrancaba con
  `export const TOPES`: «Incorrect type for map entry 'MODELO'». Producción sí
  lo publicó (la subida mide el arranque), así que quizá no era la causa, pero
  estaba mal: ahora `agente.js` solo exporta `default` y todo lo demás vive en
  `nucleo.js`. Una prueba lo cuida.
- **Una falla no prevista ya contesta con permiso CORS** (500, `falla`) y queda
  en el registro. Antes Cloudflare devolvía su página de error y la página
  solo podía decir «no me pude conectar».
- **El registro anota cuánto tardó el modelo**, y la página espera 90 s (eran
  60) y distingue «tardó demasiado» de «no me pude conectar». La CPU no era:
  3 ms la primera petición y menos de 1 ms después, de 10 permitidos.

Cómo se probó de punta a punta sin poder llegar a Cloudflare: `wrangler dev`
corre el Worker en `workerd` con una envoltura que le da un modelo de mentiras,
y Chromium abre `/preguntar` desde otro origen con la CSP y el
`data-asistente` reescritos. Chromium bloquea entre dos direcciones locales
(«`unknown` address space»); para la prueba se apaga con
`--disable-features=LocalNetworkAccessChecks`. Si la página vuelve a fallar en
el sitio publicado, la respuesta está en **Workers & Pages → nom-001-ia →
Observability**. Las pruebas en navegador no dependen de eso:
reescriben el `data-asistente` de la página hacia el mismo servidor y
contestan ellas.

De paso: `main.obs` (observaciones y preguntar) perdía el margen lateral de
`.wrap` por una regla de `articulo.css`; en el teléfono el texto llegaba al
borde de la pantalla. Se le devolvió.

Quedó fuera, a propósito:

- **Tope por IP en el Worker.** El de Cloudflare (Rate Limiting) cuenta por
  minuto, y contra la cuota diaria no sirve; uno diario pide KV. Hoy hay un
  tope de 20 preguntas al día por navegador. Si un bot se acaba la cuota, lo
  siguiente es Turnstile. *(Después: 10 por navegador, y un tope de 15
  consultas por minuto por conexión en el Worker; ver «Cuánto se usa».)*
- **Guardar respuestas repetidas.** La Cache API no funciona en `workers.dev`;
  haría falta KV.
- **Las erratas del DOF en las tablas** (README, «Erratas»): el asistente cita
  el valor impreso, como la página. Pasarle esas notas sería una mejora
  sencilla para la 430-250. *Hecho en la cuarta vuelta.*
- **Conversación con memoria.** Cada pregunta va sola; «¿y para 30 A?» no sabe
  de qué se hablaba.

### El asistente lee el índice (7 de octubre, segunda vuelta)

Ya conectado, contestaba pero mal. A «¿qué protección se usa para calibres
pequeños?» respondió que los fragmentos no lo decían, y era cierto: la página
adivinaba qué leer con el buscador, y el recorte por oraciones le quitó al
240-4(d) justo los renglones con los amperes (los incisos (1) a (7) no repiten
las palabras de la pregunta). Además, el texto del buscador pierde los números
de los incisos: aunque hubiera llegado completo, el modelo no podía citar
«240-4(d)(3)».

La idea del dueño: **que el modelo escoja qué leer a partir de un índice**, en
vez de que la página adivine. Se midió antes de armarlo:

| Índice | Tamaño |
|---|---|
| Los 151 artículos + cierre | ~2 000 tokens |
| Las 2 898 secciones + 245 tablas | ~35 000 tokens |
| Un artículo con secciones, incisos con título y tablas | mediana ~330, máximo ~4 800 (el 250) |

Mandar el índice completo con cada pregunta se comía la cuota (~15 preguntas
al día). Quedó en **dos niveles, como un libro**: índice general → índice del
artículo → texto completo. Son tres consultas, pero chicas: en la prueba de
punta a punta leyeron ~4 500 tokens en total. Cómo está hecho, en «El
asistente» de `docs/arquitectura.md`.

- **El texto que lee es otro que el del buscador:** cada renglón con su
  identificador entre corchetes ([240-4(d)(3)] 2.08 mm2 (14 AWG) de cobre. 15
  amperes.), en el orden del sitio. Lo arma `lib/asistente-datos.js` y se
  publica en `/data/ia/` (157 archivos; el más grande, el 250, 212 KB). La
  página solo baja los de los artículos que el modelo escogió.
- **Lo que pide el modelo se lee con manga ancha** (`preguntar/lectura.js`):
  numera, copia el título, escribe «240.4(D)». Si no pide nada que exista, la
  página busca con el buscador de siempre: el asistente de la primera vuelta
  quedó como respaldo.
- **Memoria:** las dos preguntas y respuestas anteriores van con cada consulta.
- **Mensajes:** «No me pude conectar» parecía decirlo el asistente. Ahora la
  página dice que la pregunta no le llegó, y la lista de abajo aclara si es lo
  que leyó o lo que encontró sin respuesta. En la computadora del dueño falla
  así y en su celular con datos no: casi seguro su red bloquea `workers.dev`.
- **El Worker anota los tokens** de cada consulta en su registro, para medir la
  cuota de verdad. La estimación: 35 a 60 preguntas al día con gpt-oss-20b.

Quedó fuera: dejar que el modelo use herramientas por su cuenta (un agente
que busca y abre partes las veces que quiera). Es lo más flexible, pero cada
pregunta costaría de 3 a 5 veces más y la forma en que gpt-oss llama
herramientas en Workers AI no se puede probar desde aquí. Las tres consultas
de ahora usan solo texto que entra y texto que sale, que ya se comprobó.

### Más exacto y más claro (7 de octubre, tercera vuelta)

Con el índice mejoró mucho, pero una respuesta dijo que la protección del
14 AWG de cobre «puede ser de 20 amperes»: la norma dice 15 (240-4(d)(3)).
Había leído también el 551-43, de vehículos recreativos, donde sí aparecen
20 A, y el modelo chico «pensando poco» le aplicó al 14 AWG una condición del
18 AWG. Otras respuestas eran largas, copiaban renglones de tabla con «|», y
algunas citas venían en 【 】 y no eran enlace.

Por decisión del dueño, a cambio de menos preguntas al día (unas 25 a 40):

- **Redacta gpt-oss-120b, pensando más** (`MODELO_REDACTAR`, `ESFUERZO`);
  escoger sigue con el 20b. Si el grande no está disponible, redacta el chico.
  Los dos gastan de la misma cuota diaria, que es por cuenta y no por modelo.
- **Instrucciones nuevas:** en el paso 1, los capítulos 1 a 4 primero y los
  especiales solo si la pregunta habla de ellos; en el 2, hasta 4 partes y el
  inciso exacto; en el 3, la respuesta directa primero, máximo 3 puntos,
  valores de tabla dichos con palabras, «fíjate a qué calibre y condición
  corresponde cada valor», ignorar lo de otro tipo de instalación y, si la
  pregunta es ambigua, contestar lo común y preguntar qué aspecto le interesa.
- **Se lee primero el inciso pedido y las secciones; las tablas al final**, y
  son 4 partes, no 8.
- **Las citas en 【240-4】 o 【240-4†L3】** (los corchetes del entrenamiento de
  gpt-oss) se vuelven [240-4] y son enlace.
- **Guía y ejemplos** debajo del formulario: cómo preguntar (una cosa a la
  vez, lugar, conductor, tensión, qué se quiere saber, las palabras de la
  norma) y cinco preguntas que se ponen en el campo sin mandarse.
- **«Nueva conversación»** borra la memoria, para cambiar de tema.
- **«¿Algo está mal en esta respuesta?»** lleva a `/observaciones` con todo
  escrito y el tipo nuevo «Respuesta del asistente». Viaja por
  `sessionStorage`; de la URL solo se toma la referencia, que pasa el filtro de
  siempre (`refDeURL`).

Quedó fuera: revisar cada número de la respuesta contra lo leído. No habría
atrapado este error —los 20 A sí estaban en lo leído, en otro artículo—, y
con el grande redactando y menos partes leídas el caso debería ser raro. Si
los reportes muestran que no lo es, es lo siguiente.

### Tablas citadas, pistas y erratas (8 de octubre, cuarta vuelta)

El dueño lo probó con preguntas reales. Bien: 14 AWG → 15 A, y «¿y el 12?» →
20 A con la memoria. Tres fallas, cada una con su causa:

| Pregunta | Contestó | Por qué |
|---|---|---|
| Motor de 10 hp a 575 V | 44 A | Es lo que imprime la Tabla 430-250, pero es una errata del DOF (debería ser 11 A) |
| Tierra física de una pastilla de 20 A | Sin calibre | Leyó el 250-122(a), que dice «no menor a lo de la Tabla 250-122», y no la tabla |
| Protección contra falla a tierra en vivienda | El 240-13 (de equipos) | El índice general solo dice «210 Circuitos derivados»; el 210-8(a) no se ve desde ahí |

Lo que se hizo:

- **Las tablas que cita lo que va a leer se leen solas**
  (`tablasCitadas` y `conTablasCitadas` en `preguntar/lectura.js`): si el
  inciso dice «la Tabla 250-122» y quedan lugares de los 4, la página la
  agrega. Si la tabla es de otro artículo (el 240-5(a) manda a la 402-5), baja
  ese artículo. No cuentan «las Tablas 430-247 a 430-250» (son para escoger
  una, y eso lo hace el modelo), ni lo que dicen los encabezados de una tabla
  que ya viene en el texto («[Ver tabla 310-104(a)]»).
- **Pistas del buscador en los pasos 1 y 2** (`pistasDe`, `bloquePistas`):
  las 8 primeras secciones, tablas o definiciones que encuentra el buscador
  con las palabras de la pregunta van al final del índice, con su artículo;
  en el paso 2, solo las de los artículos escogidos. Son ayuda, no la
  respuesta: las instrucciones lo dicen. El índice del buscador pesa (2.7 MB);
  se empieza a bajar al enfocar el campo, y si en 6 segundos no ha llegado se
  pregunta sin pistas.
- **Las cuatro erratas del README van al pie de su tabla** como «Nota de la
  guía (no es texto de la norma)», en lo que lee el asistente
  (`site/src/lib/erratas.js`, que usa `tabla-texto.js`). La tabla sigue
  diciendo lo que imprime el DOF; una prueba comprueba que el valor impreso
  siga ahí, y si un día cambia la captura, avisa. El asistente da el valor
  impreso y avisa de la errata.
- **Unidades como la norma:** amperes, volts, watts, voltamperes; no
  amperios ni voltios.
- De paso: una definición con coma («Accesible, fácilmente») ya se puede
  pedir, y una figura con varios rótulos se encuentra por cualquiera.

Quedó fuera: las figuras de los apéndices no dan pista, porque el buscador no
dice de qué apéndice son (cuatro, todas del A).

### Una burbuja de chat en cada página (8 de octubre, quinta vuelta)

El asistente ya contestaba bien, pero el dueño no se lo imaginaba como una
pestaña al lado del Mapa, sino como una burbuja a la mano en todo el sitio, y
la página no parecía un chat. La revisión de diseño encontró lo mismo:

- En el teléfono, antes de la conversación había un título, un párrafo y un
  aviso (casi media pantalla), y después un formulario con etiqueta, pista,
  botón negro y un párrafo de privacidad: se leía como un formulario de
  contacto, no como un chat.
- La pestaña «Preguntar» no se veía en el teléfono: la barra de pestañas se
  corta en «Glosario».
- Abrir una cita llevaba a otra página y la conversación se perdía.
- Los ejemplos quedaban abajo del formulario, fuera de la vista.

Lo que se hizo:

- **Una burbuja abajo a la derecha en todas las páginas**
  (`components/Asistente.astro`, `scripts/asistente/burbuja.js`,
  `styles/asistente.css`). En la computadora abre una ventana de chat encima
  de la página, para seguir leyendo al lado; en el teléfono ocupa la
  pantalla. Mensajes en globos (las preguntas en azul a la derecha, las
  respuestas en tarjeta a la izquierda), tres puntos animados con el paso en
  que va, y debajo de cada respuesta lo que leyó como etiquetas con enlace y
  «¿Algo está mal? Repórtalo».
- **Bienvenida con tres sugerencias** que se mandan al tocarlas. Antes los
  ejemplos solo se ponían en el campo, para no gastar cupo sin querer; en un
  chat lo que se espera al tocar una sugerencia es que se mande.
- **La conversación sigue al cambiar de página** (`sessionStorage`). En el
  teléfono, abrir una cita cierra la burbuja y un punto avisa que la
  conversación sigue; en la computadora se queda abierta.
- **Sin pestaña.** `/preguntar` queda como guía: botón para abrir el
  asistente, ejemplos que lo abren y lo mandan, cómo preguntar, qué no hace y
  privacidad. En el pie del sitio, «El asistente» lleva ahí.
- `chat.js` se baja la primera vez que se abre la burbuja: quien solo lee no
  lo descarga.
- La página encoge con el teclado del teléfono
  (`interactive-widget=resizes-content` en la cabecera): sin eso, el campo
  quedaba tapado.
- En el mapa la burbuja es solo el ícono, para no tapar la leyenda; en el
  teléfono, el índice del artículo se recorre a su izquierda.
- De paso: una cita que abre con 【 y cierra con }] (pasó con la nota de una
  errata) ya se lee como cita.

Quedó fuera: que las citas se abran sin salir de la conversación (en un panel
al lado, por ejemplo). Con la conversación guardada, abrir y volver ya
funciona, y es lo que hace cualquier enlace del sitio.

**El tope por navegador, corregido.** Ya publicada la burbuja, el dueño llegó
al tope de 20 con cuatro preguntas del día: contaban también las de la víspera
(son 24 horas desde cada una, no «hasta mañana») y las que fallaron sin llegar
al asistente. Ahora solo cuenta una pregunta cuando el Worker contestó el
primer paso, que es cuando ya gastó del cupo; la llave cambió
(`preg-usadas` → `asis-usadas`), así que la cuenta empezó de cero; con 5 o
menos, debajo de la respuesta dice cuántas quedan, y en el tope dice a qué
hora se libera la siguiente.

De esa misma prueba: a «¿cuánta carga en VA lleva un circuito de 20 A de
aparatos pequeños?» contestó que no hay carga mínima, leyendo 210-11(c)(1) y
210-23. El dato está en 220-52(a): 1 500 voltamperes por cada circuito de
aparatos pequeños, para calcular el alimentador. No se tocó: si se repite con
otras cargas, lo siguiente es una pista en el paso 1 («las cargas para
calcular, en VA, están en el 220»).

### Cuánto se usa (8 de octubre, sexta vuelta)

El dueño encontró el panel de neuronas (**AI → Workers AI**): 3 130 de 10 000
en el día, con sus pruebas. Cada pregunta gasta unas 230 neuronas, así que el
cupo gratis da unas **40 a 45 preguntas al día entre todos**, no por usuario.
El modelo chico gastó el doble que el grande: lee los índices.

Decisión del dueño: **se queda Cloudflare gratis por ahora.** Se habló de un
servidor propio (una tarjeta gráfica no alcanza para cientos de usuarios, y
rentarla cuesta de cientos a miles de dólares al mes), de Cloudflare de pago
(unos 5 centavos de peso por pregunta más 5 dólares al mes) y de pasarle el
costo al usuario (cobrar, que cada quien ponga su clave o donaciones). Quedó
pendiente un botón de donaciones, si un día hace falta.

Lo que se hizo:

- **Tope por navegador de 10**, no 20: con 20, dos personas se acababan el
  cupo de todos. Una barra delgada arriba del campo, al estilo de las de uso
  de una cuenta (la pidió el dueño), dice cuántas lleva y en cuánto se libera
  la siguiente; con 3 o menos, en color de aviso.
- **Cuántos navegadores preguntan:** la primera consulta de cada pregunta
  lleva un número al azar del navegador, que cambia cada día. El Worker anota
  `{"evento":"pregunta","navegador":"…"}` con cada pregunta contestada, nunca
  la pregunta ni la IP. En Observability se cuentan las preguntas y los
  números distintos; el registro gratis guarda 3 días. La guía lo dice en
  «Privacidad y cupo». *(Se quitó de la guía el mismo día, ver dos puntos
  abajo; el número al azar se cambió por un número de orden y los «3 días»
  siguen sin comprobar: ver «La auditoría del asistente».)*
- **Contador de visitas** (Cloudflare Web Analytics, sin cookies), encendido
  con el token que dio el dueño (`site/src/lib/analitica.js`). El script entra
  en cada página como lo da Cloudflare (`type="module"`), la CSP se abre solo
  a Cloudflare Insights y el pie lo dice. Las pruebas en navegador contestan
  ese script aquí mismo, sin red. Se ve en el panel, en **Web Analytics**.
- **El texto de «Privacidad y cupo»** de `/preguntar` volvió a su versión
  corta. Se le habían agregado cómo se cuentan las preguntas y lo del número
  al azar, y el dueño lo rechazó: son notas de desarrollo, no le sirven al
  visitante. Quedó como regla en `CLAUDE.md`.
- **La guía cambió de dirección:** `/preguntar` → `/asistente`, a pedido del
  dueño (la página se llama «El asistente»; «preguntar» venía de cuando era
  pestaña). `/preguntar` quedó como desvío a la nueva (`redirects` en
  `site/astro.config.mjs`), por los enlaces ya compartidos; una prueba lo
  cuida. Los archivos del código (`scripts/preguntar/`, `preguntar.css`,
  `pruebas/preguntar.mjs`) conservan el nombre: no los ve nadie.
- **El pie decía «El código de este proyecto es libre»**, de antes del cambio
  de licencias (PolyForm Noncommercial, AGPL y CC BY-NC-SA). Lo notó el
  dueño. Ahora: consultar es libre; el uso comercial del código o los datos
  requiere permiso, con enlace a `LICENSE`.
- **Blindaje del asistente**, a pedido del dueño («contra peticiones que
  busquen saturar el servidor o sacar datos»): un tope de 15 consultas por
  minuto por conexión con el Rate Limiting de Cloudflare (`ratelimits` en
  `ia/wrangler.jsonc`, unas 5 preguntas por minuto; la IP no se anota). Se
  comprobó la configuración con `wrangler deploy --dry-run` (wrangler 4.148).
  Lo demás ya estaba (origen, revisión de lo que llega, topes de tamaño) y no
  hay datos que sacar. Quedó fuera Turnstile: hasta que los conteos muestren
  bots. Se le recomendó al dueño la verificación en dos pasos en GitHub y
  Cloudflare. Todo, en «Seguridad» de `docs/arquitectura.md`.

### La puerta: varios servicios gratis (8 de octubre, séptima vuelta)

**Se quitó el mismo día: ver «Regreso a solo Cloudflare» abajo.**

El cupo de Cloudflare (unas 40 a 45 preguntas al día) se queda corto si hay
muchos usuarios. El dueño trajo un plan de Copilot (embeddings, fine-tuning,
destilación, caché, varios servicios). Se revisó idea por idea:

- **Fine-tuning y destilación, no:** un modelo que «se aprende» la norma la
  recuerda aproximada, inventa números y no cita el inciso. Leer el texto es
  lo seguro.
- **Búsqueda por significado (embeddings), después:** podría ahorrar el
  modelo chico, que gasta dos tercios. Vectorize gratis no alcanza (cada
  búsqueda cuenta contra todos los vectores); se haría con los vectores en el
  sitio. Hay que medir que escoja igual de bien.
- **Caché, en chico:** las preguntas de ejemplo, después.
- **Varios servicios gratis: la puerta, que se hizo y se quitó.** Dos filas
  de modelos (escoger y redactar) en `ia/wrangler.jsonc`; cada consulta iba
  al primero con clave y cupo. Servicios: Cloudflare, Groq, OpenRouter,
  Mistral, Google. Se planeó solo por cómo funcionaría, sin revisar antes las
  condiciones de cada servicio; al revisarlas salieron los problemas (ver
  «Alternativas futuras no implementadas»). Cerebras quedó fuera (ya pide
  tarjeta); GitHub Models y NVIDIA también (solo para pruebas).

Lo que se hizo en esta vuelta:

- La puerta en el Worker (`ia/servicios.js`, `preguntarEnFila`), con pruebas
  de servicios de mentiras. Se publicó **apagada**: sin claves en el panel
  solo contestaba Cloudflare, y no se pegó ninguna. **Se quitó.**
- El chat dice qué modelo contestó, a pedido del dueño: «Escogió…» mientras
  piensa y «Respondió gpt-oss-120b · Cloudflare» debajo de la respuesta (se
  guarda con la conversación). **Se quedó solo «Respondió…».**
- Borrador del aviso de privacidad, fuera del repositorio, para que el dueño
  lo revise. Nombraba a los cinco servicios: hay que rehacerlo (ver abajo).

### Regreso a solo Cloudflare (8 de octubre de 2026)

El dueño: el plan era ambicioso, pero se pensó solo en cómo funcionaría y no
en los términos y condiciones de cada servicio. **Decisión: volver a la
arquitectura de antes de la puerta, con Cloudflare Workers AI como única línea
base.** Lo que pasó ese día, en orden:

| Hora | Cambio | Qué |
|---|---|---|
| 16:17 | `ff43e32` | La puerta: cinco servicios en dos filas, apagada sin llaves; el chat dice qué modelo contestó |
| 16:48 | `1c255d6` | Mistral y Google fuera de las filas |
| 17:07 | `7b03495` | Arreglo, sin relación con la puerta: la pregunta mandada antes de que baje el chat se perdía |
| 17:21 | `cc80f8e` | OpenRouter fuera de las filas |
| después | este cambio | Regreso a solo Cloudflare |

Ninguna pregunta llegó a otro servicio: sin llaves en el panel, la puerta
solo usaba Cloudflare.

Lo que quedó:

- Como antes de la puerta: gpt-oss-20b escoge qué leer (pasos 1 y 2),
  gpt-oss-120b redacta y, si no está disponible o está saturado (5035 o
  3040), redacta el 20b. `ia/nucleo.js`, `ia/wrangler.jsonc` (`MODELO`,
  `MODELO_REDACTAR`) e `ia/pruebas/agente.mjs` son los de antes de `ff43e32`,
  más una cosa: la respuesta del paso 3 dice `modelo` y `servicio`
  («Cloudflare»), con sus pruebas.
- En el chat, solo «Respondió gpt-oss-120b · Cloudflare» (o gpt-oss-20b)
  debajo de la respuesta. **«Escogió…» se quitó por decisión del dueño:**
  describe un proceso interno y parece que contestan dos modelos. Qué modelo
  hace cada paso queda en `docs/arquitectura.md`.
- El arreglo de `7b03495`.

Lo que se quitó: `ia/servicios.js`; las filas `FILA_ESCOGER` y
`FILA_REDACTAR`; las llamadas a Groq, OpenRouter, Mistral y Google y los
nombres de sus llaves; los saltos entre servicios y sus eventos de registro
`consulta` y `salto` (el registro vuelve a anotar solo `pregunta` y los
errores); las pruebas de todo eso; «La puerta» en `ia/README.md`,
`docs/arquitectura.md` y `CLAUDE.md`. Ningún archivo de código nombra ya a
esos servicios. El código sigue en el historial: `git show ff43e32` y los
dos cambios siguientes.

Lo que cambia para después:

- Cupo: el de Cloudflare solo, unas 40 a 45 preguntas al día entre todos.
- De las cuatro medidas aprobadas para después del aviso, la de quitar
  correos y teléfonos antes de mandar a Mistral o Google ya no aplica.
  Siguen: las estrellas de GitHub calculadas al publicar; cuánto guarda
  Formspree (lo fija el dueño); AI Gateway con el registro de contenido
  apagado (por revisar si hace falta con un solo servicio).
- **El aviso de privacidad no se da por resuelto.** Antes de rehacerlo, una
  revisión aparte de todo lo que interviene, sin dar nada por hecho: el
  asistente (Cloudflare Workers AI), el contador de visitas (Cloudflare Web
  Analytics), Formspree, GitHub Pages, la consulta a la API de GitHub por
  las estrellas (la hace el navegador del visitante) y lo que se guarda en
  el navegador (la conversación, el contador de preguntas, el número del
  día, el tema, el acomodo del mapa, los envíos de observaciones y la copia
  para usar el sitio sin conexión).

### Una pregunta mandada antes de tiempo se perdía (8 de octubre de 2026)

La publicación de `1c255d6` falló en GitHub por una prueba del asistente
que había pasado en la rama con el mismo código. No era una falla al azar:
`chat.js` se baja al abrir la burbuja, y si la pregunta se mandaba antes de
que llegara, Enter dejaba un renglón de más y el botón de enviar recargaba la
página. A alguien con señal lenta le pasaba lo mismo. Se reprodujo haciendo
llegar `chat.js` 3 segundos tarde. Ahora `burbuja.js` atiende el envío
mientras baja: deja la pregunta en el campo y la manda sola en cuanto el chat
está listo. Prueba nueva con `chat.js` tarde, con Enter y con el botón: falla
con el código de antes y pasa con el arreglo.

### La auditoría del asistente (8 de octubre de 2026)

El dueño trajo una auditoría técnica del asistente, hecha en modo de solo
lectura sobre `186595d` (el regreso a solo Cloudflare). Llegó como PDF; no
está en el repositorio. Confirma la arquitectura tal como la describen
`docs/arquitectura.md` e `ia/README.md`, y encuentra, entre otras cosas:

- el tope de 10 preguntas existe solo en el navegador; el Worker solo tiene el
  de 15 consultas por minuto por conexión y la cuota diaria de Cloudflare;
- el Worker acepta los índices, los fragmentos y la conversación que le manda
  la página sin comprobar que sean de la norma;
- el evento `pregunta` se anota al terminar el paso 1, no al contestar, así
  que cuenta de más;
- una cita a un inciso que no existe se enlaza a la sección de arriba y parece
  respaldada;
- el bloque «Privacidad y cupo» de `/asistente` tenía afirmaciones falsas o
  demasiado absolutas y le faltaba mucho (su sección 12).

**Orden que fijó el dueño, un paso a la vez y con su aprobación en cada uno:**
(1) quitar de «Privacidad y cupo» lo que la auditoría marca como incorrecto;
(2) proponerle, sin tocar nada, las decisiones que cambian qué datos se
tratan (el número del día en el registro, la conversación que va a los pasos
1 y 2); (3) un aviso de privacidad provisional en página propia, solo con lo
verificado; (4) la regla en `CLAUDE.md` de que ningún modelo ni proveedor
nuevo recibe preguntas sin el aviso publicado. Después, el plan de la sección
18 de la auditoría, también uno por uno.

**Paso 0: el Worker publicado es el del repositorio.** El dueño lo revisó en
el panel de Cloudflare el 8 de octubre, con capturas y una exportación del
registro (68 eventos, del 7 y el 8):

| Punto | Resultado |
|---|---|
| Versión activa | La de `186595d` («regreso a solo Cloudflare»), desde `main` |
| Conexiones | Solo `AI` (Workers AI) y `TOPE_IP` (Rate limiter, 1001) |
| Variables | `MODELO`, `MODELO_REDACTAR` y `ORIGENES`, con los valores de `ia/wrangler.jsonc` |
| Secretos | Ninguno: no quedó ninguna llave de la puerta |
| Observability | Logs encendido; *invocation logs*, Traces e Issues apagados |
| AI Gateway y Logpush | Ninguno |
| Campos de un evento | Los que escribe el código más los de la plataforma: nombre y versión del Worker, método y URL del propio Worker, identificadores internos de la petición, cuenta, hora y tamaño. **Sin IP, país, navegador ni texto de la pregunta** |
| Cuántos días guarda | El panel no lo dice, y los eventos más viejos son del 7, el día en que se conectó. Se puede comprobar el 11 de octubre; mientras, el aviso no da plazo |

De paso salieron tres cosas:

- **Workers Builds publica el Worker con cualquier cambio que llega a `main`**,
  no solo con los de `ia/` como decía arriba: en el historial de versiones
  están «Pie del sitio…» y «Pruebas: el asistente de mentiras…». No hace
  daño (publica el mismo `ia/`); se corrige en el paso de documentación.
- **El conteo inflado (B1) se confirma en producción:** cada evento
  `pregunta` es de la misma petición que la consulta `articulos`.
- **Nadie preguntó mientras estuvo publicada la puerta:** la última pregunta
  registrada es de las 15:11 UTC, antes de `ff43e32`. La versión actual
  todavía no había recibido ninguna.

**Paso 2: decisiones del dueño (8 de octubre de 2026).**

- **El número del día se cambia por un número de orden, antes del aviso.**
  La pregunta llevará solo «es la n.ª de hoy (UTC) en este navegador»,
  sacado del contador de preguntas que ya existe (`asis-usadas`), en lugar
  del número al azar de `asis-navegador`, que se borra de los navegadores.
  Contar las de orden 1 da cuántos navegadores preguntaron, y el reparto
  dice si alguien gasta mucho, sin un dato que junte los eventos de un
  navegador. Se descartaron dejarlo (es un identificador, y si es dato
  personal lo dice un abogado) y quitarlo (se pierde cuántas personas usan
  el asistente).
- **A quien escoge (pasos 1 y 2) le llegan las preguntas anteriores y las
  secciones que se leyeron, sin el texto de las respuestas**; a quien redacta,
  la conversación completa como hoy. Se manda menos y se gasta menos cupo, y
  quien escoge conserva la sección exacta que encontró la respuesta anterior.
  Se descartaron dejarlo (hasta 2 800 caracteres de respuestas de más, dos
  veces) y mandar solo las preguntas (se pierde la sección cuando la pregunta
  anterior era vaga). No cambia lo que dirá el aviso: todo va a Cloudflare.
- **La línea base de consumo** con lo que ya anota el registro (tokens por
  paso) se hace en su turno del plan de la sección 18.
- **Cuándo:** el número de orden, antes del aviso; lo de quien escoge,
  después, con la batería de preguntas de prueba, para medir que la
  selección en las preguntas de seguimiento no empeore.

**El número de orden, hecho (8 de octubre de 2026).** La primera consulta de
cada pregunta lleva `orden` (cuántas lleva ese navegador en el día UTC,
contando esa) en lugar de `navegador`, y el Worker anota
`{"evento":"pregunta","orden":3}`:

- **Página** (`chat.js`): `orden()` cuenta las marcas de `asis-usadas` desde
  las 00:00 UTC, así que no guarda nada nuevo. Al cargar, borra
  `asis-navegador` de quien lo tenga.
- **Worker** (`nucleo.js`): acepta `orden` solo en el paso 1 y solo si es un
  entero de 1 a 99 (`ORDEN_MAX`); si no, lo ignora y contesta igual. Ya no lee
  `navegador`: lo que mande una página vieja se descarta sin anotarse.
- **Se publican en cualquier orden:** cada lado ignora el campo que no
  conoce, así que página vieja con Worker nuevo, o al revés, siguen
  funcionando; en la transición, unos eventos salen sin `orden`.
- **Pruebas:** en `ia/pruebas/agente.mjs`, que anota el orden, que ignora uno
  inventado (0, 100, 2.5, «3», un script) y el número viejo, y que el paso 2
  no cuenta otra vez; falla con el `nucleo.js` de antes. En
  `site/pruebas/navegador.mjs`, que la primera pregunta lleva 1 y la segunda
  2 (salvo que el día UTC cambie a media prueba), que ningún otro paso lo
  lleva, que no viaja `navegador` y que el número viejo se borra.
- `ia/README.md` y `docs/arquitectura.md` lo dicen.

Sigue igual: el evento se anota al terminar el paso 1 (B1, en su turno), y
«el registro gratis guarda 3 días» de `ia/README.md` sigue sin comprobar. En
producción no cambia nada hasta que llegue a `main`; el aviso del paso 3 se
publica con este cambio o después, nunca antes.

**Paso 3: el aviso de privacidad provisional, hecho (8 de octubre de 2026).**
Página propia, `/privacidad` (`site/src/pages/privacidad.astro`), versión
0.1 con fecha. Dice solo lo comprobado en el código y en el paso 0: qué se
manda al visitar (GitHub Pages, la API de GitHub por las estrellas, Web
Analytics), al preguntar (la pregunta, las dos preguntas y respuestas
anteriores, índices y partes de la norma, el número de orden; la IP solo para
el tope por minuto, sin anotarse; qué anota el registro y qué no), al mandar
una observación (Formspree, qué campos, «Repórtalo») y qué se guarda en el
navegador. Nombra a Cloudflare, GitHub y Formspree con enlace a sus políticas,
revisadas el mismo día (Cloudflare, vigente desde el 4 de noviembre de 2025;
GitHub, desde el 27 de abril de 2026; Formspree, del 24 de abril de 2022). Pide
no escribir datos personales y da el correo de contacto,
`nom001sede2012.contacto@gmail.com`, creado para el proyecto.

- **Responsable:** «el autor de la guía (dflores296 en GitHub)», persona
  física, proyecto personal sin fines de lucro. **El domicilio no se publica**
  por seguridad personal, decisión del dueño: el aviso dice que podrá
  proporcionarse a la autoridad competente. No se inventa ni se toma una
  dirección de terceros, y el texto no presenta el correo como sustituto
  del domicilio; si eso basta lo dice el abogado.
- **Lo que no dice, a propósito:** plazos de conservación, si Cloudflare
  entrena o no, edad mínima, derechos ARCO, dónde se procesan los datos.
  Nada de eso está comprobado, y lo legal es del aviso completo.
- **Formspree:** el dueño cambió el destino de las observaciones al correo de
  contacto. El aviso dice «por correo al responsable», sin nombrar la bandeja.
- **Las demás páginas solo enlazan:** el pie de todas («Aviso de
  privacidad», y la frase del contador de visitas sin «que no usa cookies ni
  guarda datos personales»); «Privacidad y cupo» en `/asistente` («se guarda
  en tu navegador» en lugar de «se queda», «de OpenAI» en lugar de «de código
  abierto», «No escribas datos personales» y el enlace); el pie de la burbuja
  («No escribas datos personales», «Cómo preguntar · Privacidad»), y la nota
  del formulario de `/observaciones`.
- **El aviso iba en el campo de la burbuja** («Escribe tu pregunta (sin datos
  personales)…»), pero no cabe: el campo deja 220 px útiles en un teléfono de
  320 y la frase mide 334. Se movió al renglón de abajo, que siempre está a la
  vista.
- **La excepción, en `CLAUDE.md`:** el aviso es la única página que dice qué
  datos se tratan; las demás solo enlazan.
- La huella se volvió a sellar: cambiaron las 164 páginas (el pie y la
  burbuja están en todas) y hay una nueva; ningún archivo de datos.

**Versión 0.2 del aviso, y hasta dónde llega (8 de octubre de 2026).** A
pedido del dueño se revisó el aviso contra la ley vigente (LFPDPPP, nueva ley
del DOF del 20 de marzo de 2025; su art. 15 dice qué debe contener un aviso).
Salieron huecos: el domicilio, el procedimiento para los derechos ARCO, las
finalidades separadas por consentimiento, entre otros. **Decisión del dueño:
el mínimo proporcional**, porque lo que la guía trata de verdad es poco (del
asistente no guarda nada que identifique a nadie; lo único personal son las
observaciones y el correo opcional). En la 0.2 solo se agregó:

- que el correo de contacto es Gmail, así que las observaciones quedan en
  Google, con enlace a su política (en español, vigente desde el 1 de octubre
  de 2026);
- «Tus datos»: quien mandó una observación puede pedir verla, corregirla,
  borrarla u oponerse a su uso, por correo, gratis, con respuesta en un máximo
  de 20 días (el plazo de la ley, art. 31).

**No se hace, a propósito:** separar finalidades por tipo de consentimiento,
un mecanismo para no ser contado en las visitas, avisos cortos junto a cada
formulario, el análisis de encargados y transferencias, lo de menores. Mucho
trabajo para casi ningún dato. **El domicilio sigue sin publicarse**: el
dueño acepta ese hueco; si algún día se cobra por algo o alguien se queja, ahí
entra un abogado. No volver a inflar el aviso sin que él lo pida.

**Versión 0.3 del aviso (8 de octubre de 2026), aprobada por el dueño en
estructura y contenido.** Correcciones puntuales sobre la 0.2, sin
reestructurar:

- **Responsable con nombre:** David Alberto Flores, decisión del dueño.
- **El domicilio ya no se menciona en la página.** El párrafo «por razones de
  seguridad personal, el domicilio no se publica…» subrayaba el hueco sin
  resolverlo. La decisión queda aquí: el domicilio particular no se publica;
  el hueco formal (art. 15, fr. I) sigue y el dueño lo acepta.
- **El número de orden** ya no se presenta como medida de «cuánta gente»:
  mide preguntas por navegador, no personas. Se dice que no llega a los
  modelos y que solo se anota en el registro (el cupo de 10 lo aplica el
  navegador con sus propias marcas, no ese número).
- **Lo que declara Cloudflare** en la página «Data usage» de Workers AI
  (actualizada el 21 de abril de 2026): no usa el contenido para entrenar
  los modelos ni para mejorar servicios propios o de terceros sin
  consentimiento explícito, y solo lo guarda si se conecta un almacenamiento
  (R2, KV, DO, Vectorize). El dueño no ha dado ese consentimiento, y el
  paso 0 confirmó que no hay almacenamiento conectado.
- **Formspree conserva el envío en su panel**: en el plan gratuito, 30 días
  de historial (su página de límites y la de planes). Más la copia en Gmail.
- **GitHub Pages** registra y almacena la IP de los visitantes por
  seguridad (su documentación, «Data collection»).
- **«Tus datos»:** 20 días hábiles para la determinación y 15 más para
  hacerla efectiva (arts. 31 y 2, fr. VIII: «Días: Días hábiles»); sin la
  frase absoluta «no guarda nada que se pueda entregar».
- La pregunta y la conversación anterior van en cada consulta (comprobado
  en `chat.js`); se dice «en cada una» y no «en las tres» porque, si el
  modelo no pide nada en el paso 1, son dos.
- El uso del correo de la observación: atenderla, pedir aclaraciones,
  comunicar el resultado o responder una solicitud sobre esos datos.

**Publicado el 8 de octubre de 2026:** `main` se adelantó a la rama de
trabajo (`7a98f75`): el aviso 0.3 y el número de orden salieron juntos. La
publicación de GitHub terminó bien y `/privacidad` se comprobó en el sitio
publicado. Desde que el dueño dio acceso completo a la red del entorno,
`dflores296.github.io` sí se abre desde aquí (ver «Trampas del entorno»).

**Paso 4: la regla y el candado, hechos (8 de octubre de 2026).** En
`CLAUDE.md`, con el texto que aprobó el dueño: ningún modelo ni proveedor
nuevo recibe preguntas sin el aviso actualizado y publicado; incluye un
respaldo, una prueba con visitantes reales, un cambio de `MODELO` o
`MODELO_REDACTAR` y una conexión nueva del sitio que mande datos del
visitante. Y el candado que él aprobó, `site/pruebas/aviso.mjs` (corre con
las demás pruebas del sitio, en `verificar.sh` y al publicar), que compara el
aviso compilado contra:

- los modelos `@cf/<org>/<modelo>` de `ia/wrangler.jsonc` e `ia/nucleo.js`:
  el aviso nombra cada modelo y su dueño;
- `ia/wrangler.jsonc`: solo las llaves conocidas (una conexión nueva del
  Worker, como KV o R2, sería una llave nueva), *invocation logs* apagados y
  sin trazas;
- el código del Worker: sin direcciones fuera de los comentarios (una
  llamada a otro servicio) y sin AI Gateway;
- la CSP de la portada: cada dirección con el servicio que el aviso nombra
  (`SERVICIOS`); una que no esté en la lista es una conexión nueva;
- que la portada, `/asistente` y `/observaciones` enlacen el aviso.

Se probó rompiendo cada cosa a propósito: otro modelo, un KV, los registros
por petición encendidos, una llamada a `api.groq.com` y una dirección nueva
en la CSP; en los cinco casos falla con un mensaje que dice qué y dónde.

**Paso 5: la métrica de preguntas (B1), hecho (8 de octubre de 2026).** El
dueño aprobó la opción B con precisiones, y la opción A para `pregunta`:

- **`pregunta` se queda donde estaba** (al contestar el primer paso, como el
  contador de la página), para no cambiar la métrica ni perder la
  comparación con los conteos de antes. Un primer paso que falla no se anota.
- **Evento nuevo, `respuesta_generada`:** `{"evento":"respuesta_generada",
  "modelo":"gpt-oss-120b"}` (o el 20b si redactó el respaldo), sin contenido
  ni identificadores adicionales incorporados por la aplicación. Se anota
  solo en la petición de redactar, cuando el redactor principal o su
  respaldo terminó, la respuesta tiene texto y el Worker ya armó lo que
  devuelve. El nombre lo escogió el dueño: el Worker sabe que la generó, no
  que el navegador la mostró.
- **Lo que el Worker no puede saber:** si la selección de los pasos 1 y 2
  terminó bien. Las tres peticiones de una pregunta no se unen (a propósito
  no hay identificador), y si el modelo no escoge nada la página busca por su
  cuenta. Lo que sí comprueba es que la petición de redactar traiga partes
  de la norma válidas.
- **`anotar()`** escribe los dos eventos dentro de un `try`: si el registro
  falla, la respuesta se entrega igual.
- **Siete pruebas** en `ia/pruebas/agente.mjs`, al final y una tras otra
  (las demás escriben en el registro al mismo tiempo): respuesta del 120b
  (un solo evento, sin la pregunta, la conversación ni las partes de la
  norma en el registro), falla del 120b y respaldo del 20b, falla de los dos,
  falla al escoger, respuesta vacía o sin texto, sin duplicados (paso 1 →
  un `pregunta`; paso 2 → nada; paso 3 → un `respuesta_generada`; con
  respaldo, uno) y registro caído. Se probaron contra cuatro versiones rotas
  a propósito (sin el evento, sin la protección, el respaldo anotando de más,
  anotar antes de saber si hay texto): en todas falla al menos una.
- `ia/README.md` («Cuánta gente lo usa») explica cómo leer los dos conteos
  juntos y qué no demuestran.
- No cambian el tope de 10, el contador del navegador, el tope por minuto,
  el flujo entre modelos ni el aviso. El candado del paso 4 no se dispara:
  no hay modelo ni servicio nuevo.

**Paso 4 de la auditoría: batería de evaluación y línea base (8 de octubre
de 2026).** 24 preguntas que aprobó el dueño, en `site/bateria/preguntas.json`,
cada una con lo que debe citar, decir y no decir, sacado de la captura de la
norma; varias prueban valores donde la NOM y el NEC difieren (80 cm, 1.85 m,
127 V) o casos que ya fallaron. `site/bateria/correr.mjs` las hace al
asistente real en el sitio publicado, como un visitante (Chromium por el
proxy del entorno, sin desactivar ninguna verificación), con 15 s entre una y
otra por el tope por minuto, y califica solo; `--recalificar` vuelve a
calificar una corrida guardada sin gastar cupo. No va en `verificar.sh`: gasta
el cupo de todos (unas 230 neuronas por pregunta).

Primera corrida, 22:18 a 22:25 UTC (más una prueba con una pregunta a las
22:17): **16 de 24 correctas (67 %)**, citas exactas 14 de 22 más 2 a la
sección de arriba, valores 16 de 22, ningún valor prohibido, ninguna sin
respuesta, el 120b redactó las 24, mediana de 9.3 s. **Casi todas las fallas
son de selección:** con la parte esperada leída acertó 12 de 13; sin ella, 3
de 9. Detalle y lectura en `site/bateria/resultados/2026-10-08T2218Z.md`.

Ajustes a la calificación tras revisar a mano (versión 2 de las preguntas):
la 15 decía «80 centímetros» y solo se reconocía «80 cm»; la 21 citó la Tabla
4, que trae la misma columna del 40 % que la Tabla 1; una cita a la sección de
arriba (680-22 por 680-22(a)(2)) cuenta aparte, como imprecisa. Dos detalles
del programa salieron en la prueba de una pregunta: «120b» contiene «20b», y
el modelo escribe guiones no separables (‑).

Falta para cerrar la línea base: las neuronas por pregunta (el panel de
Workers AI antes y después, o el registro de esa hora exportado).

**Reporte del dueño: los lugares Clase I, II y III.** A «¿Qué es un área
clase 1 2 y 3?» el asistente leyó 513 a 516 (gasolineras, almacenamiento,
pintura) y dijo que no encontraba las Clases 2 y 3. Al aclarar «Lugares Clase
II y Clase III» leyó el 500-5, que sí es, y contestó que solo se describe la
Clase I. **Causa: el corte por parte.** El 500-5 completo mide unos 11 900
caracteres y la página manda 8 000 por parte (`LECTURA.porParte` en
`lectura.js`, con `recortarLineas`): la Clase I empieza en el 1 139, la II en
el 7 867 (en el borde) y la III en el 10 346 (fuera). Si el modelo hubiera
pedido los incisos (500-5(c), 500-5(d)), `subarbol` los habría mandado
completos. Es la deficiencia D4 de la auditoría («el techo puede cortar
contexto»), y entra en sus pasos 7 y 8. De paso, el modelo le pidió «los
fragmentos que compartiste»: habla como si el usuario le hubiera mandado el
texto. Quedaron como preguntas 25 (con las palabras del dueño) y 26 (con las
de la norma) de la batería, versión 3.

**Ajuste posterior de redacción del aviso** (decisión del dueño: no es un
cambio material del tratamiento y no bloquea este paso): agregar en «Lo que
anota el asistente» que el registro indica si la respuesta terminó
correctamente. Se hace con la siguiente versión del aviso.

**Retoques al aviso 0.3, sin cambiar versión (8 de octubre de 2026).** A
pedido del dueño: «Ing. David Alberto Flores» como responsable; «Antes que
nada: no escribas datos personales» pasó a «Importante: no incluyas datos
personales» (sonaba coloquial). El ajuste del punto 8 (que el registro indica
si la respuesta terminó) sigue pendiente: el dueño no quiso subir la versión
por esto.

**Trampa de Astro: se come el espacio antes de un enlace en otro renglón.**
Si en una plantilla una palabra o un `</b>` termina un renglón y el `<a>` o
el `<b>` empieza el siguiente, el sitio publica las dos cosas pegadas: salía
«privacidad:nom001sede2012…», «Cloudflaredeclaraque», «en elaviso de
privacidad» (`/asistente`) y «reportarlo enel repositorio» (`/observaciones`,
de antes). Se arregló con `{' '}` al final del renglón, como ya hacía el pie
de la burbuja. Al escribir texto con enlaces, ponerlo así o en el mismo
renglón. Los menús de arriba y del pie también quedan pegados en el HTML,
pero cada enlace es un elemento aparte y en pantalla se ven bien.

**Paso 2 de la auditoría: documentación al día (B3), hecho (8 de octubre de
2026).** Se corrigieron los textos internos que contradecían el código o el
aviso:

- `ia/README.md`: «Privacidad» decía que el Worker no guarda nada y que la
  página lo dice «debajo del campo»; ahora remite al aviso y dice qué anota
  el registro. La tabla «Qué hacer si…» citaba «No me pude conectar con el
  asistente», que ya no existe: ahora trae los mensajes de hoy («Tu pregunta
  no llegó…», «tardó demasiado…»). «Cada cambio en `ia/` se publica solo»:
  se publica con cualquier cambio en `main`. «El registro gratis guarda 3
  días»: sin comprobar, y así se dice.
- `ia/nucleo.js`: la lista de configuración no traía `MODELO_REDACTAR` ni
  `TOPE_IP`, y ahora recuerda que cambiar de modelo pasa antes por el aviso.
- `ia/wrangler.jsonc`: el comentario de Observability hablaba del número al
  azar.
- `site/src/scripts/preguntar/pasajes.js`: «unas 130 preguntas al día» era la
  estimación inicial; medido, 40 a 45.
- `docs/arquitectura.md` y `site/src/lib/analitica.js`: «sin cookies ni datos
  personales» de Web Analytics, una afirmación sobre un tercero, pasa a
  «según Cloudflare, sin cookies», con la política en el aviso. Formspree
  guarda el envío 30 días en su panel y reenvía a la cuenta de Gmail.
- `CONTEXTO.md`: las partes viejas que ya no valen (lo que guarda el
  registro, el tope de 20, «la guía lo dice», las 130 preguntas, «cada
  cambio en `ia/`») llevan una nota en cursiva de qué cambió y dónde. Es
  bitácora: se anota, no se reescribe.

**Paso 1, hecho.** Se quitaron tres afirmaciones, sin agregar texto:

- «No se guardan»: el Worker sí escribe en Observability (el número del día,
  la hora, la duración y los tokens; nunca la pregunta), y «Repórtalo» manda
  la pregunta a Formspree.
- «ni se usan para entrenar modelos»: depende de las condiciones de Workers
  AI y no se puede comprobar desde el código. Vuelve solo si se verifica.
- «y se borra al cerrar la pestaña»: la conversación vive en
  `sessionStorage`, que depende del navegador, y el contador de preguntas y el
  número del día están en `localStorage`, que no se borra al cerrar.

La huella del sitio se volvió a sellar; solo cambió `asistente/index.html`.

Quedó fuera, a propósito, para el aviso del paso 3: «La conversación se queda
en tu navegador» (es cierto, pero las dos preguntas y respuestas anteriores
también viajan a Cloudflare con cada consulta); «de código abierto» (la
auditoría sugiere «pesos abiertos», tras verificarlo); y el pie del sitio,
que dice que Web Analytics «no usa cookies ni guarda datos personales», una
afirmación sobre un tercero. Para el paso de documentación (B3): `ia/README.md`
sigue diciendo «El Worker no guarda nada». *(Todo esto se resolvió después:
aviso 0.3 y paso 2 de la auditoría.)*

## Alternativas futuras no implementadas

**Nada de esta sección está en el código.** Son servicios que se analizaron
para sumar cupo al asistente y quedaron fuera. El código que sabía hablar con
ellos está en el historial (`ff43e32`, la puerta; `1c255d6` y `cc80f8e`).
Antes de retomar cualquiera: primero sus términos y condiciones, después la
arquitectura; que pase la batería de preguntas de prueba (14 AWG → 15 A en
240-4(d)(3), la errata de la Tabla 430-250, la falla a tierra en 210-8); y que
el aviso de privacidad lo diga.

### Mistral y Google: fuera hasta tener asesoría legal

Al revisar el aviso de privacidad salió que las condiciones de la API de
Gemini piden usuarios mayores de 18 años y prohíben usarla en un sitio
«dirigido a, o que probablemente abran» menores. El dueño dice, con razón,
que la guía está hecha para estudiantes de ingeniería en adelante; si eso
basta frente a esa cláusula lo tiene que decir un abogado (la app Gemini de
los teléfonos Android tiene otras condiciones, las de consumidor; las que
cuentan aquí son las de la API para desarrolladores). Mistral, en su plan
gratis, puede entrenar con las preguntas.

**Decisión del dueño (8 de octubre de 2026): fuera hasta que tenga asesoría
legal.**

### OpenRouter: pendiente de evaluación

Lo que se descartó es su **router gratis y las rutas con proveedor variable**:
los modelos `:free` que estuvieron en las filas (`openai/gpt-oss-20b:free` y
`deepseek/deepseek-chat-v3.1:free`), en los que OpenRouter escoge qué empresa
corre el modelo. Esas rutas, según guías de terceros (su documentación no se
pudo abrir desde aquí), suelen ir a empresas que guardan o entrenan con las
preguntas.

**No es incompatible para siempre.** Se podría evaluar una integración con:

- modelo y proveedor final fijos (la consulta va siempre a la misma empresa);
- registro de preguntas apagado (§6.2) y guardado privado apagado (§6.3 a);
- proveedores que entrenan, excluidos;
- sin respaldo hacia rutas no aprobadas: si el proveedor fijo no contesta, la
  consulta no se va a otro.

Pediría código nuevo: la puerta no fijaba el proveedor. Mientras no se
decida, no se crea la llave ni se usa openrouter/free.

Lo que dicen sus condiciones y su aviso de privacidad (el dueño los copió;
ambos del 31 de agosto de 2026), para el abogado:

- **Edad: interpretación pendiente.** §2 pide 18 años para usar el servicio.
  No trae la cláusula expresa de Google sobre sitios que probablemente abran
  menores, pero hace al titular de la cuenta responsable de que sus clientes
  cumplan el contrato y las condiciones de cada proveedor (§5.1, §5.2, §5.5).
  Si eso alcanza a los visitantes de la guía lo dice el abogado.
- **Quién corre el modelo.** OpenRouter es intermediario. La lista de unas
  90 empresas al final de sus condiciones es su catálogo general, no a
  dónde va cada consulta: el proveedor real depende del modelo, del router,
  de las restricciones de la cuenta y del respaldo que se permita. Cada
  proveedor tiene sus condiciones y algunos guardan o entrenan; revisarlas
  le toca al titular (§5.6). OpenRouter mismo no entrena con las preguntas
  (aviso de privacidad).
- Aun sin registro, una IA suya clasifica cada pregunta por tema para sus
  estadísticas públicas, sin guardarla ni ligarla a la cuenta (§6.5).
- Con el registro de preguntas encendido, OpenRouter tiene licencia perpetua
  para guardarlas y venderlas anónimas (§6.2).
- El titular garantiza tener permiso sobre lo que se manda (§6.6) y paga si
  alguien demanda a OpenRouter por su uso (§15).
- **Uso adversarial.** Intentar engañar o romper un modelo (*red teaming*,
  §7.11) está prohibido sin permiso escrito; sus sistemas y los de los
  proveedores lo vigilan, y detectarlo puede llevar a suspender la cuenta
  (§8, §5.5). El titular responde por todo lo que pase con su llave (§3.2).
  Una caja de preguntas abierta al público sube ese riesgo: cualquiera
  escribe lo que quiera, y sale con la llave del titular.
- El contrato de tratamiento de datos (§10.2) es solo para empresas o uso
  comercial. Disputas: Nueva York, por arbitraje (§18, §19).
- §4.1 dice que para usar la API hay que comprar créditos (mínimo 5
  dólares), lo que choca con «sin tarjeta». Confirmarlo si se evalúa.
- Lo que el Worker de la puerta le habría mandado (nunca tuvo su llave):
  solo la clave y la consulta; ni la IP del visitante, ni su número del día,
  ni el nombre del sitio (sin `HTTP-Referer` ni `X-Title`).

### Groq

No entrena con lo que le llega por la API; *Zero Data Retention* hay que
encenderlo. Según un sitio de terceros que sigue cambios de condiciones, su
página pide 18 años para usar el sitio web; no se encontró una regla de edad
para la API. Confirmar en su contrato. Procesaría la pregunta fuera de
México (confirmar dónde).

## Ronda de seguridad (octubre de 2026)

Bitácora de lo que se hizo, por qué, y de las dependencias que a propósito
NO se actualizan solas. Si dentro de un tiempo hay que revisar si una de esas
decisiones sigue valiendo, la respuesta empieza aquí. El detalle técnico de
la CSP y del formulario está en «Seguridad» de `docs/arquitectura.md`.

### Lo que se hizo

| Qué | Dónde | Contra qué |
|---|---|---|
| Content-Security-Policy en cada página | `site/astro.config.mjs` | Que corra JavaScript ajeno: un script metido en un texto, una URL o un `onerror=` |
| Formulario de observaciones blindado | `site/src/scripts/observaciones/limpieza.js` | Correos maliciosos disfrazados de sugerencia, y enlaces armados para cambiar el asunto o el origen |
| Acciones de GitHub fijadas por SHA | `.github/workflows/deploy.yml` | Que alguien mueva una etiqueta (`@v4`) a código malicioso; el workflow puede publicar el sitio |
| Dependabot mensual | `.github/dependabot.yml` | Quedarse con versiones viejas o con vulnerabilidades sin enterarse |
| La huella ignora la `<meta>` de la CSP | `tools/huella_sitio.py` | Falsas alarmas: la CSP va hecha de hashes de código, no de contenido |

Pruebas que lo cuidan: `site/pruebas/observaciones.mjs` (la limpieza, y que
los más de 3 000 «Reportar» del sitio pasen el filtro) y tres en
`site/pruebas/navegador.mjs` (un script inyectado no corre, un enlace armado no
llena el formulario, lo que llega a Formspree va limpio). Cualquier cosa que la
CSP bloquee de más sale como error de consola y tumba las pruebas en navegador.

### Reglas que deja

- **Un `<script is:inline>` o con `define:vars` queda bloqueado por la CSP**:
  Astro no les calcula hash. Los datos se pasan por un atributo `data-`, como
  hace la 404. El único en línea que corre es el del tema, en `Base.astro`,
  porque está antes de la `<meta>` de la CSP.
- **Las librerías del mapa crean su propio `<style>`.** Su hash lo calcula
  `hashesDeEstilos()` en `astro.config.mjs`, leyéndolo de cada librería. Si una
  versión nueva lo cambia de forma, la compilación se detiene con un mensaje que
  dice cuál.
- **Una conexión nueva del sitio** (otra API, otra fuente, un CAPTCHA) hay que
  darla de alta en `connect-src` o en la directiva que toque. Si no, la CSP la
  bloquea y las pruebas lo dicen.

### Dependencias que no se actualizan solas

| Dependencia | Cómo queda | Por qué | Cuándo revisarlo |
|---|---|---|---|
| **pymupdf** (`requirements.txt`) | Fijada en `1.28.2`; Dependabot la ignora (`ignore` en `dependabot.yml`) | Es la que lee el PDF. De su versión dependen la sangría de cada renglón (47.0 vs 32.8, §2), las coordenadas de las tablas y los bytes de cada figura, y todo eso está sellado con huella. Hasta un parche puede mover la extracción. Sus avisos de seguridad pesan poco: solo lee un PDF propio y fijo, dentro de CI | Cuando `pip install` deje de encontrar una versión para el Python del CI, o si llega una alerta grave. Se sube a mano: cambiar la versión, `bash tools/verificar.sh`, revisar el diff, volver a sellar (`build_tables.py --sellar`, `huella_sitio.py --escribir`) |
| **three** (`site/package.json`) | Versión exacta, sin `^`; sube siempre junto con `3d-force-graph` (grupo `mapa-3d`) | Tiene que ser la misma que usa `3d-force-graph`: se volvió dependencia directa para la niebla del mapa, y con dos copias de three.js la niebla y los objetos del mapa vendrían de librerías distintas. `npm ls three` debe mostrar una sola versión | Cuando Dependabot abra el PR del grupo `mapa-3d`. Si la prueba del mapa sale en rojo, no se fusiona |
| **playwright** (`site/package.json`) | Versión exacta `1.56.1`; Dependabot la ignora | Es la versión cuyo Chromium trae preinstalado el entorno de Claude Code en la nube (`/opt/pw-browsers/chromium-1194`). Con otra, CI sigue pasando porque descarga su propio navegador, pero las sesiones de Claude ya no pueden correr `verificar.sh` completo: se probó la 1.63 y no arranca (busca `chromium-1243`) | Cuando el entorno traiga otro Chromium: `ls /opt/pw-browsers`. Subirla a la versión que le corresponda a ese número y correr `verificar.sh` en una sesión de Claude |
| **ruff, pytest** (`requirements-dev.txt`) | Fijadas, pero Dependabot SÍ las propone | Se fijaron para que la verificación de hoy sea la de mañana. Subirlas es seguro: lo peor es que un `ruff` nuevo marque algo y el PR salga en rojo | En cada PR de Dependabot |
| **Acciones de GitHub** | Fijadas por SHA, con la versión en comentario; Dependabot las propone todas juntas en un PR (grupo `acciones`) | Las cinco son de GitHub (`actions/…`) y el workflow no usa secretos, pero tiene permiso de publicar el sitio | En cada PR de Dependabot (prefijo `CI`). **Su verde no prueba `upload-pages-artifact` ni `deploy-pages`**, que solo corren al publicar desde `main`: al fusionar, mirar que esa publicación salga bien. `upload-pages-artifact` usa por dentro otras acciones; eso no se puede fijar desde aquí |

### La primera pasada de Dependabot (6 de octubre)

Al llegar `dependabot.yml` a `main` abrió seis PRs. Ninguno se fusionó tal
cual:

- **Las cinco acciones** (checkout 7.0.1, setup-python 7.0.0, setup-node
  7.0.0, upload-pages-artifact 5.0.0, deploy-pages 5.0.1) venían en cinco PRs
  sueltos. Se aplicaron juntas en un commit, porque `upload-pages-artifact` y
  `deploy-pages` son pareja y su verde en el PR no probaba nada (solo corren en
  `main`). Antes se revisó lo que podía afectar: desde la v4,
  `upload-pages-artifact` deja fuera los archivos que empiezan con punto, y
  `site/dist` no tiene ninguno; `path` y `page_url` siguen iguales. Desde
  entonces las acciones llegan en un solo PR (grupo `acciones`).
- **Astro 7.3.5 + Playwright 1.63** venían juntos. Astro sí; Playwright no
  arranca en el entorno de Claude (ver la tabla de arriba), así que se agregó
  al `ignore` y el PR se rehace solo con Astro.

### Revisión de tipos (mypy), por protocolo

`tools/verificar.sh` corre `python3 -m mypy tools/` en modo básico, con la
configuración en `mypy.ini`. Se agregó sabiendo que hoy no aporta mucho:
se corrió antes y **no encontró ningún error real**, porque las pruebas y la
huella ya los atrapan. Está para que un cambio futuro no meta uno. Al
activarlo:

- Los únicos 8 avisos estaban en `extract_index.py`, un script que vuelve a
  asignar sus variables con otro tipo. Se resolvieron con anotaciones, sin
  tocar lo que hace: `INDICE.txt` sale idéntico byte por byte.
- El modo estricto (`check_untyped_defs`) da 62 avisos y ninguno es un error.
  Se deja apagado; vale encenderlo solo como parte de un trabajo de fondo en el
  parser.
- **`astro check`** (lo mismo para el sitio) **no se agregó**: da 82 avisos,
  ninguno real. 54 son parámetros sin tipo y 25 vienen de que TypeScript se
  confunde con la forma del JSON de la norma. Dejarlo en cero exige describir
  esos datos con tipos: trabajo mediano, sin bug que justifique hacerlo.
- El hook de sesión (`.claude/hooks/session-start.sh`) ahora instala también
  `requirements-dev.txt`. Antes una sesión nueva no traía ruff ni pytest y
  `verificar.sh` fallaba hasta instalarlos a mano. Y usa `npm ci` en vez de
  `npm install`: la versión de npm del contenedor reescribía
  `package-lock.json` (le quitaba los campos `libc` que pone la de Dependabot)
  y cada sesión arrancaba con el árbol modificado.

### La historia se reescribió (6 de octubre)

Antes de compartir el repositorio, por decisión del dueño, los commits pasaron
a nombre de `dflores296` (con su correo «noreply» de GitHub) y se les quitaron
las líneas `Co-Authored-By: Claude…` y `Claude-Session: …` que el entorno de
Claude agregaba a cada uno. Las sesiones eran enlaces que solo el dueño podía
abrir. Se hizo con `git filter-repo` y un force push autorizado a `main`.

- **El contenido no cambió.** Se comparó el árbol de cada commit antes y
  después: idénticos, con el mismo título.
- **Se hizo sobre un clon superficial, y se perdió historia.** El clon de la
  nube trae solo los últimos commits (ver «Trampas del entorno»): la primera
  reescritura dejó en `main` 58 commits, del 3 de octubre en adelante, y los
  172 anteriores (del 11 de agosto al 3 de octubre) quedaron fuera. Se
  recuperaron de las referencias de los PRs cerrados, que GitHub conserva, y
  se injertaron debajo; ver «La historia completa, reconstruida».
- **Cambiaron todos los identificadores.** El único citado en el repositorio
  (`a6fd544`, las skills de diseño retiradas) pasó a ser `23ea227`, luego
  `043fb39` y, con la historia completa, `0b3100b`. El último `main` antes de
  reescribir era `9403c26`.
- **Los commits viejos no desaparecen de GitHub del todo:** los PRs cerrados
  (#4 a #11) los siguen mostrando. Borrarlos de ahí solo lo puede hacer el
  soporte de GitHub.
- **Los commits de Dependabot y las fusiones hechas desde GitHub** conservan su
  autor, pero pierden la marca «Verified»: la firma era de los commits
  originales.
- **Desde entonces**, ver «Commits» en `CLAUDE.md`.

### Tres vulnerabilidades de npm (6 de octubre)

Al reescribir la historia, GitHub avisó de 3 vulnerabilidades altas en
dependencias indirectas de Astro: `devalue` 5.9.0, `http-cache-semantics`
4.2.0 y `source-map-js` 1.2.1. Las tres corren solo al compilar y procesan
archivos propios, así que el riesgo para el sitio publicado era bajo. Se
subieron a 5.9.4, 4.3.0 y 1.2.2 sin tocar `package.json` (caben en los
rangos que ya declara Astro), y la huella confirmó el sitio idéntico.

Se editaron a mano las 9 líneas del lockfile, porque `npm audit fix` en el
contenedor de Claude también borra los campos `libc` (ver «Trampas del
entorno»). Los avisos de seguridad de Dependabot llegan como alertas, no como
PRs: «Dependabot security updates» sigue apagado.

### Licencia no comercial (6 de octubre)

Por decisión del dueño, antes de compartir el repositorio:

- **Sitio y el resto del código:** de MIT a **PolyForm Noncommercial 1.0.0**.
  El texto oficial va sin tocar en `LICENSE`; se tomó del repositorio de
  PolyForm Project y se comprobó idéntico.
- **`tools/`: AGPL-3.0-or-later**, no PolyForm. Las herramientas importan
  PyMuPDF, que es AGPL-3.0 (o licencia comercial de Artifex), y una licencia no
  comercial no es compatible con la AGPL. Al principio se pusieron bajo
  PolyForm con todo lo demás, y se corrigió al revisar la licencia de cada
  dependencia. La AGPL sí permite el uso comercial, pero obliga a publicar el
  código de cualquier versión que se distribuya o se ofrezca como servicio en
  red. Texto completo en `LICENSES/AGPL-3.0-or-later.txt`, tomado de SPDX.
- **Ojo para monetizar:** correr `tools/` dentro de un servicio de pago
  también obliga al dueño a cumplir la AGPL de PyMuPDF, o a comprar la licencia
  de Artifex. Un servicio que solo usa los datos ya extraídos (`data/`) no.
- **Datos (`data/`, `INDICE.txt`) y documentación:** de CC BY-SA 4.0 a
  **CC BY-NC-SA 4.0**.
- **El texto de la NOM** sigue sin derechos de autor (art. 14 LFDA): la
  restricción cubre solo lo que agrega el proyecto.
- **Consultar la guía es libre, también para trabajar.** Lo que pide permiso es
  el uso comercial del código o de los datos. Licencia comercial: contactar al
  autor. El dueño sí puede usarlo comercialmente (licencia dual).
- **No es retroactivo para quien ya copió:** del 11 de agosto al 6 de
  octubre el repositorio se publicó con MIT y CC BY-SA (GitHub Pages publica
  desde el 11 de agosto), y quien obtuvo una copia en esos días conserva lo
  que esas licencias le concedieron. `LICENSE` lo dice así. Se cambió con el
  repositorio casi sin difusión, que es cuando menos pesa eso.
- **La historia se reescribió otra vez** para que ningún commit muestre las
  licencias viejas: `LICENSE`, `LICENSES/` y las líneas de licencia del README
  quedaron en su versión final en cada commit. Se comprobó commit por
  commit que fuera de eso nada cambió (mismo título, autor y fecha) y que el
  último árbol es idéntico al de antes. Se hizo con `git filter-branch
  --tree-filter` y un force push autorizado; el último `main` antes era
  `7a2af58`. Como en la primera, los PRs cerrados (#1 a #11) siguen mostrando
  los commits viejos.

### La historia completa, reconstruida (6 de octubre)

Al revisar las fechas de la licencia se vio que `main` empezaba el 3 de
octubre, aunque el repositorio es del 11 de agosto: las dos reescrituras se
habían hecho sobre el clon superficial de la nube. Se reconstruyó todo desde
un clon completo:

- **De dónde salió:** `git clone --mirror` trae las referencias
  `refs/pull/*/head`, y desde ellas se llega a los 172 commits perdidos. Se
  injertaron (`git replace --graft`) debajo del primero de los 68 que quedaban
  y se aplicaron las mismas reglas a los 240 con `git filter-branch`: autor
  `dflores296` en lugar de Claude y de los correos personales del dueño, sin
  líneas de Claude (también las escritas `Co-authored-by`, en minúsculas, que
  la primera regla no atrapaba) y con las licencias finales.
- **Licencias en los commits viejos:** `LICENSE` y `LICENSES/` en su versión
  final donde ya había `LICENSE` (los 4 commits anteriores a la Fase 3 no
  tenían, y siguen sin tener); en el README, los badges y la sección de
  licencia, solo donde existían.
- **`LICENSE` corrige las fechas:** el periodo con MIT y CC BY-SA es del 11 de
  agosto al 6 de octubre, no del 3 al 6 de octubre como decía.
- **Comprobado commit por commit:** mismas fechas, padres y mensajes (sin las
  líneas de Claude); fuera de `LICENSE`, `LICENSES/` y las líneas de licencia
  del README, nada cambió; en los 68 de arriba, solo `LICENSE`. El último
  `main` antes era `ae44122`.
- **Siguen a la vista en GitHub** los commits viejos, con los nombres y
  correos originales, a través de los PRs cerrados (#1 a #11). Quitarlos de
  ahí solo lo puede hacer el soporte de GitHub.
- **Pendiente si se cobra en serio:** revisarlo con un abogado de propiedad
  intelectual, incluida la autoría del código escrito con ayuda de IA.
- **Dependencias del sitio:** permisivas en su gran mayoría (MIT, ISC, BSD,
  Apache), más alguna MPL-2.0 o LGPL-3.0 que solo se usa al compilar y no se
  modifica; conviven con PolyForm. Una dependencia nueva del sitio con licencia
  GPL o AGPL chocaría: revisar antes de agregarla (en `site/`:
  `npx license-checker-rseidelsohn --production --summary`).

### Lo que quedó fuera, a propósito

- **CAPTCHA de Formspree: apagado.** El formulario envía por `fetch` sin salir
  del sitio, y el CAPTCHA estándar de Formspree no funciona así. Encenderlo
  rompería todos los envíos. Si algún día llega mucho spam: Cloudflare Turnstile
  con clave propia, cargar su script y abrir la CSP a `challenges.cloudflare.com`.
- **Formshield (filtro de spam de Formspree): encendido.** Es lo único que
  cubre los POST directos a Formspree, que no pasan por la página.
- **Protección de `main`:** se recomendó activarla solo con «bloquear force
  push» y «bloquear borrado». «Require status checks» NO, por ahora: bloquearía
  los fast-forward a `main` con que se publican las rondas, y solo hace falta
  para fusionar sin revisar.
- **Fusión automática de los PRs de Dependabot:** no se activó. Exige la
  protección con status checks de arriba, y el verde no cubre la publicación.
- **Restringir Formspree al dominio del sitio:** se buscó en el panel (Rules y
  Settings) y no se encontró la opción. Se dejó así.
- **Partir `build_corpus.py` y `build_tables.py`:** evaluado y descartado. El
  documento es estático, la geometría de tablas está en reposo (las 245 están
  congeladas) y partirlos rompe el `git blame`. Solo valdría ante una edición
  nueva de la norma; entonces, empezar por sacar `LectorDeArticulo` a su módulo.

### Lo que quedó activado en GitHub (6 de octubre)

Configuración del repositorio en GitHub, no en el código; la activó el dueño:

- **Protección de `main`** (ruleset): sin force push y sin borrado. Se abrió
  unos minutos para reescribir la historia y se volvió a cerrar.
- **Security and quality:** alertas de Dependabot, secret scanning con push
  protection, code scanning (CodeQL, *default setup*: no agrega archivos al
  repo) y reporte privado de vulnerabilidades. «Dependabot security updates»
  sigue apagado: los avisos llegan como alertas, no como PRs.
- **`SECURITY.md`** en la raíz: cómo reportar en privado, qué cubre, y que un
  error de la norma va por `/observaciones` y no por ahí.

Si code scanning reporta algo, se revisa como cualquier hallazgo: verificar
si es real antes de corregir, y anotar aquí lo que se descarte y por qué.

**Primer análisis de CodeQL (6 de octubre): 3 alertas «High».**

- **Dos reales, en `limpieza.js`** («Incomplete multi-character
  sanitization»). Las etiquetas se quitaban de una sola pasada, y un texto
  anidado a propósito la burlaba: de `<<script>script>…` se quitaba el
  `<script>` de en medio y quedaba otro. El riesgo era bajo (Formspree manda
  texto y el correo no ejecuta scripts), pero rompía la promesa de «sin
  HTML». Ahora `sinEtiquetas()` repite hasta que no queda ninguna, y las
  pruebas cubren cuatro formas de anidarlas.
- **Una en contexto, en `huella_sitio.py`** («Bad HTML filtering regexp»):
  la expresión no filtra nada externo, solo ignora los `<script>` del HTML que
  genera el propio build para calcular la huella. Se endureció igual: el
  cierre acepta mayúsculas y lo que sea antes del `>` (`</script foo>`), como
  los navegadores. La primera corrección solo admitía espacios, y CodeQL abrió
  otra alerta por eso. La huella no cambió.

## Qué se hizo en la ronda del Apéndice B y el Apéndice C

Con esta ronda **no queda ninguna tabla de la norma sin contrastar**: 245 de
245. Eran siete, cuatro listados de normas y las tres tablas de ocupación en
tubo conduit, y ninguna estaba como decía su nota.

**Los cuatro listados del Apéndice B** (221 renglones) se leyeron por la
rejilla dibujada y no por la posición del texto, porque el nombre de una norma
se parte de renglón —«SERIE / NMX-J-618/1-ANCE-2010», «ANSI/API RP 14F /
2008»— y tomar cada línea que empieza en la primera columna por un renglón
nuevo inventaba 14 filas en la B1.2. Dos defectos: tres de las cuatro
declaraban cuatro renglones de encabezado cuando tienen uno, así que las tres
primeras normas de cada listado se publicaban con estilo de encabezado; y la
B1.2 tenía dos secciones intercambiadas —la NMX-J-549-ANCE-2005 remite a
«4.1.6, 250-4, …» y salía «250-4, 4.1.6, …»— porque el PDF imprime esos dos
valores en la misma línea visual con 1.3 puntos de diferencia en la base.

**Las tres tablas de ocupación en tubo conduit** son las que más se consultan
en obra y estaban peor: la C-2 publicaba 116 celdas con cinco valores dentro
(«0 0 0 0 1» en una sola celda). Las tres declaraban dos renglones de
encabezado cuando tienen cuatro, así que los tamaños de tubería —la
designación métrica y la comercial— se publicaban como datos, y la C-1 y la
C-1(a) mezclaban el tipo de conductor con el área en la primera columna, de
modo que sus 12 columnas eran en realidad 13.

Tres reglas que hay que respetar si se vuelven a tocar:

- **El tipo se escribe una vez por grupo**, en un bloque centrado que puede
  quedar por encima del renglón de datos, por debajo, o las dos cosas. Por eso
  el grupo lo marcan las horizontales dibujadas y no la posición del texto.
- **Esas mismas horizontales separan también bandas de calibre** dentro de un
  mismo tipo, así que una banda sin etiqueta continúa el grupo anterior. Con
  cualquiera de las dos reglas sola salen grupos inventados.
- **Dos renglones de la C-1 están impresos corridos 20 puntos a la izquierda**
  (RFHH-1 y RFHH-2, pág. 777), y repartir por la x junta dos valores en una
  celda. Como todo renglón trae una entrada por columna contando los guiones,
  el reparto se hace por orden y la x solo decide si el conteo no cuadra: pasa
  una vez, en el último renglón de la C-2, donde el DOF corta la tabla con
  cuatro valores en vez de seis.

**Los tres títulos que no lo eran.** `/apendices/B` publicaba «505-5 Nota 2»,
«505-5 Nota 2» y «505-5 Nota 6» como encabezados. Son celdas de la columna
«Sección» de las Tablas B2.1 y B2.2, y se escapaban de su zona por la
salvaguarda que rescata encabezados de dentro de una tabla (§4): «505-5 Nota
2» tiene la forma exacta de un encabezado de sección —tres dígitos, guion,
espacio y mayúscula—. En la región de cierre **no hay secciones numeradas**,
así que ahí esa rama de `RE_KEEP` no se aplica; las de `APENDICE`, `CAPITULO`,
`TITULO` y `ARTICULO` sí, que son las que protegen los hitos.

**Redes de seguridad nuevas**

| Detector | Qué caza | Dónde |
|---|---|---|
| Encabezado del cierre con forma de sección | Una celda de tabla publicada como título, como los tres del Apéndice B | `check_corpus.py` |

Y la de celda colapsada de la ronda anterior aprendió a eximir columnas
sueltas y no solo tablas enteras: la columna «Sección» de la B1.2 es una lista
de referencias por diseño —la NMX-J-604-ANCE-2008 remite a «4.4.2», «110» y
«240», una por renglón—, pero un colapso en cualquier otra columna de esa
misma tabla sigue rompiendo el build.

## Qué se hizo en la ronda del Apéndice A

Las nueve tablas de ampacidad del Apéndice A estaban reconstruidas pero
inservibles: publicaban columnas enteras aplanadas dentro de una celda —la
`B.310.15(B)(2)(1)` salía con cinco renglones de datos y celdas como «2.08
3.31 5.261 8.367», «14 12 10 8»—. Hoy las nueve están contrastadas celda por
celda y congeladas, y el apéndice ya no tiene ninguna tabla con la insignia
«Sin contrastar». Son 238 de 245.

**Por qué salían así.** No es el texto del PDF: en la página 757 esos valores
están en 24 renglones perfectamente separados por coordenada. Es la rejilla
DIBUJADA, que solo traza una línea cada grupo de calibres —los cuatro que
comparten el guion de «no aplica» van juntos—, y el reconstructor le creyó a
la rejilla antes que a las palabras.

**Las columnas RHO se imprimen escalonadas, y de dos maneras.** Tres de las
nueve tablas —la `(2)(5)`, la `(2)(6)` y la `(2)(7)`— reparten tres columnas
RHO (60, 90 y 120) en cada uno de sus seis grupos de ductos. Cuando no le
caben en el ancho, el DOF parte el grupo: dos valores en el renglón y el
tercero abajo. En la `(2)(5)` ese tercero va abajo y ENTRE los
otros dos; en la `(2)(6)` va abajo y A LA IZQUIERDA del primero, y encima solo
a partir del calibre 33.62 mm² —los tres primeros caben enteros—. Repartir por
`x`, que es lo que sirve en la `(2)(5)`, manda el valor a otra columna en la
`(2)(6)`. Lo que vale para las dos formas es **leer cada grupo en orden de
lectura y agrupar de tres en tres**.

Que el valor escalonado es el de RHO 120 —y no el de RHO 90, que queda a su
derecha— no se supone: la ampacidad baja cuando sube la resistividad del
terreno, así que dentro de cada grupo tiene que cumplirse
`RHO 60 > RHO 90 > RHO 120`. Se comprueba antes de escribir cada captura —264 grupos
entre las tres tablas RHO—, y en las dos escalonadas el otro orden no lo
cumpliría en ninguno.

**Un valor que parece errata y se deja.** En la `(2)(8)`, el 2 AWG de aluminio
da 110 A para dos cables y 107 A para uno, cuando dos cables siempre dan menos.
Está así impreso en la página 760. La captura reproduce lo que publicó el DOF;
corregirlo sería inventar norma.

### Las citas a los Apéndices, que eran 45 enlaces muertos

El cuerpo cita los Apéndices 42 veces y ninguna era enlace. Lo caro no era
enlazar sino reconocer la cita:

- **Ocho formas para el mismo número.** «B.310.15(B)(2)(6)»,
  «B.310-15(b)(2)(11)», «B-310-15(B)(2)(3)», «B.310. 15(B)(2)(1)» con un
  espacio de más, «B.310.15(2)(11)» sin el «(B)»…
- **Dos espacios de nombres.** El título de la tabla usa el punto y el rótulo
  que la figura lleva dibujado DENTRO del PNG usa el guion, así que la cita
  «Figura B.310.15(B)(2)(2)» y el rótulo capturado «Figura B.310-15(B)(2)(2)»
  no se parecen.

Los dos se resuelven con una clave canónica, escrita dos veces —`clave_apendice`
en `build_graph.py` y `claveApendice` en `nom.js`— y cada una dice dónde está
la otra. **Si tocas una, toca la otra**: el grafo y el enlazador tienen que
resolver lo mismo o el sitio enseñará backlinks que no coinciden con sus
enlaces.

La rama va ANTES que la de referencia desnuda, por lo mismo que la de figura:
dentro de «B.310-15(b)(2)(11)» hay un «310-15» que sí es una sección.

**Tres destinos que NO se inventan**, cada uno documentado en el código:

| Cita | Por qué no se enlaza |
|---|---|
| `Figura B.310.15(B)(2)(1)` (4 citas) | El DOF no la imprime: el Apéndice A trae cuatro imágenes, páginas 762 a 765, y son la (2), (3), (4) y la (5) |
| «las ampacidades del Apéndice B» (310-15(a)(3)) | Las ampacidades de este documento están en el Apéndice A; sus tablas se llaman `B.310.15(B)(2)(x)` porque vienen del Anexo B del NEC |
| «el último párrafo del Apéndice B» (Título 8) | Es el Apéndice B de la NOM-008-SCFI-2002, otra norma |

**Redes de seguridad nuevas**

| Detector | Qué caza | Dónde |
|---|---|---|
| Celda colapsada | Que una tabla verificada vuelva a publicar una columna dentro de una celda | `check_corpus.py` |
| Citas del Apéndice sin destino | Que una captura cambie de rótulo, o que la clave canónica deje de reducir una de las ocho formas | `check_corpus.py` |

Las dos están probadas rompiendo cosas a propósito. La de celda colapsada
lleva una lista blanca de una entrada: la **Tabla 400-4**, donde el DOF sí
imprime tres espesores apilados en una celda, frente a los tres tramos de
calibre de la celda de al lado.

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

Después, en la misma rama: transcripción del ejemplo de cálculo de
550-18(b)(6) (16 imágenes transcritas), **miniaturas** para el índice
—`build_corpus.py` las escribe en `site/public/img/min/` reduciendo por
mitades, que es lo único que `pymupdf` hace sin interpolar y por tanto lo único
reproducible: 720 KB frente a los 4.1 MB de las originales— y **backlinks de
figura**: destino `figura:` en el grafo, 41 aristas, y la figura enseña quién
la cita como ya lo hacía una sección.

Ese último destapó un defecto viejo: el recorte de `incoming_roll` quitaba el
paréntesis a TODOS los destinos, así que `figura:551-46(c)` caía en
`figura:551-46` y las tres figuras del 516-3(c) juntaban sus citas en una. En
un id de sección el sufijo es un inciso; en `tabla:` o `figura:` es parte del
nombre. Las figuras son el primer destino con prefijo que enseña backlinks, así
que hasta ahora no se notaba.

**Redes de seguridad nuevas**

| Detector | Qué caza | Dónde |
|---|---|---|
| Piso de figuras en `MIN` | Que una regresión deje artículos sin su diagrama | `check_corpus.py` |
| Miniatura ausente | Una tarjeta rota en el índice de figuras | `check_corpus.py` |
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

Va en `site/public/`, versionado, **a propósito**: lo que genera el pipeline
(`site/src/generado/`, de `build_search.py`) está en `.gitignore` y se regenera
en cada publicación, así que un archivo puesto ahí existiría en local y
desaparecería en CI.

## Pendientes

Ninguno de contenido: las 245 tablas están contrastadas, las 59 imágenes
capturadas y el cierre tiene sus siete hitos. Lo que queda es del oficio de
siempre —si el DOF publica una fe de erratas, si un lector reporta una
diferencia por /observaciones, si alguna vez hay una edición nueva de la
norma—, y para eso está el resto de este archivo.

## La región de cierre: las últimas 38 páginas

El corpus tenía 151 artículos y 10 capítulos, y ahí se acababa lo que el parser
conocía. Pero el documento sigue 38 páginas más:

| Dónde | Qué es |
|---|---|
| pág. 742-754 | `CAPITULO 10`: las tablas generales, sus Notas de las Tablas y la prosa de las 11(A) a la 12(B) |
| pág. 754 | `TITULO 6` VIGILANCIA y `TITULO 7` BIBLIOGRAFIA |
| pág. 755 | `TITULO 8` CONCORDANCIA CON NORMAS INTERNACIONALES Y NORMAS MEXICANAS |
| pág. 755-764 | `APENDICE A (Informativo)`: las tablas de ampacidad `B.310.15(B)(2)(x)` y sus cuatro figuras |
| pág. 765-772 | `APENDICE B`: el listado de normas NOM/NMX/IEC/UL con las secciones que las citan |
| pág. 773-780 | `APENDICE C (Informativo)`: las tablas de ocupación en tubo conduit |

Como el 924 es el último artículo, sus límites llegaban hasta el final del
documento y **todo eso caía dentro de `924-24`**, que se titula «Tarimas y
tapetes aislantes». Lo que se midió antes de arreglarlo:

- Un solo párrafo, `924-24` seq 25, tenía **35 389 caracteres**: era una tabla
  de ampacidad entera aplanada a prosa corrida.
- Los nueve hijos `924-24(1)` a `924-24(9)` **no eran incisos del 924-24**: son
  las Notas de las Tablas del Capítulo 10 («Véase el apéndice C para el número
  máximo de conductores…»).
- **Ninguna tabla de las páginas 755-780 estaba reconstruida.** Las 226
  llegaban hasta la pág. 754.

La cobertura del 100 % no lo delataba, y no es un defecto de la métrica: cuenta
si las palabras de cada renglón aparecen en el corpus, y aparecían. Lo que no
dice es que estén en el nodo que les toca.

Hoy la región se parsea aparte, en `parse_cierre`, porque su forma no es la del
articulado: no hay secciones numeradas sino una sucesión de encabezados,
párrafos, listas, tablas y figuras. Vive en `corpus['cierre']` como siete
hitos, cada uno con sus `bloques` en el orden del documento, y `check_corpus`
exige **los siete por nombre**: perder el Apéndice C y ganar un Título
repetido daría el mismo conteo.

Dónde se publica cada uno:

| Hito | Página del sitio |
|---|---|
| Capítulo 10 | `/tablas/generales/`, con sus tablas intercaladas |
| Títulos 6, 7 y 8 | `/cierre/` |
| Apéndices A, B y C | `/apendices/` y `/apendices/<letra>/` |

Tres cosas que costaron y conviene no volver a romper:

- **El límite de un apéndice cae a media página.** El Apéndice B empieza en la
  765 a `y=679`, y la última tabla del A está impresa ARRIBA en esa misma
  página. Marcar el apéndice por número de página la mandaba al equivocado;
  `apendice_de(page, y)` mira las dos cosas.
- **La zona de la Tabla B2.2 se tragaba el encabezado del Apéndice C.** Termina
  en `y=567.1` de la página 773 y el `APENDICE C (Informativo)` está en
  `y=566`. `RE_KEEP` ahora protege también `APENDICE`, `CAPITULO` y `TITULO`,
  igual que ya protegía `ARTICULO`.
- **`RE_KEEP` rescataba «F. DEF. CARGA 50»** de dentro de su propia tabla,
  porque su rama `[A-M]. Xxx` —pensada para «A. Generalidades»— calzaba con la
  abreviatura. Ahora exige minúsculas detrás.

Las tres tablas que acompañan a las Figuras `B.310.15(B)(2)(3)` a `(5)` se dan
de alta a mano: la norma las imprime sin «Tabla N» delante, así que no hay
título que detectar. Llevan 16 columnas porque sus dos mitades reparten el
ancho distinto —tres columnas de ampacidad arriba y cinco de factores de
temperatura abajo—, y 16 es el único número que deja cada valor en su sitio sin
inventar ni descartar ninguno.

## Trampas del entorno

- **`dflores296.github.io` estaba bloqueado** desde el entorno de Claude Code en
  la nube. Se puede construir el sitio y servirlo en `localhost` para revisarlo
  con Playwright; verificar el deploy era mirar que el workflow salga en verde.
  El 8 de octubre de 2026 el dueño le dio acceso completo a la red al entorno y
  desde entonces la URL publicada sí se abre; si una sesión vuelve a tener el
  acceso limitado, vuelve a estar bloqueado.
- **El npm del contenedor (10.9) reescribe `package-lock.json`** al instalar o
  al correr `npm audit fix`: le quita los campos `libc` que pone la versión de
  Dependabot. Por eso el hook usa `npm ci`. Para subir una dependencia a mano,
  aplicar solo las líneas reales del cambio (versión, `resolved`, `integrity`)
  y comprobar con `npm ci` que el lockfile no se mueve.
- **`*.workers.dev` también está bloqueado**: el asistente no se puede probar
  desde aquí contra Cloudflare. Las pruebas usan uno de mentiras; la prueba de
  verdad es preguntar en el sitio publicado.
- **`gitdiagram.com` también está bloqueado.** Por eso el diagrama del README
  se rehízo a mano en Mermaid, con los colores del sitio: GitHub lo dibuja solo.
- **El clon de la nube es superficial** (`git rev-parse
  --is-shallow-repository` dice `true`): trae solo los últimos commits.
  Cualquier operación sobre la historia entera —reescribirla, contar commits,
  buscar cuándo cambió algo— se hace antes con `git fetch --unshallow`, o en un
  `git clone --mirror` aparte. Una reescritura sobre el clon superficial borra
  en silencio todo lo anterior al corte.
- **Borrar ramas remotas devuelve 403.** Hay que hacerlo desde la web o desde un
  clon local.
- **Chromium está preinstalado** en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Para medir geometría de tablas renderizadas hay que servir `site/dist` por HTTP
  con la ruta base `/NOM-001-SEDE-2012`: con `file://` no cargan los estilos.

## Las skills de diseño (retiradas)

Para el rediseño de octubre se instalaron ocho skills de diseño de terceros en
`.claude/skills/` (refero-design de referodesign/refero_skill, y ui-ux-pro-max
y otras seis de nextlevelbuilder/ui-ux-pro-max-skill), con `npx skills add`.
Terminado el rediseño se quitaron del repo: nada del sitio, del extractor ni
del CI las usaba, y traían más código que todo `tools/`. Para recuperarlas tal
como estaban: `git checkout 0b3100b -- .claude/skills skills-lock.json`.
