// El índice del buscador: se descarga la primera vez que se enfoca un campo
// de búsqueda y se arma en el navegador con MiniSearch. buscar() es lo único
// que necesita el resto: primero las coincidencias exactas de código y luego
// el difuso.
import MiniSearch from 'minisearch';
import { base } from '../base.js';

let mini = null;
let allDocs = null;
// normCodigo(idDeInciso) -> { doc: seccionQueLoContiene, id: idDeInciso }.
// Cada inciso ("310-15(a)", "310-15(b)(16)"...) no tiene documento
// propio en el índice de MiniSearch -se indexa a nivel de sección
// completa, ver build_search.py-, pero SÍ tiene su propio ancla en el
// HTML (id={node.id} en Sub.astro). Este mapa es lo que permite
// saltar directo a esa ancla exacta en vez de solo al principio de
// la sección.
let incisoPorCn = null;

// MiniSearch no toca acentos por defecto: "electrica" no encontraba
// "eléctricas" -acento Y plural a la vez agotan de sobra el margen de
// fuzzy:0.15-, y en una norma llena de "eléctrico/a", "protección",
// "sección", "tensión" eso pierde resultados reales con la forma en
// que la gente escribe desde el celular. Normaliza con la MISMA regla
// que unaccent() en tools/build_corpus.py (NFD + quitar las marcas
// combinantes, así que "ñ" cae en "n" igual que ahí). Vive a nivel de
// módulo porque la usan tanto el índice (processTerm) como el
// resaltado de fragmentos más abajo.
const sinAcentos = (s) => Array.from(s.normalize('NFD'))
  .filter((c) => { const cp = c.codePointAt(0); return cp < 0x0300 || cp > 0x036f; })
  .join('');

// MiniSearch corta cada id en tokens por cada '-', '(', ')' y '.', así
// que "310-15(b)(16)" queda como CUATRO piezas sueltas: "310" "15" "b"
// "16". Eso funciona si buscas con esos mismos separadores, pero
// buscar "310-15b16" pegado (como se escribe en campo, sin teclear
// paréntesis) produce el token "15b16", que no coincide con ninguna
// de esas cuatro piezas: el buscador solo engancha "310" y el resto
// del orden queda a la deriva del difuso, mezclando tablas de
// cualquier otra sección del artículo 310. normCodigo() quita TODOS
// los separadores para poder comparar códigos completos entre sí sin
// que importe cómo se hayan escrito.
const normCodigo = (s) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Solo se activa para algo con pinta de código de artículo-sección
// (varios dígitos seguidos), para no interferir con búsquedas de
// texto normal que por casualidad empiecen con un número.
function pareceCodigo(qn) {
  return qn.length >= 4 && (qn.match(/\d/g) || []).length >= 4;
}

// Busca por id normalizado en vez de por tokens: coincidencia EXACTA
// ("310-15b16" === "310-15(b)(16)"), primero contra un INCISO exacto
// (para saltar directo a "310-15(a)" en vez de solo al principio de
// la sección "310-15"), y si no hay inciso, contra el id de una
// SECCIÓN/TABLA completa o como prefijo de lo escrito ("310-15" es
// prefijo de "310-15a" cuando el inciso exacto no existe o no se pudo
// resolver). Se acota el sobrante para no confundir "310-15" con
// "310-150" o con un artículo distinto que comparta el mismo prefijo.
function coincidenciasCodigo(q) {
  if (!allDocs) return [];
  const qn = normCodigo(q);
  if (!pareceCodigo(qn)) return [];
  const out = [];
  // Muy por encima de cualquier score real de MiniSearch (que en la
  // práctica no pasa de los miles): una coincidencia de código exacta
  // debe ganarle siempre al difuso, sin excepción, incluso cuando el
  // difuso tiene un pico raro con una consulta muy específica.
  const BASE = 1e6;

  const inciso = incisoPorCn.get(qn);
  if (inciso) out.push({ ...inciso.doc, id: inciso.id, score: BASE });

  for (const d of allDocs) {
    const dn = d._cn;
    if (!dn) continue;
    if (dn === qn) out.push({ ...d, score: BASE });
    else if (!inciso && dn.length >= 4 && dn.length < qn.length && qn.startsWith(dn) && qn.length - dn.length <= 3) {
      out.push({ ...d, score: BASE - 200 - (qn.length - dn.length) });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 10);
}

// Se cachea la PROMESA, no un booleano. Con una bandera, el `focus` que
// arranca la descarga y el `input` que llega justo después se pisan: el
// segundo ve "ya está cargando", retorna de inmediato y busca contra un
// índice todavía nulo.
let loading = null;
export function load() {
  if (!loading) {
    loading = (async () => {
      const r = await fetch(`${base}/data/search.json`);
      const docs = await r.json();
      // Se precalcula UNA vez, no en cada tecleo: el id normalizado
      // (sin '-', '(', ')', '.') que usa coincidenciasCodigo() más
      // abajo para encontrar "310-15(b)(16)" aunque se escriba
      // "310-15b16" pegado.
      incisoPorCn = new Map();
      for (const d of docs) {
        if (d.kind === 'sec' || d.kind === 'tabla' || d.kind === 'fig') {
          d._cn = normCodigo(
            d.kind === 'tabla' ? d.tid : d.kind === 'fig' ? d.num : d.id
          );
        }
        if (d.kind === 'sec') {
          for (const iid of d.incisos || []) {
            const cn = normCodigo(iid);
            // El primero gana: si dos incisos de distinta sección
            // normalizaran igual (no debería pasar, pero por si
            // acaso), mejor quedarse con uno determinista que pisarlo
            // en cada vuelta.
            if (!incisoPorCn.has(cn)) incisoPorCn.set(cn, { doc: d, id: iid });
          }
        }
      }
      allDocs = docs;
      const ms = new MiniSearch({
        fields: ['id', 'title', 'text'],
        // 'text' se guarda para poder recortar un fragmento con la
        // coincidencia resaltada: antes solo se usaba para indexar y
        // se descartaba, así que un resultado no decía DÓNDE dentro
        // de la sección apareció lo que buscaste.
        storeFields: ['id', 'title', 'art', 'artTitle', 'kind', 'tid', 'sinNumero',
                      'apendice', 'text', 'fid', 'ancla', 'cid'],
        processTerm: (term) => sinAcentos(term.toLowerCase()),
        searchOptions: { boost: { id: 6, title: 3 }, prefix: true, fuzzy: 0.15 },
      });
      ms.addAll(docs);
      mini = ms;
    })();
  }
  return loading;
}

// Consulta completa: primero las coincidencias de código, que para
// "310-15b16" o "310-15a" son la respuesta exacta que MiniSearch por sí
// solo no encuentra (ver coincidenciasCodigo), y luego el difuso. Se
// deduplica por id porque una coincidencia exacta también puede salir
// por la vía normal.
export async function buscar(q) {
  await load();
  const vistos = new Set();
  const combinados = [];
  for (const r of [...coincidenciasCodigo(q), ...mini.search(q)]) {
    if (vistos.has(r.id)) continue;
    vistos.add(r.id);
    combinados.push(r);
  }
  return combinados.slice(0, 25);
}
