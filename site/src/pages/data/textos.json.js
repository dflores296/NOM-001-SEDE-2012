// El texto de cada documento del buscador, por id. Solo hace falta para el
// fragmento con lo buscado resaltado bajo cada resultado, así que va aparte
// del índice y se pide después de él: los resultados salen primero y el
// fragmento llega unos segundos más tarde en una conexión lenta.
import docs from '../../generado/search.json';

export function GET() {
  return new Response(JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d.text]))));
}
