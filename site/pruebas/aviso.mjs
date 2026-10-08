// El candado del aviso de privacidad (src/pages/privacidad.astro). Regla de
// CLAUDE.md, decisión del dueño del 8 de octubre de 2026: ningún modelo ni
// proveedor nuevo recibe preguntas, y el sitio no se conecta a un servicio
// nuevo, sin que el aviso lo diga. La regla escrita depende de que alguien la
// lea; esto detiene la publicación por su cuenta. Compara el aviso compilado
// contra lo que de verdad se publica:
//
// - los modelos que nombran ia/wrangler.jsonc e ia/nucleo.js (@cf/<org>/<modelo>);
// - lo que el Worker tiene configurado: solo lo conocido, y sin registros por
//   petición ni trazas, que guardarían datos de cada consulta;
// - que el código del Worker no llame a nadie por su cuenta (una dirección en
//   el código) ni pase por AI Gateway;
// - las direcciones a las que el sitio compilado puede conectarse (la CSP de
//   la página), cada una con el servicio que el aviso tiene que nombrar.
//
// Si falla por algo nuevo: primero el aviso, con versión y fecha nuevas; luego
// la lista de aquí. No al revés.
//
//     cd site && npm run build && node pruebas/aviso.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASISTENTE } from '../src/lib/asistente.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, '..', 'dist');
const IA = path.join(AQUI, '..', '..', 'ia');

// A quién va cada dirección a la que el sitio puede conectarse. El aviso
// tiene que nombrar al servicio. Una dirección que no esté aquí es una
// conexión nueva.
const SERVICIOS = {
  'api.github.com': 'GitHub', // el número de estrellas
  'formspree.io': 'Formspree', // el formulario de /observaciones
  'cloudflareinsights.com': 'Cloudflare', // el contador de visitas
  'static.cloudflareinsights.com': 'Cloudflare', // su script
};
if (ASISTENTE) SERVICIOS[new URL(ASISTENTE).host] = 'Cloudflare'; // el asistente

// Lo que puede traer ia/wrangler.jsonc. Una conexión del Worker (KV, R2, D1,
// Vectorize, otro servicio…) sería una llave nueva.
const CONFIG_WORKER = new Set([
  'name',
  'main',
  'compatibility_date',
  'compatibility_flags',
  'ai',
  'vars',
  'ratelimits',
  'observability',
  'workers_dev',
  'preview_urls',
]);

let fallas = 0;
function prueba(nombre, fn) {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}
function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** El texto que lee el visitante, sin etiquetas. */
function textoDe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** JSON con comentarios y comas finales, como wrangler.jsonc. */
function leerJsonc(texto) {
  let limpio = '';
  for (let i = 0, cadena = false; i < texto.length; i++) {
    const c = texto[i];
    if (cadena) {
      limpio += c;
      if (c === '\\') limpio += texto[++i];
      else if (c === '"') cadena = false;
    } else if (c === '"') {
      cadena = true;
      limpio += c;
    } else if (c === '/' && texto[i + 1] === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      limpio += '\n';
    } else if (c === '/' && texto[i + 1] === '*') {
      i = texto.indexOf('*/', i + 2) + 1;
    } else limpio += c;
  }
  return JSON.parse(limpio.replace(/,(\s*[}\]])/g, '$1'));
}

/** El código sin comentarios: una dirección en un comentario no es una llamada. */
const sinComentarios = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const avisoHtml = path.join(DIST, 'privacidad', 'index.html');
afirmar(fs.existsSync(avisoHtml), 'no hay aviso compilado: ¿se compiló el sitio?');
const aviso = textoDe(fs.readFileSync(avisoHtml, 'utf8'));
const wranglerTexto = fs.readFileSync(path.join(IA, 'wrangler.jsonc'), 'utf8');
const wrangler = leerJsonc(wranglerTexto);
const codigoWorker = fs
  .readdirSync(IA)
  .filter((f) => f.endsWith('.js'))
  .map((f) => [f, fs.readFileSync(path.join(IA, f), 'utf8')]);

prueba('El aviso nombra cada modelo que puede contestar, y a quién es', () => {
  const modelos = new Map();
  for (const texto of [wranglerTexto, ...codigoWorker.map(([, js]) => js)]) {
    for (const [, org, nombre] of texto.matchAll(/@cf\/([\w.-]+)\/([\w.-]+)/g)) {
      modelos.set(nombre, org);
    }
  }
  afirmar(modelos.size >= 2, `solo ${modelos.size} modelos: ¿cambió cómo se nombran?`);
  const bajo = aviso.toLowerCase();
  for (const [nombre, org] of modelos) {
    afirmar(bajo.includes(nombre.toLowerCase()), `el aviso no nombra el modelo ${nombre}`);
    afirmar(bajo.includes(org.toLowerCase()), `el aviso no dice de quién es ${nombre} (${org})`);
  }
});

prueba('El Worker no tiene nada conectado que el aviso no diga', () => {
  const nuevas = Object.keys(wrangler).filter((k) => !CONFIG_WORKER.has(k));
  afirmar(!nuevas.length, `ia/wrangler.jsonc trae algo nuevo: ${nuevas.join(', ')}`);
  afirmar(
    wrangler.observability?.logs?.invocation_logs === false,
    'los registros por petición (invocation_logs) no están apagados'
  );
  afirmar(wrangler.observability?.traces?.enabled !== true, 'las trazas están encendidas');
  for (const [f, js] of codigoWorker) {
    const codigo = sinComentarios(js);
    const dir = codigo.match(/https?:\/\/[^\s'"`]+/);
    afirmar(!dir, `ia/${f} llama a una dirección: ${dir?.[0]}`);
    afirmar(!/gateway/i.test(codigo), `ia/${f} usa AI Gateway`);
  }
});

prueba('Cada servicio al que se conecta el sitio está en el aviso', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const meta = html.match(/<meta[^>]+content-security-policy[^>]*>/i)?.[0] ?? '';
  const csp = meta.match(/content="([^"]*)"/)?.[1] ?? '';
  afirmar(csp.includes('connect-src'), 'no se encontró la CSP en la portada');
  const hosts = [...new Set([...csp.matchAll(/https:\/\/([^\s;'"]+)/g)].map((m) => m[1]))];
  afirmar(hosts.length, 'la CSP no nombra ningún servicio: ¿cambió su forma?');
  for (const host of hosts) {
    const servicio = SERVICIOS[host];
    afirmar(servicio, `conexión nueva del sitio: ${host}. Primero el aviso, luego esta lista`);
    afirmar(aviso.includes(servicio), `el aviso no nombra a ${servicio} (${host})`);
  }
});

prueba('Todas las páginas enlazan el aviso desde el pie', () => {
  for (const pagina of ['index.html', 'asistente/index.html', 'observaciones/index.html']) {
    const html = fs.readFileSync(path.join(DIST, pagina), 'utf8');
    afirmar(/href="[^"]*\/privacidad\/"/.test(html), `${pagina} no enlaza el aviso`);
  }
});

console.log(
  fallas
    ? `\n${fallas} pruebas del aviso de privacidad fallaron.`
    : '\nLas pruebas del aviso de privacidad pasaron.'
);
process.exit(fallas ? 1 : 0);
