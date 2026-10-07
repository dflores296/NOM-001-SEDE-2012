// La conversación de /preguntar. Por cada pregunta:
//
// 1. El índice del buscador de siempre (buscarPregunta, en
//    buscador/indice.js) encuentra las secciones, tablas y definiciones que
//    tienen que ver, aquí en el navegador.
// 2. pasajes.js las recorta a lo que importa para la pregunta.
// 3. El Worker del asistente (ia/agente.js) le pide al modelo una respuesta
//    hecha solo con eso.
// 4. respuesta.js la parte en párrafos y citas, y aquí se pinta con
//    textContent: es texto de un modelo y no se interpreta como HTML.
//
// Debajo de cada respuesta van siempre las partes de la norma consultadas,
// con su enlace: también cuando el asistente falla o se acabó la cuota, que
// es cuando más sirven.
import { base } from '../base.js';
import { buscarPregunta, fragmentos as textosListos, load } from '../buscador/indice.js';
import { href } from '../buscador/resultados.js';
import { elegir, palabrasClave } from './pasajes.js';
import { bloques, normRef, trozos } from './respuesta.js';

const raiz = document.querySelector('[data-asistente]');
const URL_ASISTENTE = raiz?.dataset.asistente || '';
const form = document.getElementById('preg-form');
const campo = document.getElementById('preg-campo');
const boton = document.getElementById('preg-enviar');
const chat = document.getElementById('preg-chat');
const cerrado = document.getElementById('preg-cerrado');

// Tope por navegador, como el del formulario de observaciones: que una sola
// persona no se acabe el cupo diario, que es de todos.
const TOPE = 20;
const DIA = 24 * 60 * 60 * 1000;
const usadas = () => {
  try {
    const v = JSON.parse(localStorage.getItem('preg-usadas') || '[]');
    return Array.isArray(v) ? v.filter((t) => Date.now() - t < DIA) : [];
  } catch {
    return [];
  }
};
const anotar = () => {
  try {
    localStorage.setItem('preg-usadas', JSON.stringify([...usadas(), Date.now()]));
  } catch {}
};

// La cuota de Cloudflare se reinicia a las 00:00 UTC: las 6 de la tarde en el
// centro de México, que no cambia de horario desde 2022.
const MENSAJES = {
  cuota:
    'Por hoy se acabaron las respuestas: el asistente es gratuito y tiene un cupo diario para todos. Vuelve después de las 6 de la tarde (hora del centro de México). Mientras, abajo están las partes de la norma que encontré para tu pregunta.',
  ocupado:
    'El servicio que corre el modelo está saturado en este momento. Intenta de nuevo en un minuto; abajo están las partes de la norma que encontré.',
  modelo:
    'El asistente no está disponible por ahora. Abajo están las partes de la norma que encontré para tu pregunta.',
  red: 'No me pude conectar con el asistente. Revisa tu conexión e intenta de nuevo; abajo están las partes de la norma que encontré.',
  tope: `Llegaste al tope de ${TOPE} preguntas al día en este navegador. El cupo del asistente es de todos; mañana se libera. Mientras, el buscador de arriba sigue funcionando.`,
  nada: 'No encontré nada en la norma con esas palabras. Prueba a decirlo de otra forma, o con el término que usa la norma (por ejemplo «conductor de puesta a tierra» en vez de «tierra física»).',
  falla:
    'No pude obtener una respuesta del asistente. Abajo están las partes de la norma que encontré para tu pregunta.',
};

// Las tablas renglón por renglón (src/pages/data/tablas-ia.json.js). Sin
// ellas se manda el texto aplanado del buscador, que algo dice.
let tablas = null;
const cargarTablas = () => {
  tablas ??= fetch(`${base}/data/tablas-ia.json`)
    .then((r) => r.json())
    .catch(() => ({}));
  return tablas;
};

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto) e.textContent = texto;
  return e;
}

function pintarTrozos(destino, linea, refs) {
  for (const t of trozos(linea, refs)) {
    if (t.href) {
      const a = el('a', null, t.texto);
      a.href = t.href;
      destino.append(a);
    } else {
      destino.append(document.createTextNode(t.texto));
    }
  }
}

