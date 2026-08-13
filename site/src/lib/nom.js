import corpus from '../../../data/corpus.json';
import grafo from '../../../data/grafo.json';
import indice from '../../../data/indice.json';
import definiciones from '../../../data/definiciones.json';
import tablas from '../../../data/tablas.json';
import validacion from '../../../data/validacion.json';

export { corpus, grafo, indice, definiciones, tablas, validacion };

/** Ancla segura para una tabla: "310-15(b)(16)" -> "tabla-310-15-b-16". */
export function tablaSlug(id) {
  return 'tabla-' + String(id).replace(/[^\w-]+/g, '-').replace(/-+$/g, '');
}

/**
 * Cómo se anuncia una tabla. La norma imprime alguna sin "Tabla N" delante
 * —la del inciso 922-17(c)— y a esas no se les puede inventar un número: lo
 * que llevan por identificador es el inciso donde están impresas.
 */
export function rotuloTabla(t) {
  return t.sin_numero ? `Tabla del ${t.id}` : `Tabla ${t.id}`;
}

/** Lo que va después del rótulo: el título de la norma, o la falta de él. */
export function subtituloTabla(t) {
  return t.sin_numero ? 'La norma la imprime sin número ni título' : t.title;
}

/** Tablas de un artículo, en el orden en que aparecen en el documento. */
export const tablasPorArticulo = (() => {
  const m = new Map();
  for (const t of tablas) {
    if (t.article == null) continue;
    if (!m.has(t.article)) m.set(t.article, []);
    m.get(t.article).push(t);
  }
  for (const list of m.values()) list.sort((a, b) => a.page - b.page);
  return m;
})();

const tablaIds = new Set(tablas.map((t) => t.id));

/** Tabla por id, para pintarla donde el texto la ancló. */
export const tablaPorId = new Map(tablas.map((t) => [t.id, t]));

export const BASE = '/NOM-001-SEDE-2012';

export const articles = corpus.articles;
export const chapters = corpus.chapters;
export const byNum = new Map(articles.map((a) => [a.num, a]));

