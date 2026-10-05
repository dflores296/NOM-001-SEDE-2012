// Pruebas de las piezas puras del mapa (src/scripts/mapa/), sin navegador:
// la geometría del hilo y las sugerencias del buscador, contra mapa.json.
//
//     cd site && npm run build && node pruebas/mapa.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexar } from '../src/scripts/mapa/datos.js';
import { armarHilo } from '../src/scripts/mapa/hilo.js';
import { crearSugeridor } from '../src/scripts/mapa/sugerencias.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(fs.readFileSync(path.join(aqui, '..', 'dist', 'mapa.json'), 'utf8'));
const ix = indexar(datos);
const sugerir = crearSugeridor(datos.nodes);

let fallas = 0;
function prueba(nombre, fn) {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}
function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

const lado = (n) => Math.sign(n.fx);

prueba('El punto de partida va al centro y todo el hilo tiene posición fija', () => {
  const h = armarHilo('250-122', ix, { dir: 'ambas', prof: 1 });
  const c = h.nodes.find((n) => n.id === '250-122');
  afirmar(c && c.fx === 0 && c.fy === 0 && c.fz === 0, 'el centro no está en el origen');
  afirmar(
    h.nodes.every((n) => [n.fx, n.fy, n.fz].every(Number.isFinite)),
    'hay posiciones sin fijar'
  );
});

prueba('Lo que cita al punto va a la izquierda y lo que él cita, a la derecha', () => {
  const id = '250-122';
  const h = armarHilo(id, ix, { dir: 'ambas', prof: 1 });
  const entran = new Set(ix.entran.get(id));
  const salen = new Set(ix.salen.get(id));
  for (const n of h.nodes) {
    if (n.id === id) continue;
    if (entran.has(n.id) && !salen.has(n.id))
      afirmar(lado(n) === -1, `${n.id} cita a ${id} y no quedó a la izquierda`);
    if (salen.has(n.id) && !entran.has(n.id))
      afirmar(lado(n) === 1, `${id} cita a ${n.id} y no quedó a la derecha`);
  }
  afirmar(
    h.nodes.length === 1 + new Set([...entran, ...salen]).size,
    'faltan o sobran puntos a un salto'
  );
});

prueba('"La citan" solo muestra lo que cita al punto, y "Cita a" lo que él cita', () => {
  const id = '250-122';
  const entra = armarHilo(id, ix, { dir: 'entran', prof: 1 });
  const sale = armarHilo(id, ix, { dir: 'salen', prof: 1 });
  afirmar(
    entra.nodes.every((n) => n.id === id || lado(n) === -1),
    'un punto de "La citan" a la derecha'
  );
  afirmar(
    sale.nodes.every((n) => n.id === id || lado(n) === 1),
    'un punto de "Cita a" a la izquierda'
  );
});

prueba('El segundo salto respeta su tope por lado', () => {
  for (const id of ['310-15', '250-122', 'art:250']) {
    const h1 = armarHilo(id, ix, { dir: 'ambas', prof: 1 });
    const h2 = armarHilo(id, ix, { dir: 'ambas', prof: 2 });
    const extra = h2.nodes.length - h1.nodes.length;
    afirmar(extra >= 0 && extra <= 80, `${id}: ${extra} puntos de segundo salto`);
  }
});

prueba('Cada línea del hilo une dos puntos que están en el hilo', () => {
  const h = armarHilo('310-15', ix, { dir: 'ambas', prof: 2 });
  const ids = new Set(h.nodes.map((n) => n.id));
  afirmar(h.links.length, 'sin líneas');
  afirmar(
    h.links.every((l) => ids.has(l.source) && ids.has(l.target)),
    'una línea apunta fuera del hilo'
  );
});

prueba('El buscador del mapa encuentra por código, pegado o con guion, y por palabras', () => {
  afirmar(sugerir('250-122')[0]?.id === '250-122', `primero: ${sugerir('250-122')[0]?.id}`);
  afirmar(sugerir('250122')[0]?.id === '250-122', 'el código pegado no encontró 250-122');
  afirmar(sugerir('430')[0]?.id === 'art:430', `"430": ${sugerir('430')[0]?.id}`);
  afirmar(sugerir('puesta a tierra').length > 0, 'sin sugerencias por palabras');
  afirmar(sugerir('zzzz').length === 0, 'sugirió algo para una consulta sin sentido');
});

console.log(fallas ? `\n${fallas} pruebas del mapa fallaron.` : '\nLas pruebas del mapa pasaron.');
process.exit(fallas ? 1 : 0);
