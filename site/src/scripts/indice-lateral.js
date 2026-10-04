// ------------------------------------------- índice de esta página
//
// Resalta en el índice lateral la sección que se está leyendo: la última
// cuyo encabezado ya pasó por debajo de la cabecera fija. Se mide en cada
// cuadro de desplazamiento y no una sola vez, porque las imágenes y las
// tablas cargan tarde y mueven todo lo que viene después.
const toc = document.querySelector('.toc');
if (toc) {
  const enlaces = [...toc.querySelectorAll('a[href^="#"]')]
    .map((a) => ({ a, el: document.getElementById(decodeURIComponent(a.hash.slice(1))) }))
    .filter((x) => x.el);
  let actual = null;
  let pendiente = false;
  const marcar = () => {
    pendiente = false;
    const tope = (parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--ancla')) || 128) + 8;
    let hit = null;
    for (const x of enlaces) {
      if (x.el.getBoundingClientRect().top <= tope) hit = x;
      else if (hit) break;
    }
    if (hit === actual) return;
    actual?.a.classList.remove('on');
    actual = hit;
    if (!hit) return;
    hit.a.classList.add('on');
    // El índice tiene su propio desplazamiento: se mueve él, no la página.
    const r = hit.a.getBoundingClientRect();
    const c = toc.getBoundingClientRect();
    if (r.top < c.top + 40 || r.bottom > c.bottom - 40) {
      toc.scrollTop += r.top - c.top - c.height / 3;
    }
  };
  addEventListener('scroll', () => {
    if (!pendiente) { pendiente = true; requestAnimationFrame(marcar); }
  }, { passive: true });
  marcar();
}
