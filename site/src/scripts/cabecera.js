// La cabecera: el buscador que aparece al bajar en la portada y las
// estrellas del repositorio.

// ------------------------------------- el buscador de la cabecera
//
// En la portada nace oculto: el grande de la banda hace su trabajo. En
// cuanto el grande pasa por debajo de la cabecera, el de arriba aparece;
// al volver a subir, se esconde otra vez.
const buscTop = document.querySelector('.search-top.oculto');
const grande = document.querySelector('.hero-buscar');
if (buscTop && grande && 'IntersectionObserver' in window) {
  const cab = document.querySelector('header.top');
  const campo = buscTop.querySelector('input');
  new IntersectionObserver(
    ([e]) => {
      const visible = !e.isIntersecting;
      buscTop.classList.toggle('oculto', !visible);
      if (visible) campo.removeAttribute('tabindex');
      else {
        campo.setAttribute('tabindex', '-1');
        buscTop.querySelector('.results')?.classList.remove('open');
      }
    },
    { rootMargin: `-${cab.offsetHeight}px 0px 0px 0px` }
  ).observe(grande);
} else if (buscTop) {
  buscTop.classList.remove('oculto');
}

// --------------------------------------------- estrellas de GitHub
//
// Se piden a la API pública y se guardan seis horas en el navegador: la
// API sin sesión deja 60 consultas por hora, y no hace falta gastarlas
// en cada página. Si no hay red o la API no responde, el botón queda
// sin número.
const ghN = document.querySelector('.gh-n');
if (ghN) {
  const pintar = (n) => {
    if (typeof n !== 'number') return;
    ghN.querySelector('b').textContent =
      n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
    ghN.hidden = false;
    ghN.closest('.gh').setAttribute('aria-label', `Repositorio en GitHub, ${n} estrellas`);
  };
  let cache = null;
  try {
    cache = JSON.parse(localStorage.getItem('nom-gh') || 'null');
  } catch {}
  if (cache) pintar(cache.n);
  if (!cache || Date.now() - cache.t > 6 * 3600e3) {
    fetch('https://api.github.com/repos/dflores296/NOM-001-SEDE-2012', {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.stargazers_count !== 'number') return;
        pintar(d.stargazers_count);
        try {
          localStorage.setItem('nom-gh', JSON.stringify({ n: d.stargazers_count, t: Date.now() }));
        } catch {}
      })
      .catch(() => {});
  }
}
