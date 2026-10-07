// Lo que el asistente pidió leer, convertido en lo que se le manda.
//
// En los pasos 1 y 2 (ver chat.js) el modelo contesta con texto: unas claves
// del índice general («240, 310») y luego unos identificadores del índice
// de esos artículos («240-4(d)», «Tabla 240-6(a)», «Acometida»). Un modelo
// no siempre escribe exactamente lo que se le pidió —numera, pone guiones,
// copia el título detrás, escribe «240.4(D)» al estilo del NEC—, así que aquí
// se lee con manga ancha y solo se acepta lo que de verdad existe. Lo que no
// existe se ignora; si al final no queda nada, la página busca por su cuenta
// (buscador de siempre) y el asistente contesta con eso.
//
// Los textos y los índices son los de /data/ia/ (src/lib/asistente-datos.js).
// Sin DOM ni import.meta: lo prueba site/pruebas/preguntar.mjs con Node.
import { sinAcentos } from '../buscador/terminos.js';

// Cuánto se lee en el paso 3. Por debajo de los topes del Worker (TOPES en
// ia/nucleo.js). 22 000 caracteres son unas 6 000 palabras del modelo.
export const LECTURA = { partes: 8, porParte: 8000, total: 22000 };

// El índice de los artículos escogidos (paso 2), por debajo de
// TOPES.indice.secciones. El del 250, el más largo, tiene 17 000 caracteres.
export const TOPE_INDICE = 24000;

