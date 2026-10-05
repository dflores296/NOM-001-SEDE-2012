// Las anclas que se arman de los dos lados: al construir, donde se pintan
// (el glosario, las tablas), y en el navegador, donde el buscador arma el
// enlace de cada resultado. Viven aparte de nom.js porque importar nom.js
// desde el cliente se llevaría el corpus entero al bundle, y una regla
// copiada en los dos lados se despega en cuanto alguien corrige una sola.

/** Ancla de una definición del glosario: "A la vista de" -> "a-la-vista-de". */
export function defSlug(term) {
  return String(term)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Ancla de una tabla: "310-15(b)(16)" -> "tabla-310-15-b-16". */
export function tablaSlug(id) {
  return (
    'tabla-' +
    String(id)
      .replace(/[^\w-]+/g, '-')
      .replace(/-+$/g, '')
  );
}
