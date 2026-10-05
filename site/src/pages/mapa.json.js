// Los datos del mapa 3D de /mapa, calculados al construir el sitio.
//
// Van aparte y no dentro de la página porque solo los pide el navegador de
// escritorio, cuando de verdad va a dibujar el mapa: en el teléfono no se
// descarga ni esto ni la librería 3D.
//
// La red se arma a nivel SECCIÓN. Las citas a un inciso ("250-32(b)(1)") se
// suben a su sección ("250-32"), porque a nivel inciso el mapa serían cuatro
// mil puntos sueltos; las citas a una tabla o a una figura, a la sección que
// la contiene; las citas a un artículo completo o a una de sus partes, al
// nodo del artículo. Cada sección se ata además a su artículo con un enlace
// de estructura, invisible, que es lo que agrupa el mapa por artículos.
import { articles, apendices, grafo } from '../lib/nom.js';
import { nodoDe, seccionPorId } from '../lib/mapa-red.js';
import { comunidades } from '../lib/comunidades.js';

// Grupo de color: los capítulos 2 a 9 llevan cada uno su color; el 1
// (disposiciones generales), el 10 (tablas) y los apéndices van juntos en gris.
const grupoDe = (cap) => (cap >= 2 && cap <= 9 ? String(cap) : 'g');

export function GET() {
  // Referencias únicas entre nodos, sin las que un nodo se hace a sí mismo.
  const refs = new Map();
  for (const e of grafo.edges) {
    const de = nodoDe(e.from);
    const a = nodoDe(e.to);
    if (!de || !a || de === a) continue;
    const k = `${de}>${a}`;
    refs.set(k, (refs.get(k) || 0) + 1);
  }

  const entra = new Map();
  const usados = new Set();
  for (const k of refs.keys()) {
    const [de, a] = k.split('>');
    usados.add(de);
    usados.add(a);
    entra.set(a, (entra.get(a) || 0) + 1);
  }

  const nodes = [];
  // Todos los artículos: son los centros de los racimos.
  for (const a of articles) {
    nodes.push({
      id: `art:${a.num}`,
      k: 'a',
      t: a.title,
      a: a.num,
      g: grupoDe(a.chapter),
      n: entra.get(`art:${a.num}`) || 0,
    });
  }
  // Las secciones que citan o son citadas; las que no, no aportan al mapa.
  for (const [id, { s, a }] of seccionPorId) {
    if (!usados.has(id)) continue;
    nodes.push({
      id,
      k: 's',
      t: s.title || '',
      a: a.num,
      g: grupoDe(a.chapter),
      n: entra.get(id) || 0,
    });
  }
  // Los hitos del cierre que aparecen en alguna referencia.
  for (const h of apendices) {
    if (usados.has(h.id))
      nodes.push({
        id: h.id,
        k: 'h',
        t: `Apéndice ${h.letra}${h.titulo ? ` · ${h.titulo}` : ''}`,
        a: null,
        g: 'g',
        n: entra.get(h.id) || 0,
      });
  }
  if (usados.has('capitulo-10')) {
    nodes.push({
      id: 'capitulo-10',
      k: 'h',
      t: 'Capítulo 10 · Tablas generales',
      a: null,
      g: 'g',
      n: entra.get('capitulo-10') || 0,
    });
  }

  // El grupo de cada artículo para el acomodo «Por tema» (lib/comunidades.js),
  // con las citas entre artículos distintos. Cada punto lleva el de su
  // artículo; los hitos del cierre no llevan.
  const artDe = new Map(nodes.map((n) => [n.id, n.a]));
  const pares = new Map();
  for (const [k, w] of refs) {
    const [de, a] = k.split('>').map((id) => artDe.get(id));
    if (de == null || a == null || de === a) continue;
    const par = de < a ? `${de}|${a}` : `${a}|${de}`;
    pares.set(par, (pares.get(par) || 0) + w);
  }
  const grupo = comunidades(
    articles.map((a) => a.num),
    pares
  );
  for (const n of nodes) if (n.a != null) n.c = grupo.get(n.a);

  const hay = new Set(nodes.map((n) => n.id));
  const links = [];
  for (const [k, w] of refs) {
    const [s, t] = k.split('>');
    if (hay.has(s) && hay.has(t)) links.push({ s, t, w });
  }
  // Estructura: cada sección con su artículo.
  for (const n of nodes) {
    if (n.k === 's') links.push({ s: n.id, t: `art:${n.a}`, e: 1 });
  }

  return new Response(JSON.stringify({ nodes, links }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
