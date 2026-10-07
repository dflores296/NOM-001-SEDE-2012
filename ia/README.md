# El asistente de /preguntar

Un Worker de Cloudflare: un programa chico que corre en los servidores de
Cloudflare cada vez que alguien hace una pregunta en la página `/preguntar`
de la guía. Le pasa a un modelo de IA de código abierto (**gpt-oss-20b**, de
OpenAI, licencia Apache-2.0) lo que la página le manda, con las instrucciones
de cada paso.

El asistente recorre la norma como una persona con el libro: primero el
índice, luego el índice del artículo, luego lo que tiene que leer.

```
Página /preguntar (GitHub Pages)                Worker nom-001-ia (Cloudflare)
                                                    gpt-oss-20b (Workers AI)
  pregunta + índice general (151 artículos,  ──▶  1. escoge de 1 a 3 artículos
  Capítulo 10, Apéndices)                    ◀──     «240»
  pregunta + índice del 240 (secciones,      ──▶  2. escoge qué leer completo
  incisos con título, tablas)                ◀──     «240-4(d)»
  pregunta + 240-4(d) completo, con sus      ──▶  3. contesta citando cada dato
  incisos numerados                          ◀──     «… 15 amperes [240-4(d)(3)]»

  pinta la respuesta con un enlace en cada cita, y debajo lo que leyó
```

Los índices y los textos los publica el sitio en `/data/ia/` (ver
`site/src/lib/asistente-datos.js`); el Worker no carga la norma. Si en los
pasos 1 o 2 el modelo no pide nada que exista, la página busca por su cuenta
con el buscador de siempre y el paso 3 sigue con eso. Cada consulta lleva las
dos preguntas y respuestas anteriores, para que «¿y para 12 AWG?» sepa de qué
se hablaba.

El sitio sigue siendo estático: GitHub Pages no corre nada. Lo único que vive
fuera es este Worker.

## Lo que cuesta: nada

La cuenta de Cloudflare se queda en el plan gratis (**sin tarjeta**). Ahí
Workers AI da 10 000 «neuronas» al día. Cada pregunta son tres consultas al
modelo que leen, juntas, de 5 000 a 15 000 tokens según el artículo: con
gpt-oss-20b salen unas **35 a 60 preguntas diarias entre todos los
visitantes**. El registro del Worker (Observability) anota los tokens de cada
consulta, así que el número real se puede ver ahí. Al acabarse, Cloudflare no
cobra: el modelo deja de contestar hasta las 00:00 UTC (las 6 de la tarde en
el centro de México) y la página lo explica.

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
5. Esa dirección va en `site/src/lib/asistente.js`. Con eso aparece la pestaña
   «Preguntar», la CSP se abre a ese origen y nada más, y la página empieza a
   usarlo. Es un cambio de contenido: hay que volver a sellar la huella del
   sitio (la pestaña sale en todas las páginas).

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
