// La conversación de /preguntar. El asistente recorre la norma como una
// persona con el libro, en tres consultas al modelo (Worker: ia/nucleo.js):
//
// 1. Lee el índice general (/data/ia/indice.json) y escoge de 1 a 3
//    artículos.
// 2. Lee el índice de esos artículos (/data/ia/<clave>.json): secciones,
//    incisos con título, tablas. Escoge qué leer completo.
// 3. Lee eso completo —incisos numerados, tablas renglón por renglón— y
//    contesta citando cada dato. lectura.js convierte lo que pide en lo que
//    se le manda, y le suma las tablas que cita lo que va a leer («no menor
//    a lo de la Tabla 250-122»).
//
// Con los índices de 1 y 2 van unas pistas: dónde encuentra el buscador de
// la guía las palabras de la pregunta. El índice general solo dice «210
// Circuitos derivados»; el buscador sabe que la falla a tierra está en el
// 210-8.
//
// Si en 1 o 2 no pide nada que exista, la página busca por su cuenta con el
// buscador de siempre (buscarPregunta + pasajes.js) y el paso 3 sigue con eso.
//
// La respuesta se parte en párrafos y citas (respuesta.js) y se pinta con
// textContent: es texto de un modelo y no se interpreta como HTML. Debajo
// van siempre las partes de la norma que leyó, con su enlace: también cuando
// el asistente falla, que es cuando más sirven.
import { base } from '../base.js';
import { buscarPregunta, fragmentos as textosListos, load } from '../buscador/indice.js';
import { href } from '../buscador/resultados.js';
import {
  articuloDeTabla,
  bloquePistas,
  citables,
  clavesPedidas,
  conTablasCitadas,
  fragmentosDe,
  indiceCombinado,
  LECTURA,
  partesPedidas,
  pistasDe,
  TOPE_INDICE,
  tablasCitadas,
} from './lectura.js';
import { elegir, palabrasClave } from './pasajes.js';
import { bloques, normRef, trozos } from './respuesta.js';

const raiz = document.querySelector('[data-asistente]');
const URL_ASISTENTE = raiz?.dataset.asistente || '';
const form = document.getElementById('preg-form');
const campo = document.getElementById('preg-campo');
const boton = document.getElementById('preg-enviar');
const chat = document.getElementById('preg-chat');
const cerrado = document.getElementById('preg-cerrado');
const guia = document.getElementById('preg-guia');
const nueva = document.getElementById('preg-nueva');

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
    'Por hoy se acabaron las respuestas: el asistente es gratuito y tiene un cupo diario para todos. Vuelve después de las 6 de la tarde (hora del centro de México).',
  ocupado:
    'El servicio que corre el modelo está saturado en este momento. Intenta de nuevo en un minuto.',
  modelo: 'El asistente no está disponible por ahora.',
  lento: 'El asistente tardó demasiado en contestar. Intenta de nuevo en un momento.',
  red: 'Tu pregunta no llegó al asistente: el navegador no pudo comunicarse con él. Si estás en una red de oficina o de empresa, puede estar bloqueándolo; prueba con otra red o con los datos del celular.',
  tope: `Llegaste al tope de ${TOPE} preguntas al día en este navegador. El cupo del asistente es de todos; mañana se libera. Mientras, el buscador de arriba sigue funcionando.`,
  nada: 'No encontré nada en la norma para esa pregunta. Prueba a decirlo de otra forma, o con el término que usa la norma (por ejemplo «conductor de puesta a tierra» en vez de «tierra física»).',
  falla: 'El asistente no pudo contestar esta vez. Intenta de nuevo en un momento.',
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

// Lo que el asistente lee: el índice general y, por clave, el índice y el
// texto completo de un artículo (src/pages/data/ia/). Se guardan para la
// siguiente pregunta.
let general = null;
const cargarGeneral = () => {
  general ??= fetch(`${base}/data/ia/indice.json`).then((r) => {
    if (!r.ok) throw new Error(`índice: ${r.status}`);
    return r.json();
  });
  general.catch(() => {
    general = null;
  });
  return general;
};
const paquetes = new Map();
const cargarClave = (clave) => {
  if (!paquetes.has(clave)) {
    const p = fetch(`${base}/data/ia/${encodeURIComponent(clave)}.json`).then((r) => {
      if (!r.ok) throw new Error(`${clave}: ${r.status}`);
      return r.json();
    });
    p.catch(() => paquetes.delete(clave));
    paquetes.set(clave, p);
  }
  return paquetes.get(clave);
};

