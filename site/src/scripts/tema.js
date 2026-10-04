// ---------------------------------------------------------- tema
//
// Mientras el lector no toque el interruptor, el sitio sigue al
// navegador, también si este cambia con la página abierta (el modo
// oscuro automático al anochecer). Al tocarlo, su elección se guarda y
// manda desde entonces.
const temaBtn = document.getElementById('tema');
if (temaBtn) {
  const raiz = document.documentElement;
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const esOscuro = () => raiz.dataset.theme
    ? raiz.dataset.theme === 'oscuro'
    : sistema.matches;
  // El interruptor y la barra del navegador en móvil reflejan el tema
  // que se está viendo, venga de la elección o del sistema.
  const reflejar = () => {
    temaBtn.setAttribute('aria-checked', String(esOscuro()));
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(raiz).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  };
  reflejar();
  sistema.addEventListener('change', reflejar);
  temaBtn.addEventListener('click', () => {
    const t = esOscuro() ? 'claro' : 'oscuro';
    raiz.dataset.theme = t;
    try { localStorage.setItem('nom-tema', t); } catch (e) {}
    reflejar();
  });
}
