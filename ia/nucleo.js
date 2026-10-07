// Todo lo del asistente menos su punto de entrada (agente.js): un Worker de
// Cloudflare que le pasa al modelo de Workers AI lo que manda la página, con
// las instrucciones de cada paso.
//
// Va aparte porque Cloudflare toma cada export del archivo principal como
// una entrada del Worker: un `export const TOPES` ahí impedía que arrancara
// («Incorrect type for map entry»). Aquí sí se puede exportar lo que usan
// las pruebas.
//
// El asistente recorre la norma como una persona con el libro, en tres pasos
// (la página los dirige: site/src/scripts/preguntar/chat.js):
//
//   articulos   lee el índice general y escoge de 1 a 3 artículos
//   secciones   lee el índice de esos artículos y escoge qué leer completo
//   responder   lee eso completo y contesta, citando cada dato
//
// Los índices y los textos salen del sitio (/data/ia/), no de aquí: el Worker
// no carga la norma ni gasta CPU en ella —el plan gratis da 10 ms por
// petición—. Aquí solo se revisa lo que llega, se ponen las instrucciones y
// se llama al modelo.
//
// Lo gratis tiene un tope diario (10 000 «neuronas» de Workers AI). Al
// llegar, Cloudflare no cobra: el modelo responde con el error 3036 hasta las
// 00:00 UTC, y la página lo dice.
//
// Configuración (ia/wrangler.jsonc):
//   AI        el modelo, enlazado por Cloudflare (binding de Workers AI)
//   MODELO    cuál; si Cloudflare lo retira del plan gratis, se cambia aquí
//   ORIGENES  las páginas que pueden usarlo, separadas por comas

export const MODELO = '@cf/openai/gpt-oss-20b';

export const PASOS = ['articulos', 'secciones', 'responder'];

// Lo que se acepta de la página. Topes holgados para lo que ella manda
// (PRESUPUESTO y TOPE_INDICE en site/src/scripts/preguntar/): están para que
// nadie llame al Worker con un libro entero y se acabe la cuota de un golpe.
export const TOPES = {
  cuerpo: 80_000,
  pregunta: 500,
  // La conversación anterior: las últimas preguntas y respuestas, recortadas.
  historia: 3,
  historiaPregunta: 500,
  historiaRespuesta: 1_500,
  indice: { articulos: 12_000, secciones: 26_000 },
  fragmentos: 10,
  ref: 80,
  titulo: 600,
  texto: 9_000,
  total: 26_000,
};

