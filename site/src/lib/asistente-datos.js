// La norma como la consulta el asistente (la burbuja): un índice en dos
// niveles y el texto completo de cada parte, con su identificador.
//
// El asistente no recibe la norma entera —son 3.5 millones de caracteres, más
// de lo que el modelo lee de una vez y más que la cuota de un día—, sino que
// la recorre como una persona con el libro (ver src/scripts/preguntar/chat.js):
//
//   1. Lee el índice general (los 151 artículos, el Capítulo 10, los
//      Apéndices y los Títulos de cierre) y escoge de 1 a 3 claves.
//   2. Lee el índice de esas claves —secciones, incisos con título, tablas,
//      figuras— y escoge qué quiere leer completo.
//   3. Lee eso completo y contesta.
//
// Aquí se arma lo que lee en cada paso. Cada renglón de texto empieza con el
// identificador entre corchetes ([240-4(d)(3)]): así el modelo cita el inciso
// exacto y la página lo vuelve enlace a su ancla.
//
// Sin import.meta ni JSON importado: los endpoints de src/pages/data/ia/ le
// pasan los datos, y site/pruebas/preguntar.mjs lo prueba con Node.
import { tablaComoTexto } from './tabla-texto.js';

// Una tabla de más de esto no va dentro del texto de su sección: queda un
// renglón que la nombra, y el modelo la pide aparte si le hace falta.
const TABLA_EN_LINEA = 3000;

const limpio = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const sangria = (n) => '  '.repeat(n);

/** El rótulo con que se nombra una tabla: «Tabla 240-6(a)» o «Tabla del 220-83(a)». */
export const nombreTabla = (t) => (t.sin_numero ? `Tabla del ${t.id}` : `Tabla ${t.id}`);

function lineasTabla(t, nivel, enLinea) {
  const cab = `${sangria(nivel)}[${nombreTabla(t)}] ${limpio(t.title)}`;
  if (!enLinea) return [`${cab} (tabla aparte: pídela por su nombre)`];
  const cuerpo = tablaComoTexto(t);
  if (cuerpo.length > TABLA_EN_LINEA) return [`${cab} (tabla aparte: pídela por su nombre)`];
  return [cab, ...cuerpo.split('\n').map((l) => sangria(nivel + 1) + l)];
}

function lineasFigura(f, nivel) {
  const nombres = (f.rotulos || []).map((r) => `${r.rotulo}. ${limpio(r.titulo)}`);
  const titulo = nombres.length ? nombres.join(' / ') : limpio(f.titulo) || 'Figura';
  const out = [`${sangria(nivel)}[Figura] ${titulo}`];
  for (const t of f.transcripcion || []) out.push(sangria(nivel + 1) + limpio(t));
  return out;
}

/**
 * Las líneas de un nodo (sección o inciso) y sus descendientes, en el orden
 * en que los pinta el sitio (Sub.astro): título y texto, definiciones, luego
 * notas, excepciones, párrafos, tablas y figuras por su `seq`, y al final los
 * incisos. Si se agrega un campo al corpus, va aquí también (CONTEXTO §3).
 */
