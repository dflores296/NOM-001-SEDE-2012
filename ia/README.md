# El asistente de /preguntar

Un Worker de Cloudflare: un programa chico que corre en los servidores de
Cloudflare cada vez que alguien le hace una pregunta al asistente de la guía:
la burbuja de abajo a la derecha de cada página (la guía de uso está en
`/preguntar`). Le pasa a dos modelos de IA de código abierto de OpenAI (licencia
Apache-2.0) lo que la página le manda, con las instrucciones de cada paso: el
chico, **gpt-oss-20b**, escoge qué leer; el grande, **gpt-oss-120b**, redacta
la respuesta, que es donde hay que leer con cuidado a qué calibre y condición
corresponde cada valor. Si el grande no está disponible, redacta el chico.

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

- **Preguntas:** cada pregunta contestada deja en el registro del Worker
  (**Workers & Pages → nom-001-ia → Observability**) un evento
  `{"evento":"pregunta","navegador":"…"}`. Contar esos eventos da las
  preguntas del día; contar los `navegador` distintos, cuántos navegadores
  preguntaron. El número lo inventa cada navegador al azar y cambia cada día:
  no sirve para seguir a nadie. El registro gratis guarda 3 días.
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

Desde entonces, cada cambio en `ia/` que llegue a `main` se publica solo.
Conviene poner `ia/*` en **Build watch paths** (Settings → Build) para que un
cambio del sitio no vuelva a publicar el Worker.

## Qué hacer si…

| Pasa | Qué es | Qué hacer |
|---|---|---|
| La página dice «No me pude conectar con el asistente» | El Worker no contestó nada legible: no arrancó, se cayó o tardó más de un minuto | **Workers & Pages → nom-001-ia → Observability** dice el error. Así se encontró que no arrancaba con un `export` de más en `agente.js` |
| La página dice que se acabaron las respuestas del día | La cuota gratis se gastó (error 3036) | Nada: vuelve a las 6 pm. Si pasa seguido, ver la tercera fila |
| «El asistente no está disponible por ahora» | Cloudflare sacó el modelo del plan gratis (error 5035) | Cambiar `MODELO` en `wrangler.jsonc` por otro del catálogo que siga gratis y subirlo a `main` |
| La cuota se acaba temprano todos los días | Mucha gente, o un bot | En el panel, **Workers & Pages → nom-001-ia → Metrics** dice cuántas llegan. Contra un bot: Turnstile (gratis) o un tope por IP |
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

La pregunta y las partes de la norma viajan a Cloudflare, que corre el modelo.
El Worker no guarda nada, y según la política de Workers AI, Cloudflare no usa
ese contenido para entrenar modelos ni para mejorar sus servicios. La página
lo dice debajo del campo.

## Licencia

Como el resto del código fuera de `tools/`: PolyForm Noncommercial 1.0.0 (ver
`LICENSE`). El modelo es de OpenAI, bajo Apache-2.0, y corre en Cloudflare: no
se descarga ni se incluye aquí.
