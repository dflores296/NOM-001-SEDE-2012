// El índice del buscador, armado al construir el sitio y no en el teléfono.
//
// Armarlo en el navegador es lo que más tarda: en un teléfono promedio con 4G
// rápido, unos 4 s de la primera búsqueda. Aquí se arma una vez y el
// navegador solo lo carga. Va sin el texto de las secciones, que solo
// sirve para el fragmento bajo cada resultado y llega aparte, por detrás
// (textos.json.js).
//
// Lleva dos cosas: `docs`, los datos de cada documento sin su texto, y
// `indice`, el índice de MiniSearch.
import MiniSearch from 'minisearch';
import docs from '../../generado/search.json';
import { OPCIONES } from '../../scripts/buscador/opciones.js';

export function GET() {
  const ms = new MiniSearch(OPCIONES);
  ms.addAll(docs);
  const sinTexto = docs.map(({ text, ...d }) => d);
  return new Response(JSON.stringify({ docs: sinTexto, indice: ms }));
}
