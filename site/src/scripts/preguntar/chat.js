// La conversación con el asistente, dentro de la burbuja que aparece en
// todas las páginas (components/Asistente.astro; abrirla y cerrarla es de
// ../asistente/burbuja.js, que baja este módulo la primera vez que se abre).
// El asistente recorre la norma como una persona con el libro, en tres
// consultas al modelo (Worker: ia/nucleo.js):
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
//
// La conversación se guarda en sessionStorage: al abrir una cita se cambia
// de página, y al volver a abrir la burbuja sigue ahí. Se borra al cerrar la
// pestaña del navegador o con «Nueva conversación».
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

// Tope por navegador, como el del formulario de observaciones: que una sola
// persona no se acabe el cupo diario, que es de todos. Son 10 preguntas en
// 24 horas, contadas cada una desde que se hizo. El cupo de Cloudflare
// alcanza para unas 40 a 45 al día entre todos (unas 230 neuronas cada una,
// medido el 8 de octubre de 2026): con 20 por navegador, dos personas se lo
// acababan.
//
// Solo cuenta la pregunta a la que el Worker contestó algo: la que no llegó
// (sin red, red de oficina que lo bloquea) o la que no tuvo cupo no gastó
// nada. La primera versión contaba todas, y el dueño, probando, llegó al tope
// con cuatro preguntas del día más las fallidas de la víspera; por eso la
// llave cambió de nombre (preg-usadas → asis-usadas) y la cuenta empezó de
// nuevo.
const TOPE = 10;
const DIA = 24 * 60 * 60 * 1000;
const USADAS = 'asis-usadas';
const usadas = () => {
  try {
    const v = JSON.parse(localStorage.getItem(USADAS) || '[]');
    return Array.isArray(v) ? v.filter((t) => Date.now() - t < DIA) : [];
  } catch {
    return [];
  }
};
const anotar = () => {
  try {
    localStorage.setItem(USADAS, JSON.stringify([...usadas(), Date.now()]));
  } catch {}
};
// A qué hora se libera la siguiente: 24 horas después de la más vieja.
const libre = () => {
  const t = Math.min(...usadas()) + DIA;
  const hora = new Date(t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const hoy = new Date().toDateString() === new Date(t).toDateString();
  return hoy ? `hoy a las ${hora}` : `mañana a las ${hora}`;
};
// Y en cuánto tiempo, para la barra: «en 5 h 10 min».
const enCuanto = () => {
  const min = Math.ceil((Math.min(...usadas()) + DIA - Date.now()) / 60_000);
  if (min <= 1) return 'en un minuto';
  const h = Math.floor(min / 60);
  return h ? `en ${h} h${min % 60 ? ` ${min % 60} min` : ''}` : `en ${min} min`;
};
// Desde cuántas restantes la barra se pinta de aviso.
const AVISAR_DESDE = 3;

// Cuántas preguntas lleva este navegador hoy, contando la que va: 1, 2, 3…
// Va con la primera consulta de cada pregunta, y con eso el registro del
// Worker cuenta cuántos navegadores preguntaron (los de orden 1) y si alguien
// gasta mucho. Sale de las marcas del tope (USADAS), así que no se guarda
// nada más, y no identifica al navegador. El día es el de la cuota de
// Cloudflare (UTC).
//
// Hasta el 8 de octubre de 2026 iba un número al azar por navegador y por
// día, guardado en asis-navegador. Decisión del dueño: el número de orden
// dice lo mismo sin un dato que junte las preguntas de un navegador. El
// viejo se borra de quien lo tenga.
function orden() {
  const ahora = new Date();
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return usadas().filter((t) => t >= hoy).length + 1;
}
try {
  localStorage.removeItem('asis-navegador');
} catch {}

// La cuota de Cloudflare se reinicia a las 00:00 UTC: las 6 de la tarde en el
// centro de México, que no cambia de horario desde 2022.
const MENSAJES = {
  cuota:
    'Por hoy se acabaron las respuestas: el asistente es gratuito y tiene un cupo diario para todos. Vuelve después de las 6 de la tarde (hora del centro de México).',
  ocupado:
    'El servicio que corre el modelo está saturado en este momento. Intenta de nuevo en un minuto.',
  modelo: 'El asistente no está disponible por ahora.',
  lento: 'El asistente tardó demasiado en contestar. Intenta de nuevo en un momento.',
  rapido:
    'Llegaron muchas preguntas seguidas desde tu conexión. Espera un minuto y vuelve a intentar.',
  red: 'Tu pregunta no llegó al asistente: el navegador no pudo comunicarse con él. Si estás en una red de oficina o de empresa, puede estar bloqueándolo; prueba con otra red o con los datos del celular.',
  tope: () =>
    `Llegaste al tope de ${TOPE} preguntas en 24 horas en este navegador: el cupo del asistente es de todos. Puedes volver a preguntar ${libre()}. Mientras, el buscador de arriba sigue funcionando.`,
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
const RECUERDA = 2;
// Lo que se guarda para pintarla otra vez en la página siguiente.
const GUARDA = 'asis-conversacion';
const MAX_MENSAJES = 30;

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

function pintarTexto(caja, texto, refs) {
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

// Lo que leyó, como etiquetas con enlace. Cuando el asistente no contestó es
// lo único que hay, y lo dice.
function pintarFuentes(destino, fuentes, contesto) {
  if (!fuentes?.length) return;
  const d = el('div', 'asis-fuentes');
  d.append(el('span', 'asis-fuentes-txt', contesto ? 'Leyó:' : 'Lo que encontré en la norma:'));
  for (const f of fuentes) {
    const a = el('a', 'asis-fuente', f.ref);
    a.href = f.href;
    if (f.titulo && f.titulo !== f.ref) a.title = f.titulo;
    d.append(a);
  }
  destino.append(d);
}

async function pedir(url, cuerpo) {
  const falla = (motivo) => Object.assign(new Error(motivo), { motivo });
  // gpt-oss tarda unos segundos, pero con el servicio cargado puede esperar
  // turno. Minuto y medio sin nada es que algo se colgó; el Worker anota en
  // su registro cuánto tardó cada respuesta.
  const alto = new AbortController();
  const reloj = setTimeout(() => alto.abort(), 90_000);
  let r;
  try {
    r = await fetch(url, {
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
  // Quién redactó: solo lo dice el paso 3, y el chat lo pone debajo de la
  // respuesta.
  return { texto: j.respuesta, modelo: j.modelo || '', servicio: j.servicio || '' };
}

// «Reportar un error» lleva al formulario de /observaciones con la pregunta,
// la respuesta y lo que leyó ya escritos. Viajan por sessionStorage, que
// solo puede escribir este mismo sitio, y no por la URL, que cualquiera
// puede armar: el formulario solo acepta de la URL las referencias que
// generan los botones del sitio (observaciones/limpieza.js), y «Respuesta
// del asistente» es una. Al terminar, «volver» lleva a la página donde se
// estaba.
function botonReportar(m) {
  const b = el('button', 'asis-reportar');
  b.type = 'button';
  b.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>';
  b.append('¿Algo está mal? Repórtalo');
  b.addEventListener('click', () => {
    try {
      sessionStorage.setItem(
        'obs-asistente',
        JSON.stringify({
          pregunta: m.pregunta,
          respuesta: m.texto.slice(0, 1500),
          leyo: (m.fuentes || []).map((f) => f.ref).join(', '),
        })
      );
    } catch {}
    const ref = encodeURIComponent('Respuesta del asistente');
    location.href = `${base}/observaciones/?ref=${ref}&de=${encodeURIComponent(location.pathname)}`;
  });
  return b;
}

// «gpt-oss-120b · Cloudflare»: el modelo y el servicio que lo corre.
const quien = (r) => (r.servicio ? `${r.modelo} · ${r.servicio}` : r.modelo);

/** Un mensaje guardado, pintado: { rol: 'tu' | 'ia' | 'aviso', texto, … }. */
function pintarMensaje(m) {
  const li = el('li', `asis-msg asis-${m.rol === 'tu' ? 'tu' : 'ia'}`);
  if (m.rol === 'aviso') li.classList.add('asis-error');
  const burbuja = el('div', 'asis-burbuja');
  li.append(burbuja);
  if (m.rol === 'tu') {
    burbuja.textContent = m.texto;
    return li;
  }
  if (m.rol === 'aviso') {
    burbuja.append(el('p', null, m.texto));
    pintarFuentes(li, m.fuentes, false);
    return li;
  }
  pintarTexto(burbuja, m.texto, new Map(m.enlaces || []));
  if (m.modelo) li.append(el('p', 'asis-modelo', `Respondió ${quien(m)}`));
  pintarFuentes(li, m.fuentes, true);
  li.append(botonReportar(m));
  return li;
}

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

function leerConversacion() {
  try {
    const c = JSON.parse(sessionStorage.getItem(GUARDA) || 'null');
    if (c?.v === 1 && Array.isArray(c.mensajes) && Array.isArray(c.historia)) return c;
  } catch {}
  return { v: 1, mensajes: [], historia: [] };
}

/**
 * Arma la conversación dentro de la burbuja (raiz = .asis). Devuelve
 * { preguntar(texto) } para las sugerencias y la guía.
 */
export function iniciar(raiz) {
  const URL_ASISTENTE = raiz.dataset.asistente;
  const chat = raiz.querySelector('.asis-chat');
  const cuerpo = raiz.querySelector('.asis-cuerpo');
  const form = raiz.querySelector('.asis-form');
  const campo = raiz.querySelector('#asis-campo');
  const enviar = raiz.querySelector('.asis-enviar');
  const nueva = raiz.querySelector('[data-nueva]');
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');

  let conv = leerConversacion();
  let ocupado = false;

  // La barra de las preguntas de este navegador: cuántas lleva de TOPE y en
  // cuánto se libera la siguiente. Se repinta con cada pregunta contestada y
  // cada minuto mientras la burbuja está abierta.
  const cupo = raiz.querySelector('.asis-cupo');
  const barra = cupo.querySelector('.asis-cupo-barra');
  const pintarCupo = () => {
    const n = Math.min(usadas().length, TOPE);
    cupo.querySelector('.asis-cupo-cuenta').textContent = `${n} de ${TOPE}`;
    cupo.querySelector('.asis-cupo-libera').textContent = n ? `Se libera una ${enCuanto()}` : '';
    barra.querySelector('i').style.width = `${(n / TOPE) * 100}%`;
    barra.setAttribute('aria-valuemax', String(TOPE));
    barra.setAttribute('aria-valuenow', String(n));
    barra.setAttribute('aria-valuetext', `${n} de ${TOPE} preguntas`);
    cupo.classList.toggle('pocas', TOPE - n <= AVISAR_DESDE);
    cupo.hidden = false;
  };
  pintarCupo();
  setInterval(() => {
    if (!cupo.closest('[hidden]')) pintarCupo();
  }, 60_000);

  const guardar = () => {
    conv.mensajes = conv.mensajes.slice(-MAX_MENSAJES);
    try {
      sessionStorage.setItem(GUARDA, JSON.stringify(conv));
    } catch {}
  };
  const bajar = (li) => {
    const top = li ? li.offsetTop - 12 : cuerpo.scrollHeight;
    cuerpo.scrollTo({ top, behavior: quieto.matches ? 'auto' : 'smooth' });
  };
  const anotarMensaje = (m) => {
    conv.mensajes.push(m);
    guardar();
    const li = pintarMensaje(m);
    chat.append(li);
    nueva.hidden = false;
    return li;
  };

  for (const m of conv.mensajes) chat.append(pintarMensaje(m));
  nueva.hidden = !conv.mensajes.length;
  cuerpo.scrollTop = cuerpo.scrollHeight;

  // Lo que se necesita para la primera pregunta, desde que se abre.
  cargarGeneral().catch(() => {});
  load().catch(() => {});

  async function preguntar(pregunta) {
    anotarMensaje({ rol: 'tu', texto: pregunta });
    const pensando = el('li', 'asis-msg asis-ia asis-pensando');
    const burbuja = el('div', 'asis-burbuja');
    const puntos = el('span', 'asis-puntos');
    puntos.setAttribute('aria-hidden', 'true');
    puntos.append(el('i'), el('i'), el('i'));
    const estado = el('span', 'asis-estado', 'Leyendo el índice de la norma…');
    burbuja.append(puntos, estado);
    pensando.append(burbuja);
    chat.append(pensando);
    bajar();

    const terminar = (m) => {
      pensando.remove();
      bajar(anotarMensaje(m));
    };
    const aviso = (motivo, fuentes = []) => {
      const m = MENSAJES[motivo] || MENSAJES.falla;
      terminar({ rol: 'aviso', texto: typeof m === 'function' ? m() : m, fuentes });
    };

    if (usadas().length >= TOPE) {
      aviso('tope');
      return;
    }

    const antes = conv.historia.slice(-RECUERDA);
    let leidas = [];
    const fuentes = () =>
      leidas.map((f) => ({ ref: f.ref, titulo: f.titulo || '', href: href(f.r) }));
    try {
      // Paso 1: el índice general, con las pistas del buscador.
      const [{ indice, claves: todas }, halladas] = await Promise.all([
        cargarGeneral(),
        pistas(pregunta),
      ]);
      const r1 = (
        await pedir(URL_ASISTENTE, {
          paso: 'articulos',
          pregunta,
          historia: antes,
          indice: indice + bloquePistas(halladas.map((p) => p.general)),
          orden: orden(),
        })
      ).texto;
      // El Worker contestó: ya gastó del cupo.
      anotar();
      pintarCupo();
      const claves = clavesPedidas(r1, todas);

      // Paso 2: el índice de los artículos escogidos, con las pistas que caen
      // en ellos.
      if (claves.length) {
        estado.textContent = `Revisando el índice ${lista(claves.map(nombreClave))}…`;
        const paqs = await Promise.all(claves.map(cargarClave));
        const suyas = bloquePistas(
          halladas.filter((p) => claves.includes(p.clave)).map((p) => p.detalle)
        );
        const r2 = (
          await pedir(URL_ASISTENTE, {
            paso: 'secciones',
            pregunta,
            historia: antes,
            indice: indiceCombinado(paqs, TOPE_INDICE - suyas.length) + suyas,
          })
        ).texto;
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
      const redacto = await pedir(URL_ASISTENTE, {
        paso: 'responder',
        pregunta,
        historia: antes,
        // El título va en el primer renglón del texto: no se manda dos veces.
        fragmentos: leidas.map(({ ref, texto }) => ({ ref, titulo: '', texto })),
      });
      const respuesta = redacto.texto;
      const enlaces = new Map();
      for (const [id, r] of [...citables(leidas), ...leidas.map((f) => [f.ref, f.r])]) {
        if (!enlaces.has(normRef(id))) enlaces.set(normRef(id), href(r));
      }
      conv.historia = [...conv.historia, { p: pregunta, r: respuesta.slice(0, 1400) }].slice(
        -RECUERDA
      );
      terminar({
        rol: 'ia',
        pregunta,
        texto: respuesta,
        modelo: redacto.modelo,
        servicio: redacto.servicio,
        enlaces: [...enlaces],
        fuentes: fuentes(),
      });
    } catch (e) {
      aviso(e?.motivo || 'falla', fuentes());
    }
  }

  async function mandar(texto) {
    const pregunta = String(texto || '')
      .trim()
      .slice(0, 500);
    if (!pregunta || ocupado) return;
    ocupado = true;
    enviar.disabled = true;
    try {
      await preguntar(pregunta);
    } finally {
      ocupado = false;
      enviar.disabled = false;
    }
  }

  // El campo crece con lo que se escribe, hasta unos cinco renglones.
  const crecer = () => {
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 132)}px`;
  };
  campo.addEventListener('input', crecer);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = campo.value;
    if (!texto.trim() || ocupado) return;
    campo.value = '';
    crecer();
    mandar(texto);
  });
  // Enter manda la pregunta, como en cualquier chat; Mayús+Enter es un
  // salto de línea.
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  // Empezar de nuevo: sin la conversación anterior, que si no se manda con
  // cada pregunta y puede confundir al cambiar de tema.
  nueva.addEventListener('click', () => {
    if (ocupado) return;
    conv = { v: 1, mensajes: [], historia: [] };
    try {
      sessionStorage.removeItem(GUARDA);
    } catch {}
    chat.replaceChildren();
    nueva.hidden = true;
    campo.focus();
  });

  return { preguntar: mandar };
}
