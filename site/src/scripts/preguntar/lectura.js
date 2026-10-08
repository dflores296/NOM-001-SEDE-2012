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
export const LECTURA = { partes: 4, porParte: 8000, total: 22000 };

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

// Un renglón se parte en comas («240, 310»), salvo que el renglón entero sea
// lo que se puede pedir: hay definiciones con coma («Accesible, fácilmente»).
const sinVineta = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
const piezas = (texto, entero = () => false) =>
  String(texto)
    .split('\n')
    .flatMap((l) => (entero(sinVineta(l)) ? [sinVineta(l)] : l.split(/[,;]/).map(sinVineta)))
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

// Pistas: lo que encuentra el buscador de la guía con las palabras de la
// pregunta. Van con los índices de los pasos 1 y 2 porque el índice solo
// dice «210 Circuitos derivados», y la protección contra falla a tierra de
// una vivienda vive en el 210-8: el buscador la encuentra por sus palabras.
// Son ayuda, no la respuesta: el modelo sigue escogiendo.
const PISTAS = 8;
const LARGO_PISTA = 150;
const CLAVE_APENDICE = { A: 'AA', B: 'AB', C: 'AC' };

const corto = (s) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > LARGO_PISTA ? `${t.slice(0, LARGO_PISTA - 1)}…` : t;
};

/** La clave del índice general donde vive un resultado del buscador. */
function claveDe(r) {
  if (r.kind === 'cierre') {
    if (r.cid === 'capitulo-10') return 'C10';
    if (r.cid?.startsWith('titulo-')) return 'T';
    return CLAVE_APENDICE[r.cid?.split('-')[1]] ?? null;
  }
  if (r.art != null) return String(r.art);
  // Las figuras de los apéndices no dicen de cuál son: sin pista.
  if (r.kind === 'tabla') return r.apendice ? CLAVE_APENDICE[r.apendice] : 'C10';
  return null;
}

/** Cómo aparece un resultado en el índice de su artículo (paso 2). */
function idDe(r) {
  if (r.kind === 'tabla') return `Tabla ${r.sinNumero ? 'del ' : ''}${r.tid}`;
  if (r.kind === 'def') return r.id;
  // «Tabla 240-92(b)» y «Fórmula de 310-15(b)(2)» son dibujos de un inciso:
  // se piden por el inciso.
  if (r.kind === 'fig') return r.fid?.startsWith('Figura ') ? r.fid : r.num;
  if (r.kind === 'cierre') return `Texto del ${r.fid}`;
  return r.id;
}

/**
 * Las primeras PISTAS de unos resultados del buscador: [{ clave, general,
 * detalle }]. `general` es el renglón para el paso 1 (con su clave al
 * final); `detalle`, el del paso 2, con el identificador que se puede pedir.
 */
export function pistasDe(resultados, max = PISTAS) {
  const out = [];
  for (const r of resultados || []) {
    if (out.length >= max) break;
    const clave = claveDe(r);
    if (!clave || !r.id) continue;
    const id = idDe(r);
    const titulo = r.kind === 'def' ? '' : corto(r.title);
    const detalle = titulo && titulo !== id ? `${id} ${titulo}` : id;
    if (out.some((p) => p.detalle === detalle)) continue;
    const donde = /^\d+$/.test(clave) ? `artículo ${clave}` : clave;
    const general = r.kind === 'def' ? `Definición: ${id} (${donde})` : `${detalle} (${donde})`;
    out.push({ clave, general, detalle });
  }
  return out;
}