function pintarRespuesta(caja, texto, refs) {
  caja.append(el('p', 'preg-ia', 'Respuesta generada por IA · verifícala en la norma'));
  for (const b of bloques(texto)) {
    if (b.tipo === 'ul') {
      const ul = el('ul');
      for (const item of b.items) {
        const li = el('li');
        pintarTrozos(li, item, refs);
        ul.append(li);
      }
      caja.append(ul);
    } else {
      const p = el('p');
      pintarTrozos(p, b.texto, refs);
      caja.append(p);
    }
  }
}

function pintarFuentes(caja, elegidos) {
  if (!elegidos.length) return;
  const d = el('details', 'preg-fuentes');
  d.append(el('summary', null, `Partes de la norma consultadas (${elegidos.length})`));
  const ul = el('ul');
  for (const f of elegidos) {
    const li = el('li');
    const a = el('a', null, f.ref);
    a.href = href(f.r);
    li.append(a);
    if (f.titulo && f.titulo !== f.ref) li.append(document.createTextNode(` · ${f.titulo}`));
    ul.append(li);
  }
  d.append(ul);
  caja.append(d);
}

async function pedir(cuerpo) {
  const falla = (motivo) => Object.assign(new Error(motivo), { motivo });
  // gpt-oss tarda unos segundos; más de un minuto es que algo se colgó.
  const alto = new AbortController();
  const reloj = setTimeout(() => alto.abort(), 60_000);
  let r;
  try {
    r = await fetch(URL_ASISTENTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: alto.signal,
    });
  } catch {
    throw falla('red');
  } finally {
    clearTimeout(reloj);
  }
  let j = null;
  try {
    j = await r.json();
  } catch {}
  if (!r.ok || typeof j?.respuesta !== 'string') throw falla(j?.error || 'falla');
  return j.respuesta;
}

let ocupado = false;

async function preguntar(pregunta) {
  const turno = el('li', 'preg-turno');
  turno.append(el('p', 'preg-q', pregunta));
  const caja = el('div', 'preg-r');
  const estado = el('p', 'preg-estado', 'Buscando en la norma…');
  caja.append(estado);
  turno.append(caja);
  chat.append(turno);
  turno.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  const aviso = (motivo) => {
    estado.replaceWith(el('p', 'preg-error', MENSAJES[motivo] || MENSAJES.falla));
  };

  if (usadas().length >= TOPE) {
    aviso('tope');
    return;
  }

  let elegidos = [];
  try {
    await load();
    await textosListos();
    // Los números se quedan fuera de la búsqueda (ver buscarPregunta), pero
    // no del recorte: con ellos pasajes.js escoge el renglón del 20 A.
    const palabras = palabrasClave(pregunta).filter((k) => !/^\d+$/.test(k));
    const [resultados, tablasIA] = await Promise.all([
      buscarPregunta(pregunta, palabras),
      cargarTablas(),
    ]);
    elegidos = elegir(resultados, pregunta, tablasIA);
    if (!elegidos.length) {
      aviso('nada');
      return;
    }
    estado.textContent = 'Redactando la respuesta…';
    anotar();
    const respuesta = await pedir({
      pregunta,
      fragmentos: elegidos.map(({ ref, titulo, texto }) => ({ ref, titulo, texto })),
    });
    estado.remove();
    pintarRespuesta(caja, respuesta, new Map(elegidos.map((f) => [normRef(f.ref), href(f.r)])));
  } catch (e) {
    aviso(e?.motivo || 'falla');
  } finally {
    pintarFuentes(caja, elegidos);
  }
}

if (raiz && !URL_ASISTENTE) {
  cerrado.hidden = false;
} else if (raiz) {
  form.hidden = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pregunta = campo.value.trim();
    if (!pregunta || ocupado) return;
    ocupado = true;
    boton.disabled = true;
    campo.value = '';
    try {
      await preguntar(pregunta);
    } finally {
      ocupado = false;
      boton.disabled = false;
      campo.focus();
    }
  });
  // Enter manda la pregunta, como en cualquier chat; Mayús+Enter es un
  // salto de línea.
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  // El índice del buscador pesa: se empieza a bajar en cuanto se ve el campo,
  // no al mandar la primera pregunta.
  campo.addEventListener('focus', () => load().catch(() => {}), { once: true });
}
