// El respaldo del asistente de /preguntar: lo que el buscador de siempre
// encuentra para la pregunta, recortado a lo que tiene que ver con ella. Se
// usa cuando en los pasos del índice el modelo no pidió nada que exista (ver
// chat.js); lo normal es que lea lo que él escogió (lectura.js).
//
// Fue la primera forma del asistente y se quedó corta por esto mismo: la
// página adivinaba qué leer, y el recorte por oraciones le quitó al 240-4(d)
// justo los renglones con los amperes.
//
// El recorte importa por dos razones. La cuota gratis de Cloudflare se gasta
// por palabra que lee el modelo, así que cada fragmento de más es una
// pregunta menos al día para todos. Y un modelo con cuatro páginas delante
// se pierde más que con los cuatro párrafos que hablan del tema.
//
// Sin DOM ni import.meta: lo prueba site/pruebas/preguntar.mjs con Node.
import { sinAcentos, termino } from '../buscador/terminos.js';

// Cuánto se manda. Por debajo de los topes del Worker (TOPES en
// ia/nucleo.js), que rechaza lo que se pase. 12 000 caracteres son unas
// 3 500 palabras del modelo. (Al principio se estimaban unas 130 preguntas al
// día; medido el 8 de octubre de 2026, el cupo da unas 40 a 45 entre todos.)
export const PRESUPUESTO = { fragmentos: 7, porFragmento: 3500, total: 12000 };

// Cuántos de cada tipo, como el CUPO del buscador y por lo mismo: las
// definiciones tienen títulos cortos que puntúan alto, y sin tope llenaban
// el envío —«conductor de puesta a tierra» mandaba cinco definiciones y
// ninguna sección—.
export const CUPO = { sec: 4, tabla: 2, def: 1, fig: 1, cierre: 1 };

// Lo que dice toda pregunta y no dice de qué trata. Se compara ya reducido
// por termino(), igual que las palabras de la pregunta.
const DE_PREGUNTA = new Set(
  [
    'qué',
    'cuál',
    'cuáles',
    'cómo',
    'cuándo',
    'dónde',
    'cuánto',
    'cuánta',
    'cuántos',
    'cuántas',
    'debo',
    'debe',
    'deben',
    'necesito',
    'necesita',
    'puedo',
    'puede',
    'pueden',
    'hay',
    'es',
    'son',
    'ser',
    'mi',
    'me',
    'mis',
    'tengo',
    'tiene',
    'si',
    'sí',
    'no',
    'norma',
    'nom',
    'según',
    'dice',
    'lleva',
    'llevar',
    'usar',
    'uso',
    'va',
    'van',
    'hace',
    'falta',
  ].map((w) => termino(w))
);

