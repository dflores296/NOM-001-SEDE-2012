// Paso 1 del asistente: el índice general de la norma, un renglón por clave
// (artículo, Capítulo 10, Apéndices, Títulos de cierre). Ver
// src/lib/asistente-datos.js.
import { ASISTENTE_NOM } from '../../../lib/asistente-nom.js';

export function GET() {
  const { indice, claves } = ASISTENTE_NOM;
  return new Response(JSON.stringify({ indice, claves: Object.keys(claves) }));
}
