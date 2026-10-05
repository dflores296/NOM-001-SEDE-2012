// Los datos del mapa ya descargados (mapa.json, ver src/pages/mapa.json.js):
// quién cita a quién y cómo se rotula cada punto. No dependen del 3D ni de la
// página.

// Índices de la red: cada punto por su id, a quién cita y quién lo cita.
export function indexar(datos) {
  const porId = new Map(datos.nodes.map((n) => [n.id, n]));
  const entran = new Map(); // quién cita a cada nodo
  const salen = new Map(); // a quién cita cada nodo
  const linksRed = datos.links.map((l) => ({ source: l.s, target: l.t, e: l.e || 0 }));
  for (const l of datos.links) {
    if (l.e) continue;
    if (!salen.has(l.s)) salen.set(l.s, []);
    if (!entran.has(l.t)) entran.set(l.t, []);
    salen.get(l.s).push(l.t);
    entran.get(l.t).push(l.s);
  }
  const red = { nodes: datos.nodes, links: linksRed };
  return { porId, entran, salen, linksRed, red };
}

export const rotulo = (n) =>
  n.k === 'a' ? `Art. ${n.a}` : n.k === 'h' ? n.t.split(' · ')[0] : n.id;
export const rotuloLargo = (n) => (n.k === 'a' ? `Artículo ${n.a}` : rotulo(n));
export const titulo = (n) =>
  n.k === 'h' ? n.t.split(' · ').slice(1).join(' · ') || n.t : n.t || '';

// A dónde lleva un punto en el sitio.
export const hrefNodo = (n, base) => {
  if (n.k === 'a') return n.a === 100 ? `${base}/glosario/` : `${base}/art/${n.a}/`;
  if (n.id === 'capitulo-10') return `${base}/tablas/generales/`;
  if (n.k === 'h') return `${base}/apendices/${n.id.slice(9)}/`;
  return `${base}/art/${n.a}/#${n.id}`;
};
export const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
export const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const codigo = (s) => sinAcentos(s).replace(/[^a-z0-9]/g, '');
