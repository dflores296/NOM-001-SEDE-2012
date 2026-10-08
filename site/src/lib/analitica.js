// ---------------------------------------------------------------------------
// EL CONTADOR DE VISITAS
//
// Cloudflare Web Analytics: cuenta visitas y páginas vistas sin cookies y sin
// guardar datos de la persona. Es gratis y vive en la misma cuenta de
// Cloudflare que el asistente (Analytics & Logs → Web Analytics).
//
// Aquí va el «token» que da Cloudflare al dar de alta el sitio
// (dflores296.github.io): es el valor de "token" en el pedacito de código
// que enseña. No es un secreto: viaja en cada página.
//
// La usan dos lugares:
// - astro.config.mjs, para abrirle la CSP al script de Cloudflare
//   (static.cloudflareinsights.com) y a donde manda la visita
//   (cloudflareinsights.com), y a nada más;
// - Base.astro, que pone el script al final de cada página y lo dice en el
//   pie.
//
// Vacío, no hay contador: ni script, ni cambio en la CSP.
// ---------------------------------------------------------------------------
export const ANALITICA = '';
