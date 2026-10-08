// ---------------------------------------------------------------------------
// DÓNDE VIVE EL ASISTENTE
//
// La dirección del Worker de Cloudflare que contesta las preguntas del
// asistente (su código está en ia/). La usan varios lugares, y por eso
// vive aquí y no en la página:
//
// - astro.config.mjs, para abrirle la CSP (connect-src) a ese origen y a
//   ningún otro;
// - components/Asistente.astro: la burbuja la recibe en un atributo data- y
//   solo aparece con el asistente conectado;
// - Base.astro y preguntar.astro: el enlace del pie y la guía.
//
// Vacía, el asistente está desconectado: no hay burbuja, la CSP no cambia y
// /asistente avisa que todavía no funciona. No es un secreto: viaja en el
// HTML, porque es a donde el navegador manda la pregunta.
// ---------------------------------------------------------------------------
export const ASISTENTE = 'https://nom-001-ia.bettofe.workers.dev';
