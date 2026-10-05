// ------------------------------------- índice de la página en el teléfono
//
// En pantallas angostas el índice lateral (.toc) no cabe y se oculta, y en
// un artículo de 60 secciones la única forma de moverse era deslizar a
// ciegas. Aquí se agregan dos botones flotantes abajo: uno muestra en qué
// sección vas y abre el índice como hoja desde abajo, y el otro sube al
// inicio. Se arman con JavaScript a partir del mismo .toc, así que el HTML
// publicado no cambia; solo se ven donde el .toc está oculto (articulo.css).
const toc = document.querySelector('.toc');
const enlaces = toc ? toc.querySelectorAll('a[href^="#"]') : [];

if (enlaces.length > 1) {
  const titulo = toc.querySelector('h3')?.textContent.trim() || 'En esta página';

  const barra = document.createElement('div');
  barra.className = 'indice-movil';
  barra.innerHTML = `
    <button type="button" class="im-arriba" aria-label="Volver arriba" title="Volver arriba" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
    <button type="button" class="im-abrir" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
      <span class="im-actual"></span>
    </button>`;

  const hoja = document.createElement('dialog');
  hoja.className = 'im-hoja';
  hoja.setAttribute('aria-label', titulo);
  hoja.innerHTML = `
    <div class="im-cab">
      <b></b>
      <button type="button" class="im-cerrar" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
             aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <nav class="im-lista"></nav>`;
  hoja.querySelector('.im-cab b').textContent = titulo;
  // Las mismas entradas del índice lateral, con sus mismos grupos
  // (secciones, tablas, figuras).
  const lista = hoja.querySelector('.im-lista');
  for (const n of toc.children) lista.append(n.cloneNode(true));
  document.body.append(barra, hoja);

  const abrir = barra.querySelector('.im-abrir');
  const arriba = barra.querySelector('.im-arriba');
  const actual = barra.querySelector('.im-actual');

  // La sección que se está leyendo la decide indice-lateral.js marcando
  // con .on su enlace del .toc; aquí solo se copia.
  let marcado;
  const copiar = () => {
    const on = toc.querySelector('a.on');
    if (on === marcado) return;
    marcado = on;
    // El mismo contenido del enlace: el número en mono y el título.
    if (on) actual.innerHTML = on.innerHTML; else actual.textContent = titulo;
    for (const a of lista.querySelectorAll('a')) {
      a.classList.toggle('on', !!on && a.getAttribute('href') === on.getAttribute('href'));
    }
  };

  let pendiente = false;
  const alMover = () => {
    pendiente = false;
    copiar();
    arriba.hidden = scrollY < innerHeight;
  };
  addEventListener('scroll', () => {
    if (!pendiente) { pendiente = true; requestAnimationFrame(alMover); }
  }, { passive: true });
  alMover();

  abrir.addEventListener('click', () => {
    copiar();
    hoja.showModal();
    document.documentElement.classList.add('im-abierta');
    lista.querySelector('a.on')?.scrollIntoView({ block: 'center' });
  });
  hoja.addEventListener('close', () => document.documentElement.classList.remove('im-abierta'));
  hoja.querySelector('.im-cerrar').addEventListener('click', () => hoja.close());
  // Un toque fuera de la hoja (en el fondo oscurecido) la cierra.
  hoja.addEventListener('click', (e) => { if (e.target === hoja) hoja.close(); });
  // Al elegir una entrada se cierra la hoja y el ancla hace el resto.
  lista.addEventListener('click', (e) => { if (e.target.closest('a')) hoja.close(); });
  arriba.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
}