/** El bloque de pistas que va al final de un índice; vacío si no hay. */
export function bloquePistas(lineas) {
  if (!lineas.length) return '';
  return `\n\n— Pistas del buscador de la guía: dónde aparecen las palabras de la pregunta (pueden servir o no) —\n${lineas.join('\n')}`;
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
      // Una figura puede tener varios rótulos: «[Figura] Figura 923-10(a)(3).
      // Zonificación… / Figura 923-10(c). Banco de ductos…».
      for (const [, figs] of parte.texto.matchAll(/^\s*\[Figura\] (.+)$/gm)) {
        for (const r of figs.split(' / ')) {
          const fig = /^(Figura \S+?(?:\s\([^)]+\))?)\.(?:\s|$)/.exec(r);
          if (fig) alias.push([normId(fig[1]), { paq, parte: llave, foco: null }]);
        }
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
export function partesPedidas(texto, paquetes, max = LECTURA.partes) {
  const mapa = mapaDe(paquetes);
  const out = [];
  for (const p of piezas(texto, (l) => mapa.has(normId(l)))) {
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

// «… no menor a lo de la Tabla 250-122», «según la Tabla 310-15(b)(16)».
// Solo en singular: «las Tablas 430-247 a 430-250» son para escoger una, y
// eso lo hace el modelo en el paso 2.
const TABLA_CITADA = /\bTabla\s+(\d{2,3}-\d{1,3}(?:\s?\([a-z0-9]{1,4}\))*)/gi;

/** El texto de una parte pedida como se va a leer: la sección o sus incisos. */
function textoPedido({ paq, parte, focos }) {
  const texto = paq.partes[parte].texto;
  if (!focos) return texto;
  return focos.map((f) => subarbol(texto, f) ?? '').join('\n');
}

/**
 * Las tablas que nombra lo que se va a leer y que no vienen con ello, en el
 * orden en que se leen: ['250-122', '310-15(b)(16)']. El 250-122(a) dice
 * «no menor a lo de la Tabla 250-122» y sin la tabla el asistente no puede
 * dar el calibre. No cuentan los renglones de una tabla que ya viene dentro
 * del texto («[Ver tabla 310-104(a)]» en sus encabezados), ni la tabla que ya
 * viene o que se pidió.
 */
export function tablasCitadas(pedidas) {
  const out = [];
  const ya = new Set();
  for (const p of pedidas) {
    const parte = p.paq.partes[p.parte];
    if (parte.tipo === 'tabla') ya.add(parte.tid);
  }
  const orden = [...pedidas].sort((a, b) => prioridad(a) - prioridad(b));
  for (const p of orden) {
    if (p.paq.partes[p.parte].tipo !== 'sec') continue;
    // La sangría del renglón [Tabla …] de una tabla que viene dentro del
    // texto: lo que cuelga de él son sus renglones.
    let enTabla = -1;
    for (const l of textoPedido(p).split('\n')) {
      const sangria = l.length - l.trimStart().length;
      if (enTabla >= 0 && sangria > enTabla) continue;
      enTabla = -1;
      const cab = /^\s*\[Tabla (?:del )?([^\]]+)\]/.exec(l);
      if (cab) {
        if (!l.includes('(tabla aparte')) {
          ya.add(cab[1]);
          enTabla = sangria;
        }
        continue;
      }
      for (const [, id] of l.matchAll(TABLA_CITADA)) {
        const tid = id.replace(/\s/g, '').toLowerCase();
        if (!out.includes(tid)) out.push(tid);
      }
    }
  }
  return out.filter((t) => !ya.has(t));
}

/** El artículo donde vive una tabla: «310» para la 310-15(b)(16). */
export const articuloDeTabla = (tid) => tid.split('-')[0];

/**
 * Las partes pedidas más las tablas que citan (tablasCitadas), hasta `max`.
 * Las tablas se buscan en `paquetes`, que pueden ser más que los del paso 2:
 * la página baja también el artículo de una tabla citada de otro.
 */
export function conTablasCitadas(pedidas, paquetes, max = LECTURA.partes) {
  const out = [...pedidas];
  const mapa = mapaDe(paquetes);
  for (const tid of tablasCitadas(pedidas)) {
    if (out.length >= max) break;
    const h = mapa.get(normId(`Tabla ${tid}`));
    if (!h || out.some((o) => o.paq === h.paq && o.parte === h.parte)) continue;
    out.push({ paq: h.paq, parte: h.parte, focos: null });
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
 * Los fragmentos del paso 3: { ref, titulo, texto, r }, dentro de LECTURA y
 * en orden de PRIORIDAD (y, entre iguales, en el que se pidieron). Una
 * sección grande de la que se pidió un inciso manda su primer renglón y ese
 * inciso completo.
 */
// Qué se lee primero cuando no cabe todo: el inciso que pidió, luego las
// secciones, las definiciones y al final las tablas y el cierre. Con «calibres
// pequeños» el modelo pidió tablas grandes antes que el 240-4, y lo que se
// quedaba corto era justo lo que tenía la respuesta.
const PRIORIDAD = { sec: 1, def: 2, tabla: 3, cierre: 4 };
const prioridad = (p) => (p.focos ? 0 : (PRIORIDAD[p.paq.partes[p.parte].tipo] ?? 5));

export function fragmentosDe(pedidas, L = LECTURA) {
  const out = [];
  let total = 0;
  const orden = pedidas
    .map((p, i) => ({ p, i }))
    .sort((a, b) => prioridad(a.p) - prioridad(b.p) || a.i - b.i)
    .map(({ p }) => p);
  for (const { paq, parte: llave, focos } of orden) {
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
