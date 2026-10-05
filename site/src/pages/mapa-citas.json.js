// La frase de la norma donde aparece cada cita del mapa de /mapa: el panel
// del punto central la enseña bajo cada «La citan» y «Cita a», para leer la
// cita misma y no solo el número de quien cita.
//
// Va aparte de mapa.json porque pesa más que la red entera y solo hace falta
// al abrir el panel; el mapa la pide entonces. Una línea del mapa junta las
// citas de una sección y sus incisos (ver mapa.json.js): aquí se guarda la
// primera en orden de documento, con el inciso de donde sale, y cuántas más
// hay.
//
//   "250-32>250-122": ["250-32(b)(1)", "…conforme a 250-122…", 14, 21, 2]
//                      inciso que cita, frase, dónde va la cita, cuántas más
import { grafo } from '../lib/nom.js';
import { nodoDe } from '../lib/mapa-red.js';

export function GET() {
  const citas = {};
  for (const e of grafo.edges) {
    const de = nodoDe(e.from);
    const a = nodoDe(e.to);
    if (!de || !a || de === a) continue;
    const k = `${de}>${a}`;
    if (citas[k]) citas[k][4]++;
    else citas[k] = [e.from, e.frase, e.marca[0], e.marca[1], 0];
  }
  return new Response(JSON.stringify(citas), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