/** Cómo se comparan identificadores: sin acentos, minúsculas, sin adornos. */
export function normId(s) {
  return sinAcentos(String(s))
    .toLowerCase()
    .replace(/[«»"'`*]/g, '')
    .replace(/^(secci[oó]n|art[ií]culo|inciso|art\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(\d{3})\.(\d)/, '$1-$2');
}

const piezas = (texto) =>
  String(texto)
    .split(/\n|[,;]/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

/** Las claves del índice general que pidió el modelo (paso 1), sin repetir. */
export function clavesPedidas(texto, claves, max = 3) {
  const validas = new Map(claves.map((c) => [normId(c), c]));
  const out = [];
  for (const p of piezas(texto)) {
    // «Artículo 240», «240 Protección contra sobrecorriente», «C10».
    const k = validas.get(normId(p).split(' ')[0]);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

/** El índice de los paquetes escogidos, uno tras otro, hasta TOPE_INDICE. */
export function indiceCombinado(paquetes, tope = TOPE_INDICE) {
  const todo = paquetes.map((p) => p.indice).join('\n\n');
  if (todo.length <= tope) return todo;
  const corte = todo.lastIndexOf('\n', tope - 40);
  return `${todo.slice(0, corte)}\n… (índice recortado)`;
}

/**
 * Qué se puede pedir de unos paquetes: identificador normalizado →
 * { paq, parte, foco }. `parte` es la llave en paq.partes; `foco`, el inciso
 * dentro de esa sección (o null: la parte entera).
 */
function mapaDe(paquetes) {
  const m = new Map();
  const alias = [];
  const poner = (k, v) => {
    if (k && !m.has(k)) m.set(k, v);
  };
  for (const paq of paquetes) {
    for (const [llave, parte] of Object.entries(paq.partes)) {
      poner(normId(llave), { paq, parte: llave, foco: null });
      if (parte.tipo === 'def')
        alias.push([normId(`definicion: ${llave}`), { paq, parte: llave, foco: null }]);
      if (parte.tipo === 'tabla')
        alias.push([normId(parte.tid), { paq, parte: llave, foco: null }]);
      if (parte.tipo !== 'sec') continue;
      for (const [, id] of parte.texto.matchAll(/^\s*\[([^\]\n]+)\]/gm)) {
        if (id !== llave && id.startsWith(llave))
          poner(normId(id), { paq, parte: llave, foco: id });
      }
      for (const [, fig] of parte.texto.matchAll(
        /^\s*\[Figura\] (Figura [^\s.]+(?:\s\([^)]+\))?)/gm
      )) {
        alias.push([normId(fig), { paq, parte: llave, foco: null }]);
      }
    }
  }
  // Los alias van al final: «240-6(a)» es antes un inciso que una tabla.
  for (const [k, v] of alias) poner(k, v);
  return m;
}

/**
 * Lo que pidió el modelo en el paso 2, resuelto contra lo que existe:
 * [{ paq, parte, foco }]. De cada renglón se toma el principio más largo que
 * sea un identificador («240-4(d) Conductores pequeños» → 240-4(d)).
 */
export function partesPedidas(texto, paquetes, max = 6) {
  const mapa = mapaDe(paquetes);
  const out = [];
  for (const p of piezas(texto)) {
    const palabras = p.split(/\s+/);
    let hallado = null;
    for (let n = palabras.length; n > 0 && !hallado; n--) {
      const cand = normId(palabras.slice(0, n).join(' '));
      hallado = mapa.get(cand) ?? mapa.get(cand.replace(/[.:;,)]+$/, ''));
    }
    if (!hallado) continue;
    const ya = out.find((o) => o.paq === hallado.paq && o.parte === hallado.parte);
    // Una sección pedida entera cubre sus incisos; un inciso más de una
    // sección que ya va, se suma a ella.
    if (ya) {
      if (ya.focos && hallado.foco) {
        if (!ya.focos.includes(hallado.foco)) ya.focos.push(hallado.foco);
      } else ya.focos = null;
      continue;
    }
    if (out.length >= max) break;
    out.push({
      paq: hallado.paq,
      parte: hallado.parte,
      focos: hallado.foco ? [hallado.foco] : null,
    });
  }
  return out;
}

/** Las líneas de un inciso y de todo lo que cuelga de él, por su sangría. */
export function subarbol(texto, id) {
  const lineas = texto.split('\n');
  const i = lineas.findIndex((l) => l.trimStart().startsWith(`[${id}]`));
  if (i < 0) return null;
  const sangria = (l) => l.length - l.trimStart().length;
  const base = sangria(lineas[i]);
  let j = i + 1;
  while (j < lineas.length && (!lineas[j].trim() || sangria(lineas[j]) > base)) j++;
  return lineas.slice(i, j).join('\n');
}

/** Corta en un renglón entero y avisa que sigue. */
export function recortarLineas(texto, max) {
  if (texto.length <= max) return texto;
  const aviso = '\n… (sigue: el texto completo es más largo)';
  let out = '';
  for (const l of texto.split('\n')) {
    const mas = out ? `${out}\n${l}` : l;
    if (mas.length + aviso.length > max) break;
    out = mas;
  }
  return (out || texto.slice(0, max - aviso.length)) + aviso;
}

/** El resultado del buscador al que lleva una parte, para armar su enlace. */
export function enlaceDe(parte, llave, id = null) {
  if (parte.tipo === 'tabla') {
    return {
      kind: 'tabla',
      tid: parte.tid,
      art: parte.art ?? null,
      apendice: parte.apendice ?? null,
    };
  }
  if (parte.tipo === 'def') return { kind: 'def', id: llave };
  if (parte.tipo === 'cierre') return { kind: 'cierre', cid: parte.cid };
  return { kind: 'sec', id: id ?? llave, art: parte.art };
}

/**
 * Los fragmentos del paso 3: { ref, titulo, texto, r }, en el orden en que
 * se pidieron y dentro de LECTURA. Una sección grande de la que se pidió un
 * inciso manda su primer renglón y ese inciso completo.
 */
export function fragmentosDe(pedidas, L = LECTURA) {
  const out = [];
  let total = 0;
  for (const { paq, parte: llave, focos } of pedidas) {
    if (out.length >= L.partes) break;
    const parte = paq.partes[llave];
    let texto = parte.texto;
    if (focos && parte.tipo === 'sec') {
      const cabeza = texto.split('\n')[0].slice(0, 300);
      const trozos = focos.map((f) => subarbol(texto, f)).filter(Boolean);
      if (trozos.length) texto = [cabeza, ...trozos].join('\n');
    }
    const resto = L.total - total;
    if (resto < 500) break;
    texto = recortarLineas(texto, Math.min(L.porParte, resto));
    const ref = focos?.length === 1 && parte.tipo === 'sec' ? focos[0] : llave;
    out.push({ ref, titulo: parte.titulo || '', texto, r: enlaceDe(parte, llave, ref) });
    total += texto.length;
  }
  return out;
}

/**
 * Cada identificador citable dentro de unos fragmentos, con el resultado del
 * buscador al que lleva: [[id, r]]. Así una cita a [240-4(d)(3)] aterriza en
 * su inciso, no en el principio de la sección.
 */
export function citables(fragmentos) {
  const out = [];
  for (const f of fragmentos) {
    out.push([f.ref, f.r]);
    for (const [, id] of f.texto.matchAll(/^\s*\[([^\]\n]+)\]/gm)) {
      if (id === 'Figura' || id === f.ref) continue;
      // Una tabla, una definición o el cierre: lo citable es la parte misma
      // («[Definición: Acometida]», «[Capítulo 10]»).
      if (f.r.kind !== 'sec') {
        out.push([id, f.r]);
        continue;
      }
      const t = /^Tabla (?:del )?(.+)$/.exec(id);
      out.push([
        id,
        t ? { kind: 'tabla', tid: t[1], art: f.r.art } : { kind: 'sec', id, art: f.r.art },
      ]);
    }
  }
  return out;
}