// La conversación: las últimas preguntas y respuestas van con cada consulta,
// para que «¿y para 12 AWG?» sepa de qué se hablaba. Topes en ia/nucleo.js.
const historia = [];
const RECUERDA = 2;

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

function pintarFuentes(caja, elegidos, contesto) {
  if (!elegidos.length) return;
  const d = el('details', 'preg-fuentes');
  d.append(
    el(
      'summary',
      null,
      contesto
        ? `Lo que leyó de la norma (${elegidos.length})`
        : `Lo que encontré en la norma para tu pregunta, sin respuesta del asistente (${elegidos.length})`
    )
  );
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
  // gpt-oss tarda unos segundos, pero con el servicio cargado puede esperar
  // turno. Minuto y medio sin nada es que algo se colgó; el Worker anota en
  // su registro cuánto tardó cada respuesta.
  const alto = new AbortController();
  const reloj = setTimeout(() => alto.abort(), 90_000);
  let r;
  try {
    r = await fetch(URL_ASISTENTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: alto.signal,
    });
  } catch {
    throw falla(alto.signal.aborted ? 'lento' : 'red');
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

// «¿Algo está mal en esta respuesta?» lleva al formulario de /observaciones
// con la pregunta, la respuesta y lo que leyó ya escritos. Viajan por
// sessionStorage, que solo puede escribir este mismo sitio, y no por la URL,
// que cualquiera puede armar: el formulario solo acepta de la URL las
// referencias que generan los botones del sitio (observaciones/limpieza.js),
// y «Respuesta del asistente» es una.
function botonReportar(pregunta, respuesta, leidas) {
  const b = el('button', 'preg-reportar', '¿Algo está mal en esta respuesta? Repórtalo');
  b.type = 'button';
  b.addEventListener('click', () => {
    try {
      sessionStorage.setItem(
        'obs-asistente',
        JSON.stringify({
          pregunta,
          respuesta: respuesta.slice(0, 1500),
          leyo: leidas.map((f) => f.ref).join(', '),
        })
      );
    } catch {}
    const ref = encodeURIComponent('Respuesta del asistente');
    location.href = `${base}/observaciones/?ref=${ref}&de=${encodeURIComponent(`${base}/preguntar/`)}`;
  });
  return b;
}

let ocupado = false;

// Los números se quedan fuera de la búsqueda (ver buscarPregunta), pero no
// del recorte: con ellos pasajes.js escoge el renglón del 20 A.
const palabrasDe = (pregunta) => palabrasClave(pregunta).filter((k) => !/^\d+$/.test(k));

// Las pistas del buscador para los pasos 1 y 2. El índice del buscador pesa:
// si en unos segundos no ha llegado, se pregunta sin pistas.
async function pistas(pregunta) {
  const espera = new Promise((listo) => setTimeout(() => listo([]), 6000));
  const busca = buscarPregunta(pregunta, palabrasDe(pregunta)).catch(() => []);
  return pistasDe(await Promise.race([busca, espera]));
}

// El respaldo: lo que encuentra el buscador de siempre, recortado. Para cuando
// el modelo no pidió nada que exista.
async function respaldo(pregunta) {
  await load();
  await textosListos();
  const [resultados, tablasIA] = await Promise.all([
    buscarPregunta(pregunta, palabrasDe(pregunta)),
    cargarTablas(),
  ]);
  return elegir(resultados, pregunta, tablasIA);
}

// Lo que se lee en el paso 3: lo que pidió y las tablas que eso cita. Una
// tabla de otro artículo («la Tabla 402-5» desde el 240-5(a)) baja ese
// artículo; si no llega, se lee sin ella.
async function leerPedidas(r2, paqs, todas) {
  const pedidas = partesPedidas(r2, paqs);
  if (!pedidas.length || pedidas.length >= LECTURA.partes) return pedidas;
  const ya = new Set(paqs.map((p) => p.clave));
  const otras = [...new Set(tablasCitadas(pedidas).map(articuloDeTabla))]
    .filter((k) => todas.includes(k) && !ya.has(k))
    .slice(0, 2);
  const mas = await Promise.all(otras.map((k) => cargarClave(k).catch(() => null)));
  return conTablasCitadas(pedidas, [...paqs, ...mas.filter(Boolean)]);
}

const CIERRE = {
  C10: 'del Capítulo 10',
  AA: 'del Apéndice A',
  AB: 'del Apéndice B',
  AC: 'del Apéndice C',
  T: 'de los Títulos de cierre',
};
const nombreClave = (k) => CIERRE[k] || `del artículo ${k}`;
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0]);