// Una referencia es lo que el modelo copia entre corchetes y la página
// convierte en enlace: «310-15», «Tabla 310-15(b)(16)», «Figura 230-1»,
// «Definición: Acometida». Sin corchetes ni saltos de línea, que romperían
// la cita.
const REF = /^[\p{L}\p{N} .,:;()'«»/+\-–]+$/u;

const QUIEN =
  'Eres el asistente de una guía de consulta de la NOM-001-SEDE-2012, Instalaciones Eléctricas (utilización), la norma oficial mexicana.';

const INSTRUCCIONES = {
  articulos: `${QUIEN} Vas a buscar la respuesta en la norma como lo haría una persona con el libro: primero en el índice.

Abajo está el índice general. Cada renglón empieza con una clave: el número de un artículo (por ejemplo 240) o C10, AA, AB, AC o T para el cierre de la norma. Lee la pregunta (y la conversación anterior, si la hay) y escoge de 1 a 3 claves donde muy probablemente esté la respuesta. Las definiciones de términos están en 100.

Contesta SOLO con las claves, separadas por comas, sin explicar nada. Ejemplo: 240, 310`,

  secciones: `${QUIEN} Ya escogiste los artículos; abajo está su índice detallado: secciones, incisos con título, tablas y figuras, cada uno con su identificador al principio del renglón.

Escoge lo que necesitas leer completo para contestar la pregunta: hasta 6 identificadores. Prefiere el inciso exacto cuando lo veas (por ejemplo 240-4(d)) y agrega las tablas que tengan los valores que se preguntan. Si nada sirve, contesta NADA.

Contesta SOLO con los identificadores, uno por renglón, escritos exactamente como aparecen en el índice, sin explicar nada.`,

  responder: `${QUIEN} Contestas en español, claro y breve (menos de 250 palabras), SOLO con lo que dicen los fragmentos de la norma que vienen en el mensaje. Cada renglón de un fragmento empieza con su identificador entre corchetes.

Reglas:
1. No uses nada que no esté en los fragmentos: ni otras normas, ni el NEC, ni lo que sepas por tu cuenta.
2. Cita cada dato con el identificador más preciso entre corchetes, escrito exactamente como aparece, por ejemplo [240-4(d)(3)] o [Tabla 310-15(b)(16)].
3. Copia los valores (calibres, ampacidades, distancias, tensiones) tal como vienen. No los calcules, no los redondees, no los conviertas.
4. Si los fragmentos no alcanzan para contestar, dilo («Lo que leí de la norma no lo dice») y sugiere qué buscar. No adivines.
5. No des por buena una instalación concreta: la decisión es de quien la diseña y de la Unidad de Verificación.
6. Texto plano: sin Markdown, sin tablas, sin encabezados. Si hace falta una lista, cada punto en su renglón empezando con guion.`,
};

// Controles y caracteres de formato (ancho cero, marcas bidi), como en el
// formulario de observaciones; el salto de línea se queda, porque una tabla
// llega renglón por renglón.
const CONTROL = /(?!\n)[\p{Cc}\p{Cf}]/gu;
const limpio = (s) => String(s).replace(CONTROL, '').trim();
const texto = (v) => (typeof v === 'string' ? limpio(v) : '');

function validarHistoria(lista) {
  if (lista === undefined) return [];
  if (!Array.isArray(lista) || lista.length > TOPES.historia) return null;
  const out = [];
  for (const h of lista) {
    const p = texto(h?.p);
    const r = texto(h?.r);
    if (!p || p.length > TOPES.historiaPregunta || r.length > TOPES.historiaRespuesta) return null;
    out.push({ p, r });
  }
  return out;
}

function validarFragmentos(lista) {
  if (!Array.isArray(lista) || !lista.length || lista.length > TOPES.fragmentos) {
    return { error: 'fragmentos' };
  }
  const fragmentos = [];
  let total = 0;
  for (const f of lista) {
    if (!f || typeof f !== 'object') return { error: 'fragmento' };
    const ref = texto(f.ref);
    const titulo = texto(f.titulo);
    const t = texto(f.texto);
    if (!ref || ref.length > TOPES.ref || !REF.test(ref)) return { error: 'ref' };
    if (titulo.length > TOPES.titulo) return { error: 'titulo' };
    if (!t || t.length > TOPES.texto) return { error: 'texto' };
    total += t.length;
    fragmentos.push({ ref, titulo, texto: t });
  }
  if (total > TOPES.total) return { error: 'total' };
  return { fragmentos };
}

/**
 * Lo que mandó la página, revisado. Devuelve { paso, pregunta, historia,
 * indice | fragmentos } o { error } con la razón, que no se le enseña a
 * nadie: la página solo distingue «no se pudo».
 *
 * Sin `paso` es «responder»: así contestaba la primera versión, y una página
 * guardada en el navegador de alguien puede seguir mandándolo así un rato.
 */
export function validar(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') return { error: 'cuerpo' };
  const paso = cuerpo.paso ?? 'responder';
  if (!PASOS.includes(paso)) return { error: 'paso' };
  const pregunta = texto(cuerpo.pregunta);
  if (!pregunta || pregunta.length > TOPES.pregunta) return { error: 'pregunta' };
  const historia = validarHistoria(cuerpo.historia);
  if (!historia) return { error: 'historia' };
  if (paso === 'responder') {
    const f = validarFragmentos(cuerpo.fragmentos);
    return f.error ? f : { paso, pregunta, historia, fragmentos: f.fragmentos };
  }
  const indice = texto(cuerpo.indice);
  if (!indice || indice.length > TOPES.indice[paso]) return { error: 'indice' };
  return { paso, pregunta, historia, indice };
}

/** La entrada del modelo, en el formato de la Responses API. */
export function armarEntrada({ paso = 'responder', pregunta, historia = [], indice, fragmentos }) {
  const antes = historia.length
    ? `Conversación anterior:\n${historia
        .map((h) => `Pregunta: ${h.p}${h.r ? `\nRespuesta: ${h.r}` : ''}`)
        .join('\n\n')}\n\n---\n\n`
    : '';
  const material =
    paso === 'responder'
      ? `Fragmentos de la norma:\n\n${fragmentos
          .map((f) => `[${f.ref}]${f.titulo ? ` ${f.titulo}` : ''}\n${f.texto}`)
          .join('\n\n---\n\n')}`
      : `${paso === 'articulos' ? 'Índice general' : 'Índice de los artículos escogidos'}:\n\n${indice}`;
  return [
    { role: 'system', content: INSTRUCCIONES[paso] },
    { role: 'user', content: `${material}\n\n---\n\n${antes}Pregunta: ${pregunta}` },
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

/** Atiende una petición de la página. Ver agente.js. */
export async function atender(request, env) {
  // Solo las páginas de ORIGENES. Un navegador siempre manda Origin en un
  // POST de otra página, así que otro sitio no puede usar el asistente
  // desde el navegador de sus visitantes. (Un script fuera del navegador
  // puede inventarlo: contra eso está el tope diario de Cloudflare, que
  // corta el servicio pero nunca cobra.)
  const origen = request.headers.get('Origin');
  if (!origen || !origenes(env).includes(origen)) return responder({ error: 'origen' }, 403);
  try {
    return await contestar(request, env, origen);
  } catch (e) {
    // Lo que no se previó. Sin esto, Cloudflare devuelve su propia página de
    // error, sin el permiso CORS, y la página solo puede decir «no me pude
    // conectar»: no se sabe si fue la red, el Worker o el modelo.
    console.error('falla no prevista:', String(e?.stack ?? e).slice(0, 500));
    return responder({ error: 'falla' }, 500, origen);
  }
}

async function contestar(request, env, origen) {
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
    const inicio = Date.now();
    const r = await env.AI.run(env.MODELO || MODELO, {
      input: armarEntrada(datos),
      reasoning: { effort: 'low' },
    });
    // Cuánto tardó y cuánto leyó y escribió el modelo, al registro: la página
    // se rinde a los 90 s, y la cuota diaria se gasta por palabra.
    const uso = r?.usage
      ? `, ${r.usage.input_tokens ?? '?'} + ${r.usage.output_tokens ?? '?'} tokens`
      : '';
    console.log(`modelo (${datos.paso}): ${Date.now() - inicio} ms${uso}`);
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
}