export function lineasNodo(nodo, tablaPorId, nivel = 0, { tablasEnLinea = true } = {}) {
  const out = [];
  const titulo = nodo.title ? `${limpio(nodo.title)}. ` : '';
  out.push(`${sangria(nivel)}[${nodo.id}] ${titulo}${limpio(nodo.text)}`.trimEnd());
  for (const d of nodo.definitions || []) {
    out.push(`${sangria(nivel + 1)}Definición «${limpio(d.term)}»: ${limpio(d.text)}`);
  }
  const anot = [
    ...(nodo.notes || []).map((n) => ({ ...n, k: 'nota' })),
    ...(nodo.exceptions || []).map((n) => ({ ...n, k: 'exc' })),
    ...(nodo.parrafos || []).map((n) => ({ ...n, k: 'parr' })),
    ...(nodo.tables || []).map((x) => ({ ...x, k: 'tabla', tabla: tablaPorId.get(x.id) })),
    ...(nodo.figures || []).map((f) => ({ ...f, k: 'fig' })),
  ].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  for (const n of anot) {
    if (n.k === 'tabla') {
      if (n.tabla) out.push(...lineasTabla(n.tabla, nivel + 1, tablasEnLinea));
    } else if (n.k === 'fig') {
      out.push(...lineasFigura(n, nivel + 1));
    } else if (n.k === 'parr') {
      out.push(sangria(nivel + 1) + limpio(n.text));
    } else {
      out.push(`${sangria(nivel + 1)}${limpio(n.label)}: ${limpio(n.text)}`);
      for (const it of n.items || []) {
        out.push(`${sangria(nivel + 2)}${it.label ? `(${it.label}) ` : ''}${limpio(it.text)}`);
      }
    }
  }
  for (const h of nodo.children || []) out.push(...lineasNodo(h, tablaPorId, nivel + 1));
  return out;
}

function* recorrer(nodo) {
  yield nodo;
  for (const h of nodo.children || []) yield* recorrer(h);
}

/** Las claves del índice general que no son artículos: el cierre de la norma. */
const CIERRE = [
  {
    clave: 'C10',
    cid: 'capitulo-10',
    titulo: 'Capítulo 10: Tablas generales (conductores, tubo conduit, propiedades)',
  },
  {
    clave: 'AA',
    cid: 'apendice-A',
    titulo: 'Apéndice A: Tablas adicionales de ampacidad (informativo)',
  },
  {
    clave: 'AB',
    cid: 'apendice-B',
    titulo: 'Apéndice B: Normas mexicanas e internacionales de referencia',
  },
  {
    clave: 'AC',
    cid: 'apendice-C',
    titulo: 'Apéndice C: Ocupación de tubo conduit por conductores (informativo)',
  },
  {
    clave: 'T',
    cid: ['titulo-6', 'titulo-7', 'titulo-8'],
    titulo: 'Títulos 6, 7 y 8: vigilancia, bibliografía y concordancia',
  },
];

/**
 * Todo lo que el asistente puede leer, por clave.
 *
 *   indice   el índice general (paso 1), un renglón por clave
 *   claves   { [clave]: { clave, titulo, indice, partes } }
 *
 * `partes` va del identificador que el modelo puede pedir (paso 2) a lo que
 * se le manda (paso 3): { tipo, titulo, texto, ...lo que la página necesita
 * para el enlace }. El título es para la lista de lo leído, no para el
 * modelo: ya va en el primer renglón del texto. Un inciso no es parte propia: se saca de su sección (ver
 * preguntar/indice.js).
 */
