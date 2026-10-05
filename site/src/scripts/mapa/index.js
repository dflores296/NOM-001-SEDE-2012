// El mapa 3D de /mapa: la red completa y el modo hilo, con su buscador, su
// recorrido y su panel. Solo se llama en una pantalla grande con mouse, y es
// aquí donde se descargan la librería 3D y los datos.
import { indexar, rotulo, rotuloLargo, titulo, hrefNodo, esc } from './datos.js';
import { armarHilo } from './hilo.js';
import { crearSugeridor } from './sugerencias.js';

export async function iniciar(raiz) {
  const base = raiz.dataset.base;
  const grupos = JSON.parse(raiz.dataset.grupos);
  const color = Object.fromEntries(grupos.map((x) => [x.g, x.color]));
  const nombreGrupo = Object.fromEntries(grupos.map((x) => [x.g, x.nombre]));
  const visor = raiz.querySelector('.mapa-visor');
  const lienzo = raiz.querySelector('.mapa-lienzo');
  const estado = raiz.querySelector('.mapa-estado');
  const $ = (s) => raiz.querySelector(s);

  let ForceGraph3D, SpriteText, datos;
  try {
    const [mod, spr, r] = await Promise.all([
      import('3d-force-graph'),
      import('three-spritetext'),
      fetch(`${base}/mapa.json`),
    ]);
    ForceGraph3D = mod.default;
    SpriteText = spr.default;
    datos = await r.json();
  } catch {
    estado.textContent = 'No se pudo cargar el mapa.';
    return;
  }

  // ------------------------------------------------------------ índices
  const { porId, entran, salen, linksRed, red } = indexar(datos);
  const href = (n) => hrefNodo(n, base);

  // ------------------------------------------------------------- estado
  let modo = 'red'; // 'red': la norma entera · 'hilo': un punto y sus hilos
  let centro = null; // id del punto de partida
  let dir = 'ambas'; // 'ambas' | 'entran' | 'salen'
  let prof = 1; // 1 o 2 saltos
  let recorrido = []; // ids visitados; el último es el centro
  let foco = null; // en la red: el punto bajo el cursor
  const vecinos = new Set();
  const lineas = new Set();
  const ocultos = new Set();

  const mezcla = (hex, t) => {
    const a = parseInt(hex.slice(1), 16);
    const f = (c, d) => Math.round(c * t + d * (1 - t));
    return `rgb(${f((a >> 16) & 255, 13)},${f((a >> 8) & 255, 14)},${f(a & 255, 18)})`;
  };
  const apagado = Object.fromEntries(grupos.map((x) => [x.g, mezcla(x.color, 0.12)]));
  const idDe = (x) => (typeof x === 'object' ? x.id : x);

  // -------------------------------------------------------------- mapa
  // El punto central del hilo se ve siempre, aunque su capítulo esté
  // oculto: sin él, el hilo se queda sin eje.
  const visible = (n) => !n || n.id === centro || !ocultos.has(n.g);
  // Un extremo de línea puede venir como el punto mismo o, en el hilo,
  // como su identificador: sin resolverlo, ocultar un capítulo dejaba sus
  // líneas a la vista aunque sus puntos desaparecieran.
  const punto = (x) => (typeof x === 'object' ? x : porId.get(x));
  const lineaVisible = (l) => visible(punto(l.source)) && visible(punto(l.target));
  const G = ForceGraph3D({ controlType: 'orbit' })(lienzo)
    .backgroundColor('#0d0e12')
    .showNavInfo(false)
    .nodeId('id')
    .nodeRelSize(2.6)
    .nodeOpacity(0.95)
    .nodeResolution(12)
    .linkOpacity(0.16)
    .linkDirectionalParticleWidth(1.8)
    .linkDirectionalParticleSpeed(0.006)
    .warmupTicks(80)
    .cooldownTicks(220);

  // Etiqueta 3D de un punto del hilo: su identificador, siempre de frente.
  function etiqueta(n) {
    const s = new SpriteText(rotulo(n));
    const esCentro = n.id === centro;
    s.fontFace = '"Inter Variable", system-ui, sans-serif';
    s.fontWeight = '600';
    s.textHeight = esCentro ? 10 : 6.5;
    s.color = esCentro ? '#070707' : '#ffffff';
    s.backgroundColor = esCentro ? '#ffffff' : 'rgba(13,14,18,0.78)';
    s.padding = esCentro ? 3 : 2;
    s.borderRadius = 3;
    s.position.y = Math.cbrt(G.nodeVal()(n)) * G.nodeRelSize() + (esCentro ? 12 : 8);
    return s;
  }

  function pintarRed() {
    G.nodeVal((n) => (n.k === 'a' ? 7 + n.n * 0.5 : n.k === 'h' ? 7 : 0.7 + n.n * 0.45))
      .nodeColor((n) => (!foco || vecinos.has(n.id) ? color[n.g] : apagado[n.g]))
      .nodeVisibility(visible)
      .nodeThreeObject(null)
      .nodeLabel(
        (n) =>
          `<b style="font-family:var(--mono)">${esc(rotuloLargo(n))}</b>` +
          (titulo(n) ? ` · ${esc(titulo(n))}` : '') +
          `<br><span style="color:#aeaeb7">La citan ${(entran.get(n.id) || []).length} · cita a ${(salen.get(n.id) || []).length} · clic para seguir sus hilos</span>`
      )
      .linkVisibility((l) => !l.e && lineaVisible(l))
      .linkColor((l) =>
        lineas.has(l) ? '#ffffff' : foco ? '#1c1e25' : color[l.source.g] || '#9a9ca8'
      )
      .linkWidth((l) => (lineas.has(l) ? 0.6 : 0))
      .linkDirectionalParticles((l) => (lineas.has(l) ? 3 : 0));
    G.cooldownTicks(220);
    G.d3Force('link')
      .distance((l) => (l.e ? 4 : 60))
      .strength((l) => (l.e ? 0.9 : 0.04));
    G.d3Force('charge').strength(-22);
  }

  function resaltar(n) {
    foco = n;
    vecinos.clear();
    lineas.clear();
    if (n) {
      vecinos.add(n.id);
      for (const id of entran.get(n.id) || []) vecinos.add(id);
      for (const id of salen.get(n.id) || []) vecinos.add(id);
      for (const l of linksRed)
        if (!l.e && (idDe(l.source) === n.id || idDe(l.target) === n.id)) lineas.add(l);
    }
    G.nodeColor(G.nodeColor())
      .linkWidth(G.linkWidth())
      .linkDirectionalParticles(G.linkDirectionalParticles())
      .linkColor(G.linkColor());
  }

  function pintarHilo() {
    G.nodeVal((n) => (n.id === centro ? 30 : n.k === 'a' ? 8 : 2 + n.n * 0.25))
      .nodeColor((n) => color[n.g])
      .nodeVisibility(visible)
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n) => etiqueta(n))
      .nodeLabel(
        (n) =>
          `<b style="font-family:var(--mono)">${esc(rotuloLargo(n))}</b>` +
          (titulo(n) ? ` · ${esc(titulo(n))}` : '') +
          (n.id !== centro
            ? '<br><span style="color:#aeaeb7">Clic para seguir desde aquí</span>'
            : '')
      )
      .linkVisibility(lineaVisible)
      .linkColor(() => '#c8cad0')
      .linkWidth(0.35)
      .linkDirectionalParticles(2);
    // Todo el hilo va en posiciones fijas: no hay nada que simular.
    G.cooldownTicks(0);
  }

  // ---------------------------------------------------- moverse por el hilo
  let encuadrar = false;
  G.onEngineStop(() => {
    if (!encuadrar) return;
    encuadrar = false;
    G.zoomToFit(700, modo === 'hilo' ? 70 : 30);
  });

  function verRed({ historial = true } = {}) {
    modo = 'red';
    centro = null;
    recorrido = [];
    foco = null;
    vecinos.clear();
    lineas.clear();
    G.graphData(red);
    pintarRed();
    encuadrar = true;
    actualizarUI();
    if (historial) history.pushState(null, '', location.pathname);
  }

  function seguir(id, { historial = true, mantener = false } = {}) {
    const n = porId.get(id);
    if (!n) return;
    modo = 'hilo';
    centro = id;
    if (!mantener) {
      const i = recorrido.indexOf(id);
      recorrido = i >= 0 ? recorrido.slice(0, i + 1) : [...recorrido, id];
    }
    G.graphData(armarHilo(id, { porId, entran, salen }, { dir, prof }));
    pintarHilo();
    // Sin simulación, el encuadre va en cuanto el lienzo tenga su tamaño
    // (y otra vez si el lienzo cambia, ver el ResizeObserver).
    requestAnimationFrame(() => requestAnimationFrame(() => G.zoomToFit(600, 60)));
    actualizarUI();
    llenarPanel(n);
    if (historial) history.pushState(null, '', `#${encodeURIComponent(id)}`);
  }

  G.onNodeHover((n) => {
    lienzo.style.cursor = n && !(modo === 'hilo' && n.id === centro) ? 'pointer' : '';
    if (modo === 'red') resaltar(n);
  });
  G.onNodeClick((n) => {
    if (n.id !== centro) seguir(n.id);
  });

  // ------------------------------------------------------------- interfaz
  // La guía y el aviso de inicio van justo encima de la leyenda, que ocupa
  // una o dos líneas según el ancho (mapa.css).
  const ley = $('.mapa-ley');
  new ResizeObserver(() => raiz.style.setProperty('--ley-alto', `${ley.offsetHeight}px`)).observe(
    ley
  );
  const panel = $('.mapa-panel');
  function actualizarUI() {
    const hilo = modo === 'hilo';
    $('.mapa-hilo-ctl').hidden = !hilo;
    $('.mapa-red').hidden = !hilo;
    $('.mapa-guia').hidden = !hilo;
    $('.mapa-inicio').hidden = hilo;
    $('.mapa-recorrido').hidden = !hilo;
    panel.hidden = !hilo;
    raiz.classList.toggle('con-panel', hilo);
    if (hilo) $('.mapa-guia-c').textContent = rotuloLargo(porId.get(centro));
    for (const b of raiz.querySelectorAll('[data-dir]'))
      b.setAttribute('aria-pressed', String(b.dataset.dir === dir));
    for (const b of raiz.querySelectorAll('[data-prof]'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.prof) === prof));

    const ol = $('.mapa-recorrido ol');
    ol.replaceChildren();
    const desde = Math.max(0, recorrido.length - 7);
    if (desde > 0) {
      const li = document.createElement('li');
      li.textContent = '…';
      ol.append(li);
    }
    for (const id of recorrido.slice(desde)) {
      const n = porId.get(id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = rotulo(n);
      b.title = titulo(n);
      if (id === centro) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => {
        if (id !== centro) seguir(id);
      });
      li.append(b);
      ol.append(li);
    }
    $('.mapa-atras').disabled = recorrido.length < 2;
  }

  // La frase de cada cita (mapa-citas.json). Pesa más que la red, así que
  // se pide la primera vez que se abre el panel y, al llegar, se vuelve a
  // llenar el panel que esté abierto.
  let citas = null;
  let pidiendoCitas = false;
  function cargarCitas() {
    if (citas || pidiendoCitas) return;
    pidiendoCitas = true;
    fetch(`${base}/mapa-citas.json`)
      .then((r) => r.json())
      .then((c) => {
        citas = c;
        if (modo === 'hilo' && centro) llenarPanel(porId.get(centro));
      })
      .catch(() => {
        pidiendoCitas = false;
      });
  }

  // La cita tal como la dice la norma: la frase, con la referencia marcada,
  // de qué inciso sale si no es la sección misma y cuántas citas más hay
  // entre los dos puntos.
  function frase(de, a) {
    const c = citas?.[`${de}>${a}`];
    if (!c) return null;
    const [inciso, texto, i, j, mas] = c;
    const p = document.createElement('p');
    p.className = 'mp-cita';
    const m = document.createElement('mark');
    m.textContent = texto.slice(i, j);
    p.append(texto.slice(0, i), m, texto.slice(j));
    const pie = [];
    if (inciso !== de) pie.push(`en ${inciso}`);
    if (mas) pie.push(`y ${mas} ${mas === 1 ? 'cita más' : 'citas más'}`);
    if (pie.length) {
      const s = document.createElement('small');
      s.textContent = pie.join(' · ');
      p.append(s);
    }
    return p;
  }

  function lista(ul, ids, sentido, ocultas) {
    ul.replaceChildren();
    if (!ids.length) {
      const li = document.createElement('li');
      li.className = 'mp-vacio';
      li.textContent = ocultas ? 'Todas son de capítulos ocultos' : 'Ninguna';
      ul.append(li);
      return;
    }
    const orden = ids
      .map((id) => porId.get(id))
      .filter(Boolean)
      .sort((a, b) => b.n - a.n);
    for (const n of orden) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const i = document.createElement('i');
      i.style.background = color[n.g];
      const id = document.createElement('b');
      id.textContent = rotulo(n);
      const t = document.createElement('span');
      t.textContent = titulo(n);
      b.append(i, id, t);
      b.addEventListener('click', () => seguir(n.id));
      li.append(b);
      const f = sentido === 'entran' ? frase(n.id, centro) : frase(centro, n.id);
      if (f) li.append(f);
      ul.append(li);
    }
  }

  let llenoCon = null;
  function llenarPanel(n) {
    panel.querySelector('.mp-id').textContent = rotuloLargo(n);
    panel.querySelector('.mp-id').style.color = color[n.g];
    panel.querySelector('.mp-t').textContent = titulo(n) || rotuloLargo(n);
    panel.querySelector('.mp-art').textContent =
      n.k === 's'
        ? `Artículo ${n.a} · Capítulo ${n.g !== 'g' ? nombreGrupo[n.g] : 'general'}`
        : n.k === 'a'
          ? `Capítulo ${n.g !== 'g' ? nombreGrupo[n.g] : 'general'}`
          : 'Cierre de la norma';
    panel.querySelector('.mp-ir').href = href(n);
    // Las de los capítulos ocultos en la leyenda no se listan; el conteo
    // dice cuántas son.
    const deVisible = (id) => !ocultos.has(porId.get(id)?.g);
    const todasIn = entran.get(n.id) || [];
    const todasOut = salen.get(n.id) || [];
    const inn = todasIn.filter(deVisible);
    const out = todasOut.filter(deVisible);
    const ocIn = todasIn.length - inn.length;
    const ocOut = todasOut.length - out.length;
    panel.querySelector('.mp-n-in').textContent = inn.length;
    panel.querySelector('.mp-n-out').textContent = out.length;
    panel.querySelector('.mp-oc-in').textContent = ocIn ? ` · ${ocIn} ocultas` : '';
    panel.querySelector('.mp-oc-out').textContent = ocOut ? ` · ${ocOut} ocultas` : '';
    const y = n.id === llenoCon ? panel.scrollTop : 0;
    lista(panel.querySelector('.mp-in'), inn, 'entran', ocIn);
    lista(panel.querySelector('.mp-out'), out, 'salen', ocOut);
    // Al llegar las frases se vuelve a llenar el mismo panel: que no salte
    // arriba si ya se estaba leyendo.
    panel.scrollTop = y;
    llenoCon = n.id;
    cargarCitas();
  }

  for (const b of raiz.querySelectorAll('[data-dir]')) {
    b.addEventListener('click', () => {
      dir = b.dataset.dir;
      if (centro) seguir(centro, { historial: false, mantener: true });
    });
  }
  for (const b of raiz.querySelectorAll('[data-prof]')) {
    b.addEventListener('click', () => {
      prof = Number(b.dataset.prof);
      if (centro) seguir(centro, { historial: false, mantener: true });
    });
  }
  $('.mapa-red').addEventListener('click', () => verRed());
  $('.mapa-atras').addEventListener('click', () => {
    if (recorrido.length > 1) seguir(recorrido[recorrido.length - 2]);
  });

  // Pantalla completa del visor; el icono cambia con el estado (CSS).
  const btnFull = $('.mapa-full');
  btnFull.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else visor.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const t = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    btnFull.title = t;
    btnFull.setAttribute('aria-label', t);
  });

  // Leyenda: muestra u oculta capítulos, en la red, en el hilo y en el
  // panel. Clic: uno. Doble clic o clic derecho: solo ese, y otra vez,
  // todos (el doble clic llega después de dos clics, que se anulan entre sí).
  const chips = [...raiz.querySelectorAll('.chip-cap')];
  const todosG = chips.map((b) => b.dataset.g);
  const btnTodos = $('.chip-todos');
  function fijarOcultos(gs) {
    ocultos.clear();
    for (const g of gs) ocultos.add(g);
    for (const b of chips) b.setAttribute('aria-pressed', String(!ocultos.has(b.dataset.g)));
    btnTodos.hidden = ocultos.size === 0;
    G.nodeVisibility(G.nodeVisibility()).linkVisibility(G.linkVisibility());
    if (modo === 'hilo' && centro) llenarPanel(porId.get(centro));
  }
  function alternar(g) {
    fijarOcultos(ocultos.has(g) ? [...ocultos].filter((x) => x !== g) : [...ocultos, g]);
  }
  function soloEste(g) {
    const yaSolo = !ocultos.has(g) && ocultos.size === todosG.length - 1;
    fijarOcultos(yaSolo ? [] : todosG.filter((x) => x !== g));
  }
  for (const b of chips) {
    b.addEventListener('click', () => alternar(b.dataset.g));
    b.addEventListener('dblclick', () => soloEste(b.dataset.g));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      soloEste(b.dataset.g);
    });
  }
  btnTodos.addEventListener('click', () => fijarOcultos([]));

  // ----------------------------------------------- buscador con sugerencias
  const input = $('.mapa-busca input');
  const sug = $('.mapa-sug');
  const msg = $('.mapa-msg');
  const sugerir = crearSugeridor(datos.nodes);
  let opciones = [];
  let marcada = -1;

  function pintarSug() {
    sug.replaceChildren();
    opciones.forEach((n, j) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `mapa-op-${j}`;
      li.setAttribute('aria-selected', String(j === marcada));
      const i = document.createElement('i');
      i.style.background = color[n.g];
      const b = document.createElement('b');
      b.textContent = rotuloLargo(n);
      const t = document.createElement('span');
      t.textContent = titulo(n);
      const em = document.createElement('em');
      em.textContent = `${(entran.get(n.id) || []).length} citas`;
      li.append(i, b, t, em);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        elegir(n);
      });
      sug.append(li);
    });
    sug.hidden = !opciones.length;
    input.setAttribute('aria-expanded', String(!sug.hidden));
    if (marcada >= 0) input.setAttribute('aria-activedescendant', `mapa-op-${marcada}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function elegir(n) {
    opciones = [];
    marcada = -1;
    pintarSug();
    input.value = '';
    input.blur();
    msg.textContent = '';
    if (ocultos.has(n.g)) alternar(n.g);
    recorrido = [];
    seguir(n.id);
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    opciones = q.length >= 2 ? sugerir(q) : [];
    marcada = opciones.length ? 0 : -1;
    msg.textContent =
      q.length >= 2 && !opciones.length
        ? 'No aparece en el mapa. Solo están las secciones que citan o son citadas.'
        : '';
    pintarSug();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opciones.length) return;
      e.preventDefault();
      marcada = (marcada + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      pintarSug();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opciones[marcada]) elegir(opciones[marcada]);
    } else if (e.key === 'Escape') {
      opciones = [];
      pintarSug();
      input.blur();
    }
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      opciones = [];
      pintarSug();
    }, 120)
  );

  // Escape fuera del buscador: un paso atrás, y del primero a la red.
  addEventListener('keydown', (e) => {
    if (
      e.key !== 'Escape' ||
      modo !== 'hilo' ||
      document.activeElement === input ||
      document.fullscreenElement
    )
      return;
    if (recorrido.length > 1) seguir(recorrido[recorrido.length - 2]);
    else verRed();
  });

  // ------------------------------------------- enlaces y botón «atrás»
  // /mapa/#250-122 abre el hilo de esa sección, y el botón «atrás» del
  // navegador recorre el camino de vuelta.
  const desdeHash = () => porId.get(decodeURIComponent(location.hash.slice(1)));
  addEventListener('popstate', () => {
    const n = desdeHash();
    if (n) seguir(n.id, { historial: false });
    else verRed({ historial: false });
  });

  // Al cambiar el lienzo —al cargar, al abrir o cerrar el panel, en
  // pantalla completa— el hilo se vuelve a encuadrar: sus posiciones son
  // fijas, así que no hay simulación que lo haga sola.
  let reencuadre = 0;
  new ResizeObserver(() => {
    G.width(lienzo.clientWidth).height(lienzo.clientHeight);
    if (modo !== 'hilo') return;
    clearTimeout(reencuadre);
    reencuadre = setTimeout(() => G.zoomToFit(400, 60), 80);
  }).observe(lienzo);
  estado.hidden = true;

  const inicial = desdeHash();
  if (inicial) seguir(inicial.id, { historial: false });
  else verRed({ historial: false });
}
