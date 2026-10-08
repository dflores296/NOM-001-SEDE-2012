// La burbuja del asistente (components/Asistente.astro), en todas las
// páginas: abrirla, cerrarla y recordar si estaba abierta al cambiar de
// página. Lo que pregunta y pinta vive en ../preguntar/chat.js, que se baja
// la primera vez que se abre: quien solo lee la norma no lo descarga.
//
// En el teléfono el panel ocupa la pantalla: la página de abajo no se
// desliza y el foco se queda adentro. En la computadora es una ventana
// encima de la página, y se puede seguir leyendo al lado.
//
// Cualquier botón del sitio con data-abrir-asistente lo abre, y uno con
// data-preguntar="…" lo abre y manda esa pregunta (la guía, /asistente).
const raiz = document.querySelector('.asis');
const URL_ASISTENTE = raiz?.dataset.asistente || '';

const ABIERTO = 'asis-abierto';
const guardar = (k, v) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {}
};
const leer = (k) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};

if (raiz && URL_ASISTENTE) {
  const lanzar = raiz.querySelector('.asis-lanzar');
  const panel = raiz.querySelector('.asis-panel');
  const campo = raiz.querySelector('#asis-campo');
  const form = raiz.querySelector('.asis-form');
  const telefono = matchMedia('(max-width: 640px)');

  // chat.js, una sola vez. Devuelve su { preguntar }.
  // Si no baja (sin red), se vuelve a intentar la próxima vez que se abra.
  let chat = null;
  let listo = false;
  let pendiente = false;
  const cargar = () => {
    chat ??= import('../preguntar/chat.js')
      .then((m) => {
        const c = m.iniciar(raiz);
        listo = true;
        if (pendiente) form.requestSubmit();
        pendiente = false;
        return c;
      })
      .catch((e) => {
        chat = null;
        throw e;
      });
    return chat;
  };

  const modal = () => {
    const si = telefono.matches && !panel.hidden;
    panel.setAttribute('aria-modal', si ? 'true' : 'false');
    document.documentElement.classList.toggle('asis-modal', si);
  };

  function abrir({ foco = true } = {}) {
    if (!panel.hidden) {
      if (foco) campo.focus();
      return cargar();
    }
    panel.hidden = false;
    lanzar.setAttribute('aria-expanded', 'true');
    raiz.classList.add('abierto');
    raiz.querySelector('.asis-punto').hidden = true;
    guardar(ABIERTO, '1');
    modal();
    if (foco) campo.focus({ preventScroll: true });
    return cargar();
  }

  function cerrar({ devolverFoco = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    lanzar.setAttribute('aria-expanded', 'false');
    raiz.classList.remove('abierto');
    guardar(ABIERTO, '0');
    modal();
    if (devolverFoco) lanzar.focus({ preventScroll: true });
  }

  // Con señal lenta, chat.js puede tardar en bajar, y quien ya escribió y
  // mandó la pregunta la perdía: Enter dejaba un renglón de más y el botón
  // recargaba la página. Mientras baja, mandar la deja en el campo y sale
  // sola en cuanto el chat está listo. Ya listo, esto no hace nada: lo
  // atiende chat.js.
  const antesDeTiempo = (e) => {
    if (listo) return;
    e.preventDefault();
    if (!campo.value.trim()) return;
    pendiente = true;
    cargar().catch(() => {});
  };
  form.addEventListener('submit', antesDeTiempo);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) antesDeTiempo(e);
  });

  lanzar.hidden = false;
  lanzar.addEventListener('click', () => (panel.hidden ? abrir().catch(() => {}) : cerrar()));
  raiz.querySelector('[data-cerrar]').addEventListener('click', () => cerrar());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      return;
    }
    // En el teléfono el panel tapa la página: Tab da la vuelta adentro.
    if (e.key !== 'Tab' || panel.getAttribute('aria-modal') !== 'true') return;
    const focos = [...panel.querySelectorAll('button, a[href], textarea')].filter(
      (x) => !x.disabled && x.offsetParent !== null
    );
    const [primero, ultimo] = [focos[0], focos.at(-1)];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });
  telefono.addEventListener('change', modal);

  // Abrir una cita: en el teléfono se cierra, para que se vea la norma; en
  // la computadora se queda abierta al lado. La conversación sigue igual.
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (telefono.matches) cerrar({ devolverFoco: false });
  });

  // Desde cualquier parte del sitio.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir-asistente], [data-preguntar]');
    if (!b || (panel.contains(b) && !b.dataset.preguntar)) return;
    e.preventDefault();
    const pregunta = b.dataset.preguntar;
    abrir({ foco: !pregunta })
      .then((c) => pregunta && c.preguntar(pregunta))
      .catch(() => {});
  });

  // Al cambiar de página: si estaba abierta, se abre igual, sin brincar el
  // teclado del teléfono; si estaba cerrada con conversación, un punto en la
  // burbuja lo dice.
  if (leer(ABIERTO) === '1') abrir({ foco: false }).catch(() => {});
  else if (leer('asis-conversacion')) raiz.querySelector('.asis-punto').hidden = false;
}
