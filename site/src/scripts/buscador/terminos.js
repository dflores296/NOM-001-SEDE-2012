// Cómo se reduce una palabra antes de indexarla o buscarla. Lo usan el
// índice (processTerm de MiniSearch, igual para el texto y para la
// consulta) y el resaltado de fragmentos, así que los dos comparan con la
// misma regla.

// MiniSearch no toca acentos por defecto: "electrica" no encontraba
// "eléctricas" -acento Y plural a la vez agotan de sobra el margen de
// fuzzy:0.15-, y en una norma llena de "eléctrico/a", "protección",
// "sección", "tensión" eso pierde resultados reales con la forma en
// que la gente escribe desde el celular. Normaliza con la MISMA regla
// que unaccent() en tools/build_corpus.py (NFD + quitar las marcas
// combinantes, así que "ñ" cae en "n" igual que ahí).
export const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Singular a lo bruto: "ampacidades" → "ampacidad", "motores" → "motor",
// "electrodos" → "electrodo". Dejarle el plural al difuso no alcanza: con
// fuzzy:0.15 tiene un solo cambio de margen, así que "electrodos" encuentra
// "eléctricos" y "ampacidades" no llega a "ampacidad" en los títulos. No
// hace falta que la raíz sea una palabra correcta, solo que la consulta y
// el texto caigan en la misma ("luces" queda "luce" en los dos lados). Las
// palabras cortas y las que llevan cifras no se tocan.
export function singular(t) {
  if (t.length < 5 || /\d/.test(t)) return t;
  if (/[dlnr]es$/.test(t)) return t.slice(0, -2);
  if (/[aeiou]s$/.test(t)) return t.slice(0, -1);
  return t;
}

// Palabras que no dicen nada del tema. Con la búsqueda por prefijo, la "a"
// de "puesta a tierra" encontraba toda palabra que empezara con a, y la
// consulta devolvía 3 174 documentos en vez de 940.
const VACIAS = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo',
                        'los', 'o', 'para', 'por', 'que', 'se', 'u', 'un', 'una', 'y']);

// En el campo `id` sí se conservan: la "a" de "392-22(a)" es parte del
// código, no un artículo. (La consulta llega sin campo y las descarta,
// pero un código completo lo resuelve aparte coincidenciasCodigo.)
export function termino(t, campo) {
  const x = sinAcentos(t.toLowerCase());
  if (campo !== 'id' && VACIAS.has(x)) return null;
  return singular(x);
}