/** Las palabras de la pregunta que sirven para elegir párrafos, reducidas. */
export function palabrasClave(pregunta) {
  const out = [];
  for (const w of String(pregunta).split(/[^\p{L}\p{N}]+/u)) {
    if (!w) continue;
    const t = termino(w);
    if (!t || DE_PREGUNTA.has(t)) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Cuántas palabras clave distintas aparecen en un trozo de texto. */
function puntaje(trozo, patrones) {
  const t = sinAcentos(trozo.toLowerCase());
  let n = 0;
  for (const p of patrones) if (p.test(t)) n++;
  return n;
}

// Un número se busca entero ("20" no es "200" ni "2.08"); una palabra, por
// su principio, porque viene reducida ("circuito" encuentra "circuitos").
function patrones(claves) {
  return claves.map((k) =>
    /^\d+$/.test(k) ? new RegExp(`(^|[^\\d.])${k}(?![\\d]|\\.\\d)`) : new RegExp(`\\b${k}`)
  );
}

/**
 * Deja `texto` en `max` caracteres conservando lo que tiene que ver con la
 * pregunta. La prosa se parte en oraciones; una tabla (`lineas`), en
 * renglones, y su encabezado se queda siempre. Lo que se salta se marca con
 * «…», para que el modelo sepa que ahí había más.
 */
export function recortar(texto, claves, max, { lineas = false } = {}) {
  if (texto.length <= max) return texto;
  const unidades = lineas ? texto.split('\n') : texto.split(/(?<=[.;])\s+/);
  const sep = lineas ? '\n' : ' ';

  // Fijas: el principio de la prosa (el título y la primera oración) o, en
  // una tabla, todo hasta su renglón de encabezados.
  let fijas = 1;
  if (lineas) {
    const h = unidades.findIndex((u) => u.includes(' | '));
    fijas = h >= 0 ? h + 1 : 1;
  }
  const ps = patrones(claves);
  const orden = unidades
    .map((u, i) => ({ i, u, p: i < fijas ? Number.POSITIVE_INFINITY : puntaje(u, ps) }))
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const coinciden = orden.some((o) => o.i >= fijas && o.p > 0);

  const elegidas = new Set();
  let largo = 0;
  for (const { i, u, p } of orden) {
    // Lo que no tiene ninguna palabra de la pregunta solo entra si nada la
    // tiene (entonces, el principio), o en una tabla: sus renglones de
    // números rara vez repiten una palabra, y una tabla a medias confunde
    // menos que una sin los renglones que la rodean.
    if (p === 0 && coinciden && !lineas) break;
    const costo = u.length + sep.length + 2;
    if (largo + costo > max) continue;
    elegidas.add(i);
    largo += costo;
  }
  if (!elegidas.size) return `${texto.slice(0, max - 1)}…`;

  const partes = [];
  let anterior = -1;
  for (const i of [...elegidas].sort((a, b) => a - b)) {
    if (i !== anterior + 1) partes.push('…');
    partes.push(unidades[i]);
    anterior = i;
  }
  if (anterior < unidades.length - 1) partes.push('…');
  return partes.join(sep);
}

/**
 * Cómo se llama un resultado del buscador cuando el asistente lo cita: lo
 * que va entre corchetes en la respuesta y la página convierte en enlace.
 */
export function rotulo(r) {
  if (r.kind === 'tabla') return r.sinNumero ? `Tabla del ${r.tid}` : `Tabla ${r.tid}`;
  if (r.kind === 'def') return `Definición: ${r.title}`;
  if (r.kind === 'fig' || r.kind === 'cierre') return r.fid;
  return r.id;
}

/**
 * Los fragmentos que se le mandan al asistente, en el orden del buscador.
 * `tablas` es /data/tablas-ia.json: la tabla renglón por renglón, que se usa
 * en vez de su texto aplanado. Cada fragmento lleva `r`, el resultado del
 * buscador, para que la página arme su enlace.
 */
export function elegir(resultados, pregunta, tablas = {}, P = PRESUPUESTO) {
  const claves = palabrasClave(pregunta);
  const out = [];
  const vistos = new Set();
  const cuenta = {};
  let total = 0;
  for (const r of resultados) {
    if (out.length >= P.fragmentos) break;
    if ((cuenta[r.kind] || 0) >= (CUPO[r.kind] ?? 1)) continue;
    // Un inciso exacto ("310-15(a)") trae el texto de su sección: si la
    // sección ya va, no se manda dos veces.
    const doc = r.docId ?? r.id;
    if (vistos.has(doc)) continue;
    const enRenglones = r.kind === 'tabla' ? tablas[r.id] : null;
    const base = enRenglones || r.text;
    if (!base) continue;
    const resto = P.total - total;
    if (resto < 400) break;
    const texto = recortar(base, claves, Math.min(P.porFragmento, resto), {
      lineas: Boolean(enRenglones),
    });
    vistos.add(doc);
    cuenta[r.kind] = (cuenta[r.kind] || 0) + 1;
    out.push({ r, ref: rotulo(r), titulo: r.title || '', texto });
    total += texto.length;
  }
  return out;
}
