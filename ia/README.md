# El asistente

Un Worker de Cloudflare: un programa chico que corre en los servidores de
Cloudflare cada vez que alguien le hace una pregunta al asistente de la guía:
la burbuja de abajo a la derecha de cada página (la guía de uso está en
`/asistente`). Le pasa a dos modelos de IA de código abierto de OpenAI (licencia
Apache-2.0) lo que la página le manda, con las instrucciones de cada paso: el
chico, **gpt-oss-20b**, escoge qué leer; el grande, **gpt-oss-120b**, redacta
la respuesta, que es donde hay que leer con cuidado a qué calibre y condición
corresponde cada valor. Si el grande no está disponible, redacta el chico.
Debajo de cada respuesta, el chat dice cuál la redactó: «Respondió
gpt-oss-120b · Cloudflare».

El asistente recorre la norma como una persona con el libro: primero el
índice, luego el índice del artículo, luego lo que tiene que leer.

```
Burbuja del sitio (GitHub Pages)               Worker nom-001-ia (Cloudflare)
                                                 gpt-oss-20b / -120b (Workers AI)
  pregunta + índice general (151 artículos,  ──▶  1. escoge de 1 a 3 artículos
  Capítulo 10, Apéndices)                    ◀──     «240»
  pregunta + índice del 240 (secciones,      ──▶  2. escoge qué leer completo
  incisos con título, tablas)                ◀──     «240-4(d)»
  pregunta + 240-4(d) completo, con sus      ──▶  3. el grande contesta citando
  incisos numerados                          ◀──     «… 15 amperes [240-4(d)(3)]»

  pinta la respuesta con un enlace en cada cita, y debajo lo que leyó
```

Los índices y los textos los publica el sitio en `/data/ia/` (ver
`site/src/lib/asistente-datos.js`); el Worker no carga la norma. Con los
índices van unas pistas: dónde encuentra el buscador de la guía las palabras
de la pregunta. Si lo que va a leer cita una tabla («no menor a lo de la Tabla
250-122»), la página se la agrega. Si en los pasos 1 o 2 el modelo no pide
nada que exista, la página busca por su cuenta con el buscador de siempre y el
paso 3 sigue con eso. Cada consulta lleva las
dos preguntas y respuestas anteriores, para que «¿y para 12 AWG?» sepa de qué
se hablaba.

El sitio sigue siendo estático: GitHub Pages no corre nada. Lo único que vive
fuera es este Worker.

## Lo que cuesta: nada

La cuenta de Cloudflare se queda en el plan gratis (**sin tarjeta**). Ahí
Workers AI da 10 000 «neuronas» al día, una sola bolsa para todos los
modelos. Cada pregunta son tres consultas. Medido el 8 de octubre de 2026
(panel **AI → Workers AI**, «Neurons used today»): unas **230 neuronas por
pregunta**, así que salen unas **40 a 45 preguntas diarias entre todos los
visitantes**. El modelo chico gasta el doble que el grande: lee los índices,
que son largos; el grande solo lee las partes escogidas. Al acabarse,
Cloudflare no cobra: el modelo deja de contestar hasta las 00:00 UTC (las 6 de
la tarde en el centro de México) y la página lo explica.

Para que una sola persona no se lo acabe, cada navegador tiene un tope de 10
preguntas en 24 horas (`site/src/scripts/preguntar/chat.js`). Es de cortesía:
otro navegador o una ventana de incógnito empiezan de cero.

### Cuánta gente lo usa

- **Preguntas:** cada pregunta deja en el registro del Worker
  (**Workers & Pages → nom-001-ia → Observability**) un evento
  `{"evento":"pregunta","orden":3}`: `orden` es cuántas lleva ese navegador
  en el día (UTC), contando esa. Contar esos eventos da las preguntas del
  día; contar los de `orden` 1, cuántos navegadores preguntaron; los de orden
  alto dicen si alguien gasta mucho. No identifica al navegador: con él no se
  juntan los eventos de uno. Se anota cuando el primer paso contestó, que es
  cuando la pregunta ya gastó del cupo; un primer paso que falla no se anota.
  Hasta el 8 de octubre de 2026 el evento llevaba un número al azar por
  navegador y por día (`navegador`). Cuántos días guarda el registro lo fija
  Cloudflare: se decía que 3 en el plan gratis y no está comprobado (el 11 de
  octubre de 2026 se puede ver si siguen los eventos del 7).
- **Respuestas:** cuando el Worker termina de redactar una respuesta con
  texto y ya la armó para devolverla, anota
  `{"evento":"respuesta_generada","modelo":"gpt-oss-120b"}` (o `gpt-oss-20b`,
  si redactó el respaldo). No lleva contenido ni identificadores adicionales
  incorporados por la aplicación: la hora y los datos técnicos los agrega
  Cloudflare a todo evento.
- **Cómo leerlos juntos:**
  - `pregunta` mide las preguntas iniciadas cuyo primer paso contestó;
  - `respuesta_generada` mide las respuestas que el Worker terminó;
  - la diferencia aproxima las preguntas que no terminaron (falló el segundo
    paso o el redactor, la respuesta llegó vacía, o la persona se fue antes);
  - no demuestra que el navegador haya recibido o mostrado la respuesta: el
    Worker solo sabe que la devolvió.

  Cada pregunta deja un `pregunta` y, como mucho, un `respuesta_generada`: el
  respaldo del 120b al 20b va dentro de la misma petición y no duplica. Las
  tres peticiones de una pregunta no se pueden unir entre sí (a propósito no
  hay identificador), así que se cuentan por separado; alguien que llame al
  Worker sin pasar por la página puede descuadrar los conteos. Si escribir un
  evento falla, la respuesta se entrega igual.
