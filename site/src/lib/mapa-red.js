// A qué punto del mapa de /mapa va a dar cada identificador del grafo. Lo
// usan los dos archivos de datos del mapa: la red (mapa.json) y las frases de
// cada cita (mapa-citas.json), que tienen que agrupar las citas igual.
import { articles, tablaPorId, figuraPorId } from './nom.js';

const artPorNum = new Map(articles.map((a) => [a.num, a]));
export const seccionPorId = new Map();
for (const a of articles) for (const s of a.sections) seccionPorId.set(s.id, { s, a });

const SEC = /^(\d{3}-\d+)/;

// A qué nodo del mapa va a dar un identificador del grafo, o null si no tiene
// lugar en él (las citas a un capítulo entero, por ejemplo).
export function nodoDe(id) {
  if (!id) return null;
  if (id.startsWith('art:')) return artPorNum.has(Number(id.slice(4))) ? id : null;
  if (id.startsWith('parte:')) {
    const n = Number(id.split(':')[1]);
    return artPorNum.has(n) ? `art:${n}` : null;
  }
  if (id.startsWith('tabla:')) {
    const t = tablaPorId.get(id.slice(6));
    if (t?.article == null)
      return t && !t.apendice ? 'capitulo-10' : t ? `apendice-${t.apendice}` : null;
    const m = SEC.exec(id.slice(6));
    return m && seccionPorId.has(m[1]) ? m[1] : `art:${t.article}`;
  }
  if (id.startsWith('figura:')) {
    // La figura vive donde la imprime la norma, que no siempre es la
    // sección de su número: la «Figura 551-46(c)» no está en la 551-46.
    const f = figuraPorId.get(id.slice(7))?.figura;
    const m = SEC.exec(f?.nodo || '') || SEC.exec(id.slice(7));
    if (m && seccionPorId.has(m[1])) return m[1];
    return f?.articulo ? `art:${f.articulo}` : null;
  }
  if (id.startsWith('apendice-') || id === 'capitulo-10') return id;
  const m = SEC.exec(id);
  return m && seccionPorId.has(m[1]) ? m[1] : null;
}
