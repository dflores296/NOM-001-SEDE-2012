// El asistente de la guía: un Worker de Cloudflare que recibe una pregunta y
// los fragmentos de la norma que encontró el buscador del sitio, y le pide a
// un modelo de Workers AI que conteste SOLO con ellos.
//
// Buscar lo hace la página (site/src/scripts/preguntar/), con el mismo índice
// que el buscador de siempre: así el Worker no carga la norma, no gasta CPU
// —el plan gratis da 10 ms por petición— y la búsqueda no cuesta cuota. Aquí
// solo se valida lo que llega, se arma la instrucción y se llama al modelo.
//
// Lo gratis tiene un tope diario (10 000 «neuronas» de Workers AI). Al
// llegar, Cloudflare no cobra: el modelo responde con el error 3036 hasta las
// 00:00 UTC, y la página lo dice y enseña las secciones que encontró.
//
// Configuración (ia/wrangler.jsonc):
//   AI        el modelo, enlazado por Cloudflare (binding de Workers AI)
//   MODELO    cuál; si Cloudflare lo retira del plan gratis, se cambia aquí
//   ORIGENES  las páginas que pueden usarlo, separadas por comas

export const MODELO = '@cf/openai/gpt-oss-20b';

// Lo que se acepta de la página. Topes holgados para lo que ella manda
// (ver PRESUPUESTO en site/src/scripts/preguntar/pasajes.js): están para que
// nadie llame al Worker con un libro entero y se acabe la cuota de un golpe.
export const TOPES = {
  cuerpo: 40_000,
  pregunta: 500,
  fragmentos: 8,
  ref: 80,
  titulo: 600,
  texto: 4_000,
  total: 16_000,
};