- **Visitas al sitio:** Cloudflare Web Analytics, si tiene su token
  (`site/src/lib/analitica.js`).

Para que eso siga así: no meter tarjeta y no activar «Workers Paid».

## Publicarlo (una sola vez)

1. **Que el directorio `ia/` esté en `main`.** Cloudflare lo toma de ahí.
2. En el panel de Cloudflare: **Compute → Workers & Pages → Create** y elegir
   **Import a repository**. Conectar GitHub y darle acceso solo a
   `dflores296/NOM-001-SEDE-2012`.
3. En la configuración del proyecto:
   - **Project name:** `nom-001-ia` (tiene que ser igual a `name` en
     `wrangler.jsonc`).
   - **Root directory** (en *Advanced settings*): `ia`
   - **Build command:** vacío. **Deploy command:** `npx wrangler deploy`
     (el que trae).
4. **Deploy.** Al terminar, Cloudflare enseña la dirección del Worker:
   `https://nom-001-ia.<tu-subdominio>.workers.dev`.
5. Esa dirección va en `site/src/lib/asistente.js`. Con eso aparece la
   burbuja del asistente, la CSP se abre a ese origen y nada más, y el sitio
   empieza a usarlo. Es un cambio de contenido: hay que volver a sellar la
   huella del sitio (la burbuja va en todas las páginas).

Desde entonces, cada cambio que llegue a `main` vuelve a publicar el Worker,
también los que no tocan `ia/` (se vio en su historial de versiones el 8 de
octubre de 2026): publica el mismo código, así que no hace daño. Para que solo
lo haga con cambios de `ia/`, poner `ia/*` en **Build watch paths** (Settings →
Build).

## Qué hacer si…

| Pasa | Qué es | Qué hacer |
|---|---|---|
| La página dice «Tu pregunta no llegó al asistente» | El navegador no pudo comunicarse con el Worker: una red que bloquea `workers.dev`, o el Worker no arrancó o se cayó | Probar con otra red (los datos del celular). Si falla en todas, **Workers & Pages → nom-001-ia → Observability** dice el error. Así se encontró que no arrancaba con un `export` de más en `agente.js` |
| La página dice «El asistente tardó demasiado en contestar» | Pasaron 90 segundos sin respuesta (la página se rinde; el Worker no tiene tope propio) | Volver a intentar. Si pasa seguido, Observability dice cuánto tarda cada paso |
| La página dice que se acabaron las respuestas del día | La cuota gratis se gastó (error 3036) | Nada: vuelve a las 6 pm. Si pasa seguido, ver la tercera fila |
| «El asistente no está disponible por ahora» | Cloudflare sacó el modelo del plan gratis (error 5035) | Cambiar `MODELO` en `wrangler.jsonc` por otro del catálogo que siga gratis y subirlo a `main` |
| La cuota se acaba temprano todos los días | Mucha gente, o un bot | En el panel, **Workers & Pages → nom-001-ia → Metrics** dice cuántas llegan. Contra un bot: Turnstile (gratis) o un tope por IP |
| La página dice que llegaron muchas preguntas seguidas | Más de 15 consultas en un minuto desde la misma conexión (unas 5 preguntas): el tope `ratelimits` de `wrangler.jsonc` | Nada: al minuto se libera. Una oficina que comparte internet puede toparlo; si pasa seguido, subir `limit` |
| Se agrega un dominio propio | La página manda la pregunta desde otro origen | Agregarlo a `ORIGENES` en `wrangler.jsonc`, separado por coma |

## Probarlo

```
node ia/pruebas/agente.mjs
```

Prueba el Worker sin Cloudflare: el modelo se sustituye por una función que
anota lo que recibe. `agente.js` es solo la puerta de entrada y todo lo demás
vive en `nucleo.js`: Cloudflare toma cada `export` de `agente.js` como una
entrada del Worker, y uno que no lo sea le impide arrancar. `tools/verificar.sh` lo corre junto con Biome. Las
pruebas de la página están en `site/pruebas/preguntar.mjs` (sin navegador) y
en `site/pruebas/navegador.mjs` (con un asistente de mentiras).

## Privacidad

Qué se trata y a dónde va lo dice el aviso de privacidad del sitio
(`site/src/pages/privacidad.astro`, publicado en `/privacidad`), y ningún
modelo ni servicio nuevo recibe preguntas sin actualizarlo antes: regla de
`CLAUDE.md`, con su candado en `site/pruebas/aviso.mjs`.

En corto: la pregunta, la conversación anterior y las partes de la norma
viajan a Cloudflare, que corre los modelos. El Worker no tiene dónde guardar
nada (ni KV, ni R2, ni base de datos), pero su registro (Observability) anota
por consulta el paso, el modelo, lo que tardó y los tokens, los errores, y
los eventos `pregunta` y `respuesta_generada` (ver «Cuánta gente lo usa»);
nunca la pregunta, la respuesta ni la IP. Cloudflare declara que no usa el
contenido de Workers AI para entrenar los modelos ni para mejorar servicios
sin consentimiento explícito (página «Data usage» de Workers AI, actualizada
el 21 de abril de 2026), y el dueño no lo ha dado.

## Licencia

Como el resto del código fuera de `tools/`: PolyForm Noncommercial 1.0.0 (ver
`LICENSE`). El modelo es de OpenAI, bajo Apache-2.0, y corre en Cloudflare: no
se descarga ni se incluye aquí.