async function preguntar(pregunta) {
  const turno = el('li', 'preg-turno');
  turno.append(el('p', 'preg-q', pregunta));
  const caja = el('div', 'preg-r');
  const estado = el('p', 'preg-estado', 'Leyendo el índice de la norma…');
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

  const antes = historia.slice(-RECUERDA);
  let leidas = [];
  let contesto = false;
  try {
    anotar();
    // Paso 1: el índice general, con las pistas del buscador.
    const [{ indice, claves: todas }, halladas] = await Promise.all([
      cargarGeneral(),
      pistas(pregunta),
    ]);
    const r1 = await pedir({
      paso: 'articulos',
      pregunta,
      historia: antes,
      indice: indice + bloquePistas(halladas.map((p) => p.general)),
    });
    const claves = clavesPedidas(r1, todas);

    // Paso 2: el índice de los artículos escogidos, con las pistas que caen
    // en ellos.
    if (claves.length) {
      estado.textContent = `Revisando el índice ${lista(claves.map(nombreClave))}…`;
      const paqs = await Promise.all(claves.map(cargarClave));
      const suyas = bloquePistas(
        halladas.filter((p) => claves.includes(p.clave)).map((p) => p.detalle)
      );
      const r2 = await pedir({
        paso: 'secciones',
        pregunta,
        historia: antes,
        indice: indiceCombinado(paqs, TOPE_INDICE - suyas.length) + suyas,
      });
      leidas = fragmentosDe(await leerPedidas(r2, paqs, todas));
    }

    // Si no pidió nada que exista, busca la página.
    if (!leidas.length) {
      estado.textContent = 'Buscando en la norma…';
      leidas = await respaldo(pregunta);
    }
    if (!leidas.length) {
      aviso('nada');
      return;
    }

    // Paso 3: leer y contestar.
    estado.textContent = `Leyendo ${lista(leidas.slice(0, 4).map((f) => f.ref))}${leidas.length > 4 ? '…' : ''} y redactando…`;
    const respuesta = await pedir({
      paso: 'responder',
      pregunta,
      historia: antes,
      // El título va en el primer renglón del texto: no se manda dos veces.
      fragmentos: leidas.map(({ ref, texto }) => ({ ref, titulo: '', texto })),
    });
    estado.remove();
    const enlaces = new Map();
    for (const [id, r] of [...citables(leidas), ...leidas.map((f) => [f.ref, f.r])]) {
      if (!enlaces.has(normRef(id))) enlaces.set(normRef(id), href(r));
    }
    pintarRespuesta(caja, respuesta, enlaces);
    caja.append(botonReportar(pregunta, respuesta, leidas));
    contesto = true;
    historia.push({ p: pregunta, r: respuesta.slice(0, 1400) });
    nueva.hidden = false;
  } catch (e) {
    aviso(e?.motivo || 'falla');
  } finally {
    pintarFuentes(caja, leidas, contesto);
  }
}

if (raiz && !URL_ASISTENTE) {
  cerrado.hidden = false;
} else if (raiz) {
  form.hidden = false;
  guia.hidden = false;
  // Un ejemplo se pone en el campo, no se manda: así no gasta cupo sin querer.
  for (const b of guia.querySelectorAll('[data-ejemplo]')) {
    b.addEventListener('click', () => {
      campo.value = b.dataset.ejemplo;
      campo.focus();
      campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
  // Empezar de nuevo: sin la conversación anterior, que si no se manda con
  // cada pregunta y puede confundir al cambiar de tema.
  nueva.addEventListener('click', () => {
    historia.length = 0;
    chat.replaceChildren();
    nueva.hidden = true;
    campo.focus();
  });
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
  // El índice general y el del buscador (para las pistas) se empiezan a
  // bajar en cuanto se enfoca el campo, no al mandar la primera pregunta.
  campo.addEventListener(
    'focus',
    () => {
      cargarGeneral().catch(() => {});
      load().catch(() => {});
    },
    { once: true }
  );
}
