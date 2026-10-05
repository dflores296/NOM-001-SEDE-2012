// Las opciones de MiniSearch, en un solo lugar: con ellas se arma el índice
// al construir el sitio (src/pages/data/indice.json.js) y con las mismas se
// carga en el navegador (indice.js). Si no coincidieran, el índice armado y
// la búsqueda reducirían las palabras distinto y no se encontrarían.
import { termino } from './terminos.js';

export const OPCIONES = {
  fields: ['id', 'title', 'text'],
  // Nada guardado dentro del índice: los datos de cada documento viajan
  // aparte, en `docs` de indice.json, y su texto en textos.json.
  storeFields: [],
  processTerm: termino,
  searchOptions: { boost: { id: 6, title: 3 }, prefix: true, fuzzy: 0.15 },
};
