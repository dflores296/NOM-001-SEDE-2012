// Los servicios de IA que puede usar el asistente y en qué orden.
//
// Hay dos filas, porque los pasos no necesitan lo mismo (ver nucleo.js):
//
//   escoger    pasos 1 y 2: leer un índice y copiar identificadores. Basta un
//              modelo chico y rápido.
//   redactar   paso 3: leer la norma con cuidado y contestar. Un modelo grande.
//
// Cada consulta va al primero de su fila que tenga clave y cupo; si ese está
// lleno, saturado, tarda demasiado o no existe, pasa al siguiente. Así el
// cupo gratis de cada servicio se suma al de los demás, y si uno cambia sus
// condiciones el asistente sigue con los otros.
//
// Las filas de verdad viven en wrangler.jsonc (FILA_ESCOGER, FILA_REDACTAR):
// cambiar el orden o un modelo retirado es cambiar una línea ahí. Las de aquí
// son las de respaldo, por si esas variables faltan.
//
// Las claves NO van aquí ni en wrangler.jsonc: el dueño las pega en el panel
// de Cloudflare (nom-001-ia → Settings → Variables and Secrets) con el nombre
// de `clave`. Un servicio sin su clave está apagado: la fila se lo salta.
//
// Antes de agregar un modelo a una fila, pasa la batería de preguntas de
// prueba (ver ia/README.md, «La puerta»): en una norma eléctrica, uno que
// confunda incisos no puede entrar.
//
// Mistral y Google están fuera de las filas por decisión del dueño (8 de
// octubre de 2026), hasta que tenga asesoría legal: en su plan gratis pueden
// usar las preguntas para entrenar, y las condiciones de Google prohíben su
// API en un sitio que probablemente abran menores de 18 años. Se quedan
// aquí para que volver a meterlos sea cambiar una fila, pero sin estar en
// una fila no se usan aunque su clave esté en el panel. Una prueba lo cuida
// (ia/pruebas/agente.mjs).

export const SERVICIOS = {
  // Workers AI, por el binding `AI`: no lleva clave ni dirección.
  cloudflare: { nombre: 'Cloudflare' },
  // Los demás contestan en el formato de chat de OpenAI.
  groq: {
    nombre: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    clave: 'GROQ_KEY',
  },
  openrouter: {
    nombre: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    clave: 'OPENROUTER_KEY',
  },
  mistral: {
    nombre: 'Mistral',
    url: 'https://api.mistral.ai/v1/chat/completions',
    clave: 'MISTRAL_KEY',
  },
  google: {
    nombre: 'Google',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    clave: 'GOOGLE_KEY',
  },
};

// El último de «redactar» es el chico de Cloudflare: si todo lo demás falla,
// redacta él, como antes de que hubiera filas.
export const FILAS = {
  escoger: [
    'groq:llama-3.1-8b-instant',
    'cloudflare:@cf/openai/gpt-oss-20b',
    'groq:openai/gpt-oss-20b',
    'openrouter:openai/gpt-oss-20b:free',
  ].join(', '),
  redactar: [
    'cloudflare:@cf/openai/gpt-oss-120b',
    'groq:openai/gpt-oss-120b',
    'groq:llama-3.3-70b-versatile',
    'openrouter:deepseek/deepseek-chat-v3.1:free',
    'cloudflare:@cf/openai/gpt-oss-20b',
  ].join(', '),
};

/**
 * Una fila escrita como en wrangler.jsonc —«servicio:modelo» separados por
 * comas— en [{ servicio, modelo }]. Un servicio que no existe se ignora.
 */
export function leerFila(texto) {
  const out = [];
  for (const pieza of String(texto ?? '').split(',')) {
    const t = pieza.trim();
    const i = t.indexOf(':');
    if (i < 1) continue;
    const servicio = t.slice(0, i).trim().toLowerCase();
    const modelo = t.slice(i + 1).trim();
    if (SERVICIOS[servicio] && modelo) out.push({ servicio, modelo });
  }
  return out;
}

// Cómo se llama cada modelo para quien lee el chat. Uno que no esté aquí se
// nombra por la última parte de su identificador.
const NOMBRES = [
  [/gpt-oss-120b/, 'gpt-oss-120b'],
  [/gpt-oss-20b/, 'gpt-oss-20b'],
  [/llama-3\.1-8b/, 'Llama 3.1 8B'],
  [/llama-3\.3-70b/, 'Llama 3.3 70B'],
  [/llama-4-scout/, 'Llama 4 Scout'],
  [/llama-4-maverick/, 'Llama 4 Maverick'],
  [/deepseek-chat/, 'DeepSeek V3'],
  [/deepseek-r1/, 'DeepSeek R1'],
  [/qwen3/i, 'Qwen3'],
  [/kimi-k2/, 'Kimi K2'],
  [/mistral-small/, 'Mistral Small'],
  [/mistral-medium/, 'Mistral Medium'],
  [/mistral-large/, 'Mistral Large'],
  [/gemini-flash-lite|gemini-[\d.]+-flash-lite/, 'Gemini Flash-Lite'],
  [/gemini-flash|gemini-[\d.]+-flash/, 'Gemini Flash'],
  [/gemini-.*pro/, 'Gemini Pro'],
];

/** El nombre de un modelo para el chat: «gpt-oss-120b», «Llama 3.3 70B». */
export function nombreModelo(modelo) {
  for (const [re, nombre] of NOMBRES) if (re.test(modelo)) return nombre;
  return String(modelo)
    .split('/')
    .pop()
    .replace(/:free$/, '');
}