// Una referencia es lo que el modelo copia entre corchetes y la página
// convierte en enlace: «310-15», «Tabla 310-15(b)(16)», «Figura 230-1»,
// «Definición: Acometida». Sin corchetes ni saltos de línea, que romperían
// la cita.
const REF = /^[\p{L}\p{N} .,:;()'«»/+\-–]+$/u;

const INSTRUCCIONES = `Eres el asistente de una guía de consulta de la NOM-001-SEDE-2012, Instalaciones Eléctricas (utilización), la norma oficial mexicana. Contestas en español, claro y breve (menos de 200 palabras), SOLO con lo que dicen los fragmentos de la norma que vienen en el mensaje.

Reglas:
1. No uses nada que no esté en los fragmentos: ni otras normas, ni el NEC, ni lo que sepas por tu cuenta.
2. Cita cada dato con la referencia de su fragmento entre corchetes, escrita exactamente como aparece, por ejemplo [310-15] o [Tabla 310-15(b)(16)].
3. Copia los valores (calibres, ampacidades, distancias, tensiones) tal como vienen. No los calcules, no los redondees, no los conviertas.
4. Si los fragmentos no alcanzan para contestar, dilo («Los fragmentos que encontré no lo dicen») y sugiere qué buscar. No adivines.
5. No des por buena una instalación concreta: la decisión es de quien la diseña y de la Unidad de Verificación.
6. Texto plano: sin Markdown, sin tablas, sin encabezados. Si hace falta una lista, cada punto en su renglón empezando con guion.`;

// Controles y caracteres de formato (ancho cero, marcas bidi), como en el
// formulario de observaciones; el salto de línea se queda, porque una tabla
// llega renglón por renglón.
const CONTROL = /(?!\n)[\p{Cc}\p{Cf}]/gu;
const limpio = (s) => String(s).replace(CONTROL, '').trim();

/**
 * Lo que mandó la página, revisado. Devuelve { pregunta, fragmentos } o
 * { error } con la razón, que no se le enseña a nadie: la página solo
 * distingue «no se pudo».
 */
export function validar(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') return { error: 'cuerpo' };
  const pregunta = typeof cuerpo.pregunta === 'string' ? limpio(cuerpo.pregunta) : '';
  if (!pregunta || pregunta.length > TOPES.pregunta) return { error: 'pregunta' };
  const lista = cuerpo.fragmentos;
  if (!Array.isArray(lista) || !lista.length || lista.length > TOPES.fragmentos) {
    return { error: 'fragmentos' };
  }
  const fragmentos = [];
  let total = 0;
  for (const f of lista) {
    if (!f || typeof f !== 'object') return { error: 'fragmento' };
    const ref = typeof f.ref === 'string' ? limpio(f.ref) : '';
    const titulo = typeof f.titulo === 'string' ? limpio(f.titulo) : '';
    const texto = typeof f.texto === 'string' ? limpio(f.texto) : '';
    if (!ref || ref.length > TOPES.ref || !REF.test(ref)) return { error: 'ref' };
    if (titulo.length > TOPES.titulo) return { error: 'titulo' };
    if (!texto || texto.length > TOPES.texto) return { error: 'texto' };
    total += texto.length;
    fragmentos.push({ ref, titulo, texto });
  }
  if (total > TOPES.total) return { error: 'total' };
  return { pregunta, fragmentos };
}

/** La entrada del modelo, en el formato de la Responses API. */
export function armarEntrada({ pregunta, fragmentos }) {
  const bloques = fragmentos.map((f) => `[${f.ref}]${f.titulo ? ` ${f.titulo}` : ''}\n${f.texto}`);
  return [
    { role: 'system', content: INSTRUCCIONES },
    {
      role: 'user',
      content: `Fragmentos de la norma:\n\n${bloques.join('\n\n---\n\n')}\n\n---\n\nPregunta: ${pregunta}`,
    },
  ];
}

/**
 * El texto de la respuesta. Por el binding, gpt-oss contesta en el formato de
 * la Responses API (output[] con un mensaje y su output_text); se aceptan
 * también las otras dos formas que usa Workers AI, para que cambiar MODELO no
 * obligue a tocar esto.
 */
export function textoDe(r) {
  if (typeof r === 'string') return r.trim();
  if (typeof r?.response === 'string') return r.response.trim();
  if (typeof r?.output_text === 'string') return r.output_text.trim();
  const partes = [];
  for (const o of Array.isArray(r?.output) ? r.output : []) {
    if (o?.type !== 'message') continue;
    for (const c of Array.isArray(o.content) ? o.content : []) {
      if (c?.type === 'output_text' && typeof c.text === 'string') partes.push(c.text);
    }
  }
  if (partes.length) return partes.join('\n').trim();
  const c = r?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c.trim() : '';
}

/**
 * Qué le pasó al modelo, en una palabra que la página sabe explicar. Los
 * códigos son los de Workers AI (/workers-ai/platform/errors/).
 */
export function motivo(e) {
  const m = String(e?.message ?? e);
  if (/\b3036\b|daily free allocation/i.test(m)) return 'cuota';
  if (/\b3040\b|capacity/i.test(m)) return 'ocupado';
  if (/\b5035\b|paid plan/i.test(m)) return 'modelo';
  return 'falla';
}

const ESTADO = { cuota: 429, ocupado: 503, modelo: 503, falla: 502 };

export function origenes(env) {
  return String(env?.ORIGENES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function responder(datos, estado, origen) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  if (origen) {
    h['Access-Control-Allow-Origin'] = origen;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return new Response(datos === null ? null : JSON.stringify(datos), {
    status: estado,
    headers: h,
  });
}

export default {
  async fetch(request, env) {
    // Solo las páginas de ORIGENES. Un navegador siempre manda Origin en un
    // POST de otra página, así que otro sitio no puede usar el asistente
    // desde el navegador de sus visitantes. (Un script fuera del navegador
    // puede inventarlo: contra eso está el tope diario de Cloudflare, que
    // corta el servicio pero nunca cobra.)
    const origen = request.headers.get('Origin');
    if (!origen || !origenes(env).includes(origen)) return responder({ error: 'origen' }, 403);

    if (request.method === 'OPTIONS') return responder(null, 204, origen);
    if (request.method !== 'POST') return responder({ error: 'metodo' }, 405, origen);

    const crudo = await request.text();
    if (crudo.length > TOPES.cuerpo) return responder({ error: 'grande' }, 413, origen);
    let cuerpo;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      return responder({ error: 'json' }, 400, origen);
    }
    const datos = validar(cuerpo);
    if (datos.error) return responder({ error: 'invalido' }, 400, origen);

    try {
      // El razonamiento de gpt-oss cuenta como texto generado y gasta cuota:
      // en «low» piensa poco, y para citar lo que ya viene escrito basta.
      const r = await env.AI.run(env.MODELO || MODELO, {
        input: armarEntrada(datos),
        reasoning: { effort: 'low' },
      });
      const respuesta = textoDe(r);
      if (!respuesta) {
        // Al registro de Cloudflare va solo la forma de la respuesta, nunca
        // la pregunta: si cambia el formato del modelo, aquí se ve cuál llegó.
        console.error('respuesta vacía; llegó:', Object.keys(r ?? {}).join(','));
        return responder({ error: 'vacia' }, 502, origen);
      }
      return responder({ respuesta }, 200, origen);
    } catch (e) {
      const m = motivo(e);
      console.error(`modelo (${m}):`, String(e?.message ?? e).slice(0, 300));
      return responder({ error: m }, ESTADO[m], origen);
    }
  },
};
