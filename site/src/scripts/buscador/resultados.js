// Cómo se pinta un resultado: a dónde lleva, su rótulo y el fragmento del
// texto con lo buscado resaltado.
import { defSlug, tablaSlug } from '../../lib/slug.js';
import { base } from '../base.js';
import { sinAcentos, termino } from './terminos.js';

// El Artículo 100 no tiene secciones numeradas: sus 185 definiciones
// viven en el glosario. Sin este desvío, buscar "ampacidad" llevaba a
// una página de artículo vacía cuyo único contenido era un cartel
// pidiendo ir al glosario. Una tabla se ancla dentro de su artículo; las
// que no cuelgan de ninguno (r.art viene null) viven en su apéndice o, las
// del Capítulo 10, en /tablas/generales.
//
// r.id de una sección normal nunca trae paréntesis (los ids de
// sección son planos, tipo "310-15"); solo los trae cuando
// coincidenciasCodigo() lo sobreescribió con el id de un INCISO
// concreto ("310-15(a)"), que también tiene su propia ancla en el
// HTML (ver id={node.id} en Sub.astro). Por eso ya no se recorta en
// el primer '(': antes ese recorte no cambiaba nada porque nunca
// había paréntesis que cortar, pero ahora sí los hay y hay que
// conservarlos para aterrizar en el inciso exacto.
export function href(r) {
  if (r.kind === 'def') return `${base}/glosario/#${defSlug(r.id)}`;
  if (r.kind === 'tabla') {
    const slug = tablaSlug(r.tid);
    if (r.art) return `${base}/art/${r.art}#${slug}`;
    if (r.apendice) return `${base}/apendices/${r.apendice}/#${slug}`;
    return `${base}/tablas/generales/#${slug}`;
  }
  // El ancla de una figura ya viene calculada: una imagen puede traer
  // dos números y cada uno aterriza en el suyo.
  if (r.kind === 'fig') {
    return r.art ? `${base}/art/${r.art}#${r.ancla}`
                 : `${base}/apendices/A/#${r.ancla}`;
  }
  if (r.kind === 'cierre') {
    if (r.cid.startsWith('apendice-')) return `${base}/apendices/${r.cid.slice(9)}/`;
    if (r.cid === 'capitulo-10') return `${base}/tablas/generales/`;
    return `${base}/cierre/#${r.cid}`;
  }
  return `${base}/art/${r.art}#${r.id}`;
}

export function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

// Construye, por cada palabra de la consulta, un patrón que la
// encuentra en el texto ORIGINAL (con acentos) aunque se haya escrito
// sin ellos -es la contraparte de sinAcentos(), pero en vez de
// normalizar el texto para comparar, ensancha el patrón para que
// encuentre ambas formas directamente en el original. Así no hace
// falta mapear posiciones entre una copia normalizada y el texto real:
// el recorte del fragmento sale ya de las coordenadas correctas.
const ACENTOS = { a: 'aàáâã', e: 'eèéêë', i: 'iìíîï', o: 'oòóôõ', u: 'uùúûü', n: 'nñ' };
function patronConAcentos(palabra) {
  return [...palabra].map((c) => {
    const alt = ACENTOS[c.toLowerCase()];
    if (alt) return `[${alt}${alt.toUpperCase()}]`;
    return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
}

// Fragmento de contexto alrededor de la primera coincidencia, con la
// palabra resaltada. Antes un resultado solo mostraba id + título: si
// el término aparecía en medio de un párrafo largo, no había forma de
// saber si de verdad decía lo que buscabas sin abrir la sección.
//
// Cada palabra se busca por su raíz, la misma con la que la compara el
// índice (terminos.js), y se resalta completa: buscar "ampacidades"
// encuentra el texto por "ampacidad", y así también se marca.
function fragmento(texto, q) {
  if (!texto) return '';
  const todas = q.split(/\s+/).filter(Boolean);
  if (!todas.length) return '';
  const raiz = (w) => termino(w) ?? sinAcentos(w.toLowerCase());
  const patron = (w) => `${patronConAcentos(raiz(w))}[\\p{L}\\p{N}]*`;
  const palabras = todas.filter((w) => w.length > 1 && termino(w) !== null);
  if (!palabras.length) return '';

  // Para "puesta a tierra" queremos la FRASE completa resaltada de
  // corrido -incluida la "a" de en medio-, no "puesta" y "tierra"
  // sueltas con un hueco sin marcar entre ellas. Se intenta primero
  // como frase (todas las palabras, unidas por \s+ tal como se
  // escribieron) y solo si no aparece así, literalmente, en el texto
  // se cae al resaltado palabra por palabra de antes.
  const fraseSrc = todas.map(patron).join('\\s+');
  const mFrase = todas.length > 1 ? new RegExp(fraseSrc, 'iu').exec(texto) : null;

  const altPalabras = palabras.map(patron).join('|');
  const m = mFrase || new RegExp(altPalabras, 'iu').exec(texto);
  if (!m) return '';
  const ANTES = 40, DESPUES = 90;
  const ini = Math.max(0, m.index - ANTES);
  const fin = Math.min(texto.length, m.index + m[0].length + DESPUES);
  const recorte = escapeHtml(texto.slice(ini, fin));
  const elegido = mFrase ? fraseSrc : altPalabras;
  const resaltado = recorte.replace(new RegExp(elegido, 'giu'), '<mark>$&</mark>');
  return (ini > 0 ? '…' : '') + resaltado + (fin < texto.length ? '…' : '');
}

export const ETIQUETA = { sec: 'Secciones', tabla: 'Tablas', def: 'Definiciones',
                   fig: 'Figuras', cierre: 'Apéndices y cierre' };

export function itemHtml(r, q) {
  const esTabla = r.kind === 'tabla';
  // Un término del glosario tiene id === título ("Acometida"): mostrar
  // los dos era repetir la misma palabra dos veces seguidas.
  const rid = esTabla
    ? (r.sinNumero ? `Tabla del ${r.tid}` : `Tabla ${r.tid}`)
    : r.kind === 'fig' || r.kind === 'cierre' ? r.fid
    : (r.kind === 'def' ? '' : r.id);
  const rsn = r.art ? `Art. ${r.art} · ${r.artTitle || ''}` : (r.artTitle || '');
  const frag = fragmento(r.text, q);
  return `<a role="option" href="${href(r)}">
       ${rid ? `<span class="rid">${rid}</span>` : ''}
       <span class="rti">${r.title || ''}</span>
       <span class="rsn">${rsn}</span>
       ${frag ? `<span class="rsnip">${frag}</span>` : ''}
     </a>`;
}
