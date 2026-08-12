/**
 * Ancla de una definición del glosario: "A la vista de" -> "a-la-vista-de".
 *
 * Vive aparte de nom.js porque lo necesitan los dos lados: el glosario, que
 * pinta las anclas al construir, y el buscador del navegador, que arma el
 * enlace de cada resultado. Importar nom.js desde el cliente se llevaría el
 * corpus entero al bundle.
 */
export function defSlug(term) {
  return String(term)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