/** Artículo al que pertenece un id tipo "250-32(a)" o "art:250". */
export function articleOf(id) {
  if (id.startsWith('art:')) return parseInt(id.slice(4), 10);
  const m = /^(\d{3})-/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * URL de un artículo. El 100 no tiene secciones numeradas —son las 185
 * definiciones— y su página quedaba vacía, con un cartel que mandaba al
 * glosario. Se manda directo y se acabó el rebote.
 */
export function hrefArticulo(num) {
  return +num === 100 ? `${BASE}/glosario/` : `${BASE}/art/${num}`;
}

/** URL navegable de cualquier id del grafo. */
export function hrefFor(id) {
  if (id.startsWith('art:')) return hrefArticulo(id.slice(4));
  if (id.startsWith('cap:')) return `${BASE}/#cap${id.slice(4)}`;
  if (id.startsWith('parte:')) {
    const [, num, letra] = id.split(':');
    return `${BASE}/art/${num}#parte-${letra}`;
  }
  if (id.startsWith('tabla:')) {
    const t = id.slice(6);
    const tb = tablas.find((x) => x.id === t);
    if (tb && tb.article) return `${BASE}/art/${tb.article}#${tablaSlug(t)}`;
    return `${BASE}/tablas#${tablaSlug(t)}`;
  }
  const art = articleOf(id);
  // los incisos viven dentro del ancla de su sección
  return art ? `${BASE}/art/${art}#${id.split('(')[0]}` : `${BASE}/`;
}

/** Etiqueta legible de un id del grafo. */
export function labelFor(id) {
  if (id.startsWith('art:')) return `Artículo ${id.slice(4)}`;
  if (id.startsWith('cap:')) return `Capítulo ${id.slice(4)}`;
  if (id.startsWith('tabla:')) return `Tabla ${id.slice(6)}`;
  if (id.startsWith('parte:')) {
    const [, num, letra] = id.split(':');
    return `Parte ${letra} · Art. ${num}`;
  }
  return id;
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// El guion de una cita puede venir como guion de no separación (U+2011): la
// Tabla 220-3 cita "675‑22(a)" así y esa referencia no se enlazaba. NO se
// admite el guion largo (U+2013), que en 472 celdas separa rangos numéricos
// ("0.824 – 1.31") y no citas.
const GUION = '[-\\u2011]';
// El inciso puede ir pegado o separado por un espacio. La Tabla 220-3 cita
// "550-18 (b)" y "551-73 (a)"; sin admitir el espacio el enlace se quedaba en
// "550-18" y el "(b)" caía fuera, al lado del enlace pero sin formar parte.
const INCISOS = '(?:\\s*\\([a-z0-9]{1,3}\\))*';
const SECCION = `\\d{3}${GUION}\\d{1,3}${INCISOS}`;

// Una tabla suelta del Capítulo 10: "8", "11(a)", "12(B)". La norma no
// siempre respeta su propia mayúscula al citarla: 240-4(g) cita "Tablas
// 11(a) y 11(b)" en minúscula para las tablas "11(A)"/"11(B)".
const TABLA_SUELTA = '\\d{1,2}[A-Za-z]?(?:\\([A-Za-z]\\))?';

// Una sola pasada con alternancia: si se aplicaran varias expresiones en
// secuencia, la segunda reescribiría el HTML que produjo la primera.
// El orden de las ramas importa: "Tabla 310-15" debe ganarle a "310-15".
const LINKER = new RegExp(
  [
    `Tablas?\\s+${SECCION}`,
    // "Tablas 11(a) y 11(b)": una lista de tablas sueltas encadenadas por
    // coma/y/o, para que la segunda en adelante también quede enlazada y
    // no solo la que trae pegado el "Tabla" delante.
    `Tablas?\\s+${TABLA_SUELTA}(?:\\s*(?:,|y|o)\\s*${TABLA_SUELTA})*(?![\\d-])`,
    /Art\S*culos?\s+\d{3}(?:\s*(?:,|y|o|ó|a)\s*\d{3})*/.source,
    /Cap\S*tulo\s+\d{1,2}/.source,
    `\\b${SECCION}`,
  ].join('|'),
  'g'
);

/** Forma canónica de una cita para buscarla: "550-18 (b)" -> "550-18(b)". */
const idDeCita = (s) => String(s).replace(/‑/g, '-').replace(/\s+/g, '');

const knownArticle = (n) => byNum.has(n);

/** Todos los ids de sección e inciso del corpus. */
const seccionIds = (() => {
  const s = new Set();
  const walk = (n) => {
    s.add(n.id);
    (n.children || []).forEach(walk);
  };
  for (const a of articles) a.sections.forEach(walk);
  return s;
})();

/**
 * Resuelve una cita "250-32(a)(1)" al destino más específico que EXISTA,
 * probando de lo particular a lo general y en secciones y tablas.
 *
 * Comprobar que el destino existe es lo que evita enlazar rangos numéricos:
 * en la Tabla 310-104(d) la medida "501-750" kcmil se convertía en un enlace
 * al Artículo 501 solo porque ese artículo existe, aunque la norma no tenga
 * ninguna sección 501-750. Pasa en 18 celdas de tabla, todas rangos.
 */
function resolverCita(full) {
  for (let cand = idDeCita(full); ; cand = cand.replace(/\([^()]*\)$/, '')) {
    if (seccionIds.has(cand)) return { href: `${BASE}/art/${articleOf(cand)}#${cand.split('(')[0]}` };
    if (tablaIds.has(cand)) return { href: hrefFor('tabla:' + cand) };
    if (!/\(/.test(cand)) return null;
  }
}

/**
 * Convierte las citas internas del texto en enlaces navegables.
 * Devuelve HTML ya escapado, apto para set:html.
 */
export function linkify(text) {
  if (!text) return '';
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(LINKER)) {
    const raw = m[0];
    const start = m.index;
    out += esc(String(text).slice(last, start));
    last = start + raw.length;

    // --- Tabla NNN-N(x)(y): se enlaza a la TABLA reconstruida, no a la
    //     sección del mismo número, que es un requisito distinto.
    let mm = new RegExp(`^Tablas?\\s+(${SECCION})`).exec(raw);
    if (mm) {
      const tid = idDeCita(mm[1]);
      // de la cita más específica a la más general: "310-15(b)(16)" puede
      // aparecer citada así aunque la tabla se llame "310-15"
      let hit = null;
      for (let cand = tid; cand; cand = cand.replace(/\([^()]*\)$/, '')) {
        if (tablaIds.has(cand)) { hit = cand; break; }
        if (!/\(/.test(cand)) break;
      }
      if (hit) {
        out += `<a class="xref" href="${hrefFor('tabla:' + hit)}">${esc(raw)}</a>`;
        continue;
      }
      const art = /^(\d{3})/.exec(tid);
      if (art && knownArticle(+art[1])) {
        out += `<a class="xref" href="${hrefArticulo(art[1])}">${esc(raw)}</a>`;
        continue;
      }
      out += esc(raw);
      continue;
    }
    // --- Tabla(s) suelta(s) del Capítulo 10 ("Tabla 8", "Tablas 11(a) y
    //     11(b)"): cada cita de la lista se enlaza por su cuenta, no solo la
    //     que trae pegado el "Tabla" delante.
    mm = new RegExp(
      `^(Tablas?\\s+)(${TABLA_SUELTA}(?:\\s*(?:,|y|o)\\s*${TABLA_SUELTA})*)$`
    ).exec(raw);
    if (mm) {
      const [, head, list] = mm;
      let piece = '';
      let p = 0;
      for (const im of list.matchAll(new RegExp(TABLA_SUELTA, 'g'))) {
        piece += esc(list.slice(p, im.index));
        const cand = im[0];
        const upper = cand.toUpperCase();
        const tid = tablaIds.has(cand) ? cand : tablaIds.has(upper) ? upper : null;
        piece += tid
          ? `<a class="xref" href="${hrefFor('tabla:' + tid)}">${esc(cand)}</a>`
          : esc(cand);
        p = im.index + cand.length;
      }
      piece += esc(list.slice(p));
      out += esc(head) + piece;
      continue;
    }
    // --- Artículo(s) NNN  (puede citar varios: "Artículos 500, 502 y 503")
    if (/^Art\S*culos?/.test(raw)) {
      const nums = raw.match(/\d{3}/g) || [];
      if (nums.length && nums.every((n) => knownArticle(+n))) {
        let head = raw.slice(0, raw.indexOf(nums[0]));
        let rest = raw.slice(head.length);
        for (const n of nums) rest = rest.replace(n, ` ${n} `);
        out +=
          esc(head) +
          rest
            .split(' ')
            .map((p) =>
              /^\d{3}$/.test(p)
                ? `<a class="xref" href="${hrefArticulo(p)}">${p}</a>`
                : esc(p)
            )
            .join('');
        continue;
      }
      out += esc(raw);
      continue;
    }
    // --- Capítulo N
    mm = /^Cap\S*tulo\s+(\d{1,2})$/.exec(raw);
    if (mm) {
      out += `<a class="xref" href="${BASE}/#cap${mm[1]}">${esc(raw)}</a>`;
      continue;
    }
    // --- referencia desnuda NNN-N(a)(1): solo se enlaza si el destino existe
    mm = new RegExp(`^(\\d{3})${GUION}(\\d{1,3})`).exec(raw);
    if (mm && knownArticle(+mm[1])) {
      const destino = resolverCita(raw);
      if (destino) {
        out += `<a class="xref" href="${destino.href}">${esc(raw)}</a>`;
        continue;
      }
    }
    out += esc(raw);
  }
  out += esc(String(text).slice(last));
  return out;
}

/** Backlinks de una sección, ya resueltos a {id, href, titulo, articulo}. */
export function backlinks(id) {
  const src = grafo.incoming[id] || [];
  return src.map((s) => ({
    id: s,
    href: hrefFor(s),
    titulo: indice[s]?.title || '',
    articulo: indice[s]?.article ?? articleOf(s),
  }));
}

/** Salientes de una sección (a qué apunta). */
export function outgoing(id) {
  const dst = grafo.outgoing[id] || [];
  return dst.map((d) => ({ id: d, href: hrefFor(d), label: labelFor(d) }));
}
