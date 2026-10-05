// El mapa 3D de /mapa: la red completa y el modo hilo, con su buscador, su
// recorrido y su panel. Solo se llama en una pantalla grande con mouse, y es
// aquí donde se descargan la librería 3D y los datos.
import { indexar, rotulo, rotuloLargo, titulo, hrefNodo, esc } from './datos.js';
import { armarHilo } from './hilo.js';
import { crearSugeridor } from './sugerencias.js';

export async function iniciar(raiz) {
  const base = raiz.dataset.base;
  const grupos = JSON.parse(raiz.dataset.grupos);
  // Los colores dependen del tema del sitio (ver «tema» abajo): en claro,
  // los tonos oscuros de data-grupos y los colores del fondo y los textos
  // salen de las variables --m-* de mapa.css.
  let color = {};
  let apagado = {};
  let tinta = {};
  const nombreGrupo = Object.fromEntries(grupos.map((x) => [x.g, x.nombre]));
  const visor = raiz.querySelector('.mapa-visor');
  const lienzo = raiz.querySelector('.mapa-lienzo');
  const estado = raiz.querySelector('.mapa-estado');
  const $ = (s) => raiz.querySelector(s);

  let ForceGraph3D, SpriteText, THREE, datos;
  try {
    const [mod, spr, three, r] = await Promise.all([
      import('3d-force-graph'),
      import('three-spritetext'),
      import('three'),
      fetch(`${base}/mapa.json`),
    ]);
    ForceGraph3D = mod.default;
    SpriteText = spr.default;
    THREE = three;
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
  // Vista en 3D (se puede girar) o en 2D (plana, de frente: nada queda
  // tapado detrás de otra cosa). Se recuerda en el navegador.
  let dims = 3;
  try {
    if (localStorage.getItem('mapa-dim') === '2') dims = 2;
  } catch {}

  // Un color mezclado con el fondo: los puntos que no son vecinos del que
  // está bajo el cursor se apagan así.
  const mezcla = (hex, t, fondo) => {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(fondo.slice(1), 16);
    const f = (s) => Math.round(((a >> s) & 255) * t + ((b >> s) & 255) * (1 - t));
    return `rgb(${f(16)},${f(8)},${f(0)})`;
  };
  const esClaro = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'claro' : !matchMedia('(prefers-color-scheme: dark)').matches;
  };
  function leerColores() {
    const css = (v) => getComputedStyle(raiz).getPropertyValue(v).trim();
    const claro = esClaro();
    color = Object.fromEntries(grupos.map((x) => [x.g, claro ? x.claro : x.color]));
    tinta = {
      fondo: css('--m-bg'),
      capa: `rgba(${css('--m-capa').split(' ').join(',')},0.9)`,
      texto: css('--m-texto'),
      texto2: css('--m-texto2'),
      hover: css('--m-hover'),
      onBg: css('--m-on-bg'),
      onTx: css('--m-on-tx'),
    };
    apagado = Object.fromEntries(grupos.map((x) => [x.g, mezcla(color[x.g], 0.14, tinta.fondo)]));
  }
  leerColores();
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
    .backgroundColor(tinta.fondo)
    .numDimensions(dims)
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

  if (dims === 2) G.controls().enableRotate = false;

  // Niebla de profundidad: lo lejano se funde con el fondo y se entiende qué
  // está adelante. Se mide con la distancia de la cámara al centro de la
  // vista (d) y el radio de lo que se ve (R): lo de enfrente (d − R) queda
  // nítido, el centro apenas se atenúa (14 %) y lo del fondo (d + R) llega
  // al 60 %, nunca desaparece. En 2D no hay profundidad que marcar.
  const niebla = new THREE.Fog(tinta.fondo, 1e7, 2e7);
  G.scene().fog = niebla;
  let radio = 500;
  let cuadros = 0;
  const ajustarNiebla = () => {
    const centroVista = G.controls().target;
    if (cuadros++ % 30 === 0) {
      let r = 0;
      for (const n of G.graphData().nodes) {
        if (n.x == null) continue;
        r = Math.max(
          r,
          Math.hypot(n.x - centroVista.x, n.y - centroVista.y, (n.z || 0) - centroVista.z)
        );
      }
      if (r > 0) radio = r;
    }
    const d = G.camera().position.distanceTo(centroVista);
    const cerca = d - 0.3 * radio;
    niebla.near = dims === 3 ? Math.max(1, cerca) : 1e7;
    niebla.far = dims === 3 ? Math.max(2, cerca + 2.17 * radio) : 2e7;
    requestAnimationFrame(ajustarNiebla);
  };
  requestAnimationFrame(ajustarNiebla);

  // ------------------------------------------------------------- tema
  // Al cambiar el tema del sitio (el interruptor o el del sistema) el mapa
  // cambia con él, sin recargar.
  function aplicarTema() {
    leerColores();
    G.backgroundColor(tinta.fondo);
    niebla.color.set(tinta.fondo);
    armarRotulos();
    G.nodeColor(G.nodeColor()).linkColor(G.linkColor());
    if (modo === 'hilo') {
      G.nodeThreeObject(G.nodeThreeObject());
      llenarPanel(porId.get(centro));
    }
  }
  new MutationObserver(aplicarTema).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);

  // Etiqueta 3D de un punto del hilo: su identificador, siempre de frente.
  function etiqueta(n) {
    const s = new SpriteText(rotulo(n));
    const esCentro = n.id === centro;
    s.fontFace = '"Inter Variable", system-ui, sans-serif';
    s.fontWeight = '600';
    s.textHeight = esCentro ? 10 : 6.5;
    s.color = esCentro ? tinta.onTx : tinta.texto;
    s.backgroundColor = esCentro ? tinta.onBg : tinta.capa;
    s.material.fog = false;
    s.padding = esCentro ? 3 : 2;
    s.borderRadius = 3;
    s.position.y = Math.cbrt(G.nodeVal()(n)) * G.nodeRelSize() + (esCentro ? 12 : 8);
    return s;
  }

  // ------------------------------------------------------------- acomodo
  // Dos formas de acomodar la red, además de las citas y la repulsión:
  // - «Por tema»: cada grupo de artículos que se citan entre sí (el campo c
  //   de mapa.json, ver lib/comunidades.js) jalado a su lugar en un círculo;
  //   los 8 grandes adentro, los chicos en un anillo de afuera.
  // - «Por capítulo»: cada capítulo de la leyenda a su lugar en el círculo.
  // - «En orden»: los artículos en una espiral del 90 al 940, como se leen
  //   en la norma; las citas se vuelven cuerdas entre partes lejanas. Aquí
  //   las citas jalan casi nada, para que no deshagan la espiral.
  // Con cualquiera, el mismo grupo cae siempre en el mismo lugar.
  const ACOMODOS = ['tema', 'capitulo', 'orden'];
  let acomodo = 'tema';
  try {
    const guardado = localStorage.getItem('mapa-acomodo');
    if (ACOMODOS.includes(guardado)) acomodo = guardado;
  } catch {}
  const artsOrden = [...new Set(datos.nodes.filter((n) => n.k === 'a').map((n) => n.a))].sort(
    (a, b) => a - b
  );
  // Dónde cae en la espiral el artículo de en medio de cada capítulo.
  const medioDe = new Map();
  for (const g of new Set(datos.nodes.map((n) => n.g))) {
    const arts = artsOrden.filter((a) =>
      datos.nodes.some((n) => n.k === 'a' && n.a === a && n.g === g)
    );
    if (arts.length) medioDe.set(g, artsOrden.indexOf(arts[arts.length >> 1]) / artsOrden.length);
  }
  const espiral = (t) => {
    const ang = t * Math.PI * 2 * 2.2 - Math.PI / 2;
    const r = 160 + t * 760;
    return [r * Math.cos(ang), -r * Math.sin(ang), 0];
  };
  const ordenG = grupos.map((x) => x.g);
  const nTemas = 1 + Math.max(...datos.nodes.map((n) => n.c ?? 0));
  const circulo = (i, total, r) => {
    const t = (2 * Math.PI * i) / total - Math.PI / 2;
    return [r * Math.cos(t), -r * Math.sin(t), 0];
  };
  const anclaDe = (n) => {
    if (acomodo === 'orden')
      return espiral(n.a == null ? 1.04 : artsOrden.indexOf(n.a) / artsOrden.length);
    if (acomodo === 'capitulo') return circulo(ordenG.indexOf(n.g), ordenG.length, 480);
    if (n.c == null) return [0, 0, 0];
    return n.c < 8 ? circulo(n.c, 8, 480) : circulo(n.c - 8 + 0.5, nTemas - 8, 880);
  };
  // Una fuerza que jala cada punto hacia su lugar, sin depender de d3.
  const fuerzaAncla = (() => {
    let nodos = [];
    const f = (alpha) => {
      const k = acomodo === 'orden' ? 0.3 : 0.15;
      for (const n of nodos) {
        const [x, y, z] = anclaDe(n);
        n.vx += (x - n.x) * k * alpha;
        n.vy += (y - n.y) * k * alpha;
        if (dims === 3) n.vz += (z - n.z) * 0.05 * alpha;
      }
    };
    f.initialize = (ns) => {
      nodos = ns;
    };
    return f;
  })();

  // El rótulo de cada grupo, en su centro: los artículos más citados del
  // tema («Art. 430 · 440 · 110») o el nombre del capítulo. Sin nombres
  // inventados: un tema se rotula con sus artículos.
  const rotulosGrupo = new Map();
  function textoGrupo(clave) {
    if (acomodo !== 'tema') return nombreGrupo[clave];
    const arts = datos.nodes
      .filter((n) => n.k === 'a' && n.c === clave)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((n) => n.a);
    return `Art. ${arts.join(' · ')}`;
  }
  const claveDe = (n) => (acomodo === 'tema' ? n.c : n.g);
  function armarRotulos() {
    for (const s of rotulosGrupo.values()) G.scene().remove(s);
    rotulosGrupo.clear();
    const claves =
      acomodo !== 'tema'
        ? ordenG
        : [...new Set(datos.nodes.map((n) => n.c))].filter(
            (c) => c != null && datos.nodes.filter((n) => n.k === 'a' && n.c === c).length >= 4
          );
    for (const k of claves) {
      const s = new SpriteText(textoGrupo(k));
      s.fontFace = '"Inter Variable", system-ui, sans-serif';
      s.fontWeight = '600';
      s.textHeight = 24;
      s.color = tinta.texto;
      s.backgroundColor = tinta.capa;
      s.material.fog = false;
      s.padding = 6;
      s.borderRadius = 4;
      s.material.depthWrite = false;
      s.material.depthTest = false;
      s.renderOrder = 10;
      G.scene().add(s);
      rotulosGrupo.set(k, s);
    }
    moverRotulos();
  }
  // Cada rótulo en el centro de los puntos visibles de su grupo, un poco
  // arriba; se esconde en el hilo o si su grupo entero está oculto.
  function moverRotulos() {
    const suma = new Map();
    if (modo === 'red') {
      for (const n of red.nodes) {
        if (!visible(n) || n.x == null) continue;
        const k = claveDe(n);
        const t = suma.get(k) || [0, 0, 0, 0];
        t[0] += n.x;
        t[1] += n.y;
        t[2] += n.z || 0;
        t[3]++;
        suma.set(k, t);
      }
    }
    for (const [k, s] of rotulosGrupo) {
      const t = suma.get(k);
      s.visible = !!t;
      if (!t) continue;
      // En la espiral, el centro de un capítulo cae dentro de su arco: el
      // rótulo va afuera, a la altura de su artículo de en medio.
      if (acomodo === 'orden') {
        const [x, y] = espiral(medioDe.get(k) ?? 1.04);
        s.position.set(x * 1.1, y * 1.1, 0);
      } else s.position.set(t[0] / t[3], t[1] / t[3] + 80, t[2] / t[3]);
    }
  }
  G.onEngineTick(moverRotulos);

  function elegirAcomodo(a) {
    if (a === acomodo) return;
    acomodo = a;
    try {
      localStorage.setItem('mapa-acomodo', a);
    } catch {}
    for (const b of raiz.querySelectorAll('[data-acomodo]'))
      b.setAttribute('aria-pressed', String(b.dataset.acomodo === acomodo));
    armarRotulos();
    if (modo !== 'red') return;
    G.d3Force('link').strength(fuerzaCita);
    G.cooldownTicks(260);
    G.d3ReheatSimulation();
    encuadrar = true;
  }

  const grosor = (l) => (l.w >= 3 ? 0.55 * Math.sqrt(l.w) : 0);
  const fuerzaCita = (l) => (l.e ? 0.9 : acomodo === 'orden' ? 0.004 : 0.04);

  function pintarRed() {
    G.nodeVal((n) => (n.k === 'a' ? 7 + n.n * 0.5 : n.k === 'h' ? 7 : 0.7 + n.n * 0.45))
      .nodeColor((n) => (!foco || vecinos.has(n.id) ? color[n.g] : apagado[n.g]))
      .nodeVisibility(visible)
      .nodeThreeObject(null)
      .nodeLabel(
        (n) =>
          `<b style="font-family:var(--mono)">${esc(rotuloLargo(n))}</b>` +
          (titulo(n) ? ` · ${esc(titulo(n))}` : '') +
          `<br><span style="color:var(--m-tenue)">La citan ${(entran.get(n.id) || []).length} · cita a ${(salen.get(n.id) || []).length} · clic para seguir sus hilos</span>`
      )
      .linkVisibility((l) => !l.e && lineaVisible(l))
      .linkColor((l) =>
        lineas.has(l) ? tinta.texto : foco ? tinta.hover : color[l.source.g] || color.g
      )
      // Más gruesa entre más citas haya entre los dos puntos, de 3 en
      // adelante (95 líneas; la más gruesa lleva 13); las demás, la línea
      // fina de siempre.
      .linkWidth((l) => (lineas.has(l) ? Math.max(0.8, grosor(l)) : grosor(l)))
      .linkDirectionalParticles((l) => (lineas.has(l) ? 3 : 0));
    G.cooldownTicks(220);
    G.d3Force('link')
      .distance((l) => (l.e ? 4 : 60))
      .strength(fuerzaCita);
    G.d3Force('charge').strength(-22);
    G.d3Force('ancla', fuerzaAncla);
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
            ? '<br><span style="color:var(--m-tenue)">Clic para seguir desde aquí</span>'
            : '')
      )
      .linkVisibility(lineaVisible)
      .linkColor(() => tinta.texto2)
      .linkWidth((l) => Math.max(0.35, grosor(l)))
      .linkDirectionalParticles(2);
    // Todo el hilo va en posiciones fijas: no hay nada que simular.
    G.d3Force('ancla', null);
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
    moverRotulos();
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
    moverRotulos();
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
  // En la red, la cámara vuela hacia el punto antes de abrir su hilo; en el
  // hilo, o con «reducir movimiento», se abre de inmediato.
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  let volando = 0;
  G.onNodeClick((n) => {
    if (n.id === centro) return;
    if (modo !== 'red' || quieto.matches) {
      seguir(n.id);
      return;
    }
    const lejos = Math.hypot(n.x, n.y, n.z || 0);
    const r = lejos > 1 ? 1 + 140 / lejos : 1;
    G.cameraPosition(
      lejos > 1 ? { x: n.x * r, y: n.y * r, z: (n.z || 0) * r } : { x: 0, y: 0, z: 140 },
      n,
      650
    );
    clearTimeout(volando);
    volando = setTimeout(() => seguir(n.id), 680);
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
    $('.mapa-acomodo').hidden = hilo;
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
    moverRotulos();
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
  function elegirDim(n) {
    if (n === dims) return;
    dims = n;
    try {
      localStorage.setItem('mapa-dim', String(n));
    } catch {}
    for (const b of raiz.querySelectorAll('[data-dim]'))
      b.setAttribute('aria-pressed', String(Number(b.dataset.dim) === dims));
    G.controls().enableRotate = dims === 3;
    if (dims === 2) {
      // De frente, como un plano.
      const d = G.camera().position.distanceTo(G.controls().target);
      G.cameraPosition({ x: 0, y: 0, z: d }, { x: 0, y: 0, z: 0 }, 500);
    }
    if (modo === 'red') {
      G.numDimensions(dims);
      G.cooldownTicks(260);
      encuadrar = true;
    } else setTimeout(() => G.zoomToFit(500, 60, visible), 520);
  }
  for (const b of raiz.querySelectorAll('[data-dim]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.dim) === dims));
    b.addEventListener('click', () => elegirDim(Number(b.dataset.dim)));
  }
  for (const b of raiz.querySelectorAll('[data-acomodo]')) {
    b.setAttribute('aria-pressed', String(b.dataset.acomodo === acomodo));
    b.addEventListener('click', () => elegirAcomodo(b.dataset.acomodo));
  }

  // Centrar: encuadra solo los puntos a la vista, así que con un capítulo
  // aislado en la leyenda se acerca a ese capítulo.
  $('.mapa-centrar').addEventListener('click', () =>
    G.zoomToFit(600, modo === 'hilo' ? 70 : 30, visible)
  );

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

  armarRotulos();
  const inicial = desdeHash();
  if (inicial) seguir(inicial.id, { historial: false });
  else verRed({ historial: false });
}
