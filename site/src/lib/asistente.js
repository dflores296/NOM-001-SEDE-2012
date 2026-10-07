// ---------------------------------------------------------------------------
// DÓNDE VIVE EL ASISTENTE
//
// La dirección del Worker de Cloudflare que contesta las preguntas de
// /preguntar (su código está en ia/agente.js). La usan dos lugares, y por eso
// vive aquí y no en la página:
//
// - astro.config.mjs, para abrirle la CSP (connect-src) a ese origen y a
//   ningún otro;
// - Base.astro y preguntar.astro: la pestaña «Preguntar» solo aparece con el
//   asistente conectado, y la página lo recibe en un atributo data-.
//
// Vacía, el asistente está desconectado: no hay pestaña, la CSP no cambia y
// /preguntar avisa que todavía no funciona. No es un secreto: viaja en el
// HTML, porque es a donde el navegador manda la pregunta.
// ---------------------------------------------------------------------------
export const ASISTENTE = '';