export function armarAsistente({ corpus, tablas, definiciones }) {
  const tablaPorId = new Map(tablas.map((t) => [t.id, t]));
  const tablasDe = new Map();
  for (const t of tablas) {
    const k = t.article ? String(t.article) : null;
    if (k) tablasDe.set(k, [...(tablasDe.get(k) || []), t]);
  }
  const claves = {};
  const general = [];

  let capitulo = null;
  for (const a of corpus.articles) {
    const num = String(a.num);
    if (a.chapter !== capitulo) {
      capitulo = a.chapter;
      const cap = corpus.chapters.find((c) => String(c.num) === String(capitulo));
      general.push(`— Capítulo ${capitulo}${cap ? `: ${limpio(cap.title)}` : ''} —`);
    }
    general.push(`${num} ${limpio(a.title)}`);

    const indice = [`Artículo ${num}: ${limpio(a.title)}`];
    const partes = {};
    if (num === '100') {
      // Las definiciones viven en el glosario, no en secciones.
      indice.push('Términos definidos (pide el término tal cual):');
      for (const d of definiciones) {
        indice.push(`  ${limpio(d.term)}`);
        partes[d.term] = {
          tipo: 'def',
          titulo: limpio(d.term),
          texto: `[Definición: ${limpio(d.term)}] ${limpio(d.definition)}`,
        };
      }
    }
    const letraParte = new Map((a.parts || []).map((p) => [p.letter, limpio(p.title)]));
    let parte = null;
    for (const s of a.sections || []) {
      if (s.part && s.part !== parte && letraParte.has(s.part)) {
        parte = s.part;
        indice.push(`Parte ${parte}. ${letraParte.get(parte)}`);
      }
      indice.push(`${s.id} ${limpio(s.title)}`);
      for (const h of recorrer(s)) {
        if (h !== s && h.title) indice.push(`  ${h.id} ${limpio(h.title)}`);
        for (const f of h.figures || []) {
          for (const r of f.rotulos || []) indice.push(`  ${r.rotulo} ${limpio(r.titulo)}`);
        }
      }
      partes[s.id] = {
        tipo: 'sec',
        art: num,
        titulo: limpio(s.title),
        texto: lineasNodo(s, tablaPorId).join('\n'),
      };
    }
    for (const t of tablasDe.get(num) || []) {
      indice.push(`${nombreTabla(t)} ${limpio(t.title)}`);
      partes[nombreTabla(t)] = {
        tipo: 'tabla',
        tid: t.id,
        art: num,
        titulo: limpio(t.title),
        texto: `[${nombreTabla(t)}] ${limpio(t.title)}\n${tablaComoTexto(t)}`,
      };
    }
    claves[num] = { clave: num, titulo: limpio(a.title), indice: indice.join('\n'), partes };
  }

  general.push('— Cierre de la norma —');
  for (const c of CIERRE) {
    general.push(`${c.clave} ${c.titulo}`);
    const cids = [].concat(c.cid);
    const indice = [c.titulo];
    const partes = {};
    for (const cid of cids) {
      const hito = (corpus.cierre || []).find((h) => h.id === cid);
      if (!hito) continue;
      const tipo = { capitulo: 'Capítulo', titulo: 'Título', apendice: 'Apéndice' }[hito.kind];
      const nombre = `${tipo || hito.kind} ${hito.num ?? cid.split('-')[1]}`;
      const prosa = [];
      for (const b of hito.bloques || []) {
        if (b.tipo === 'tabla') {
          const t = tablaPorId.get(b.id);
          if (!t) continue;
          indice.push(`${nombreTabla(t)} ${limpio(t.title)}`);
          partes[nombreTabla(t)] = {
            tipo: 'tabla',
            tid: t.id,
            apendice: t.apendice ?? null,
            titulo: limpio(t.title),
            texto: `[${nombreTabla(t)}] ${limpio(t.title)}\n${tablaComoTexto(t)}`,
          };
        } else if (b.tipo === 'figura') {
          prosa.push(...lineasFigura(b, 0));
        } else if (b.tipo === 'item') {
          prosa.push(`  ${b.label ? `(${b.label}) ` : ''}${limpio(b.text)}`);
        } else {
          prosa.push(limpio(b.text));
          if (b.tipo === 'subtitulo') indice.push(`  ${limpio(b.text)}`);
        }
      }
      if (prosa.length) {
        // La clave va sola al principio del renglón y el título después: es
        // lo que el modelo copia, y la cita no puede pasar de 80 caracteres.
        const clave = `Texto del ${nombre}`;
        indice.push(`${clave}${hito.titulo ? ` — ${limpio(hito.titulo)}` : ''}`);
        partes[clave] = {
          tipo: 'cierre',
          cid,
          titulo: limpio(hito.titulo) || nombre,
          texto: [`[${nombre}] ${limpio(hito.titulo)}`, ...prosa].join('\n'),
        };
      }
    }
    claves[c.clave] = { clave: c.clave, titulo: c.titulo, indice: indice.join('\n'), partes };
  }

  return { indice: general.join('\n'), claves };
}
