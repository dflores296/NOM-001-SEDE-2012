// Cómo se lee la respuesta del asistente antes de pintarla: en bloques
// (párrafos y listas) y, dentro de cada renglón, en trozos de texto y citas.
// Una cita es lo que el modelo escribe entre corchetes —[310-15],
// [Tabla 250-122]— y se vuelve enlace solo si es una de las partes de la
// norma que se le mandaron: una referencia que el modelo inventó se queda
// como texto, sin llevar a ningún lado.
//
// Aquí no se arma HTML. La respuesta la escribió un modelo y se trata como
// texto ajeno: la página la pinta con textContent (ver chat.js), así que un
// «<img onerror=…>» en la respuesta se lee, no se ejecuta.
//
// Sin DOM ni import.meta: lo prueba site/pruebas/preguntar.mjs con Node.
import { sinAcentos } from '../buscador/terminos.js';

/** La forma de comparar referencias: sin acentos, mayúsculas ni espacios de más. */
export function normRef(s) {
  return sinAcentos(String(s))
    .toLowerCase()
    .replace(/^(secci[oó]n|art[ií]culo|art\.)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Las instrucciones piden texto plano, pero un modelo escribe Markdown por
// costumbre: los ** y los # se verían tal cual.
function sinMarkdown(linea) {
  return linea
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/\*\*|__|`/g, '');
}

const VINETA = /^\s*(?:[-*•–]|\d+[.)])\s+/;

// gpt-oss cita a veces con los corchetes de su entrenamiento, 【240-4】 o
// 【240-4†L3-L5】, aunque se le pida [ ]. Se vuelven corchetes normales para
// que la cita sea enlace. Alguna vez abre con uno y cierra con otro
// («【Nota de la guía (errata del DOF)}]»): también.
export function normalizarCitas(texto) {
  return String(texto).replace(
    /[【［〔]([^】］〕†\n\]}]{1,160})(?:†[^】］〕\n\]]*)?(?:[】］〕]|\}?\])/g,
    '[$1]'
  );
}

/**
 * La respuesta en bloques: { tipo: 'p', texto } o { tipo: 'ul', items }.
 * Un renglón vacío separa párrafos; los renglones con guion o número al
 * principio son una lista.
 */
export function bloques(texto) {
  const out = [];
  let parrafo = [];
  const cerrarParrafo = () => {
    if (parrafo.length) out.push({ tipo: 'p', texto: parrafo.join(' ') });
    parrafo = [];
  };
  for (const crudo of normalizarCitas(texto).split(/\r?\n/)) {
    const linea = sinMarkdown(crudo).trim();
    if (!linea) {
      cerrarParrafo();
      continue;
    }
    // Un encabezado de Markdown va en su propio párrafo, sin sus #.
    if (/^\s{0,3}#{1,6}\s/.test(crudo)) {
      cerrarParrafo();
      out.push({ tipo: 'p', texto: linea });
      continue;
    }
    if (VINETA.test(crudo) || VINETA.test(linea)) {
      cerrarParrafo();
      const item = linea.replace(VINETA, '');
      const ultimo = out[out.length - 1];
      if (ultimo?.tipo === 'ul') ultimo.items.push(item);
      else out.push({ tipo: 'ul', items: [item] });
      continue;
    }
    // Un renglón suelto después de una lista sigue el párrafo nuevo.
    parrafo.push(linea);
  }
  cerrarParrafo();
  return out;
}

/** La referencia mandada que corresponde a una cita, o null. */
function buscarRef(cita, refs) {
  let k = normRef(cita);
  if (refs.has(k)) return k;
  // El modelo puede citar un inciso de la sección que se le mandó
  // ("250-122(a)" de "250-122"): se lleva a la sección.
  while (/\([^()]*\)$/.test(k)) {
    k = k.replace(/\([^()]*\)$/, '').trim();
    if (refs.has(k)) return k;
  }
  return null;
}

/**
 * Un renglón en trozos: { texto } o { texto, href }. `refs` va de normRef(ref)
 * al enlace de esa parte de la norma. Dentro de un mismo par de corchetes
 * puede haber varias citas («[310-15; Tabla 310-15(b)(16)]»).
 */
export function trozos(linea, refs) {
  const out = [];
  const texto = (t) => {
    if (!t) return;
    const ultimo = out[out.length - 1];
    if (ultimo && !ultimo.href) ultimo.texto += t;
    else out.push({ texto: t });
  };
  let desde = 0;
  for (const m of linea.matchAll(/\[([^[\]\n]{1,160})\]/g)) {
    texto(linea.slice(desde, m.index));
    const partes = m[1].split(/(\s*[;,]\s*|\s+y\s+)/);
    if (!partes.some((p, i) => i % 2 === 0 && buscarRef(p, refs))) {
      texto(m[0]);
    } else {
      texto('[');
      partes.forEach((p, i) => {
        const k = i % 2 === 0 ? buscarRef(p, refs) : null;
        if (k) out.push({ texto: p.trim(), href: refs.get(k) });
        else texto(p);
      });
      texto(']');
    }
    desde = m.index + m[0].length;
  }
  texto(linea.slice(desde));
  return out;
}
