// Los campos de búsqueda de la página: el de la cabecera, en todas, y el
// grande de la portada. Cada uno con su lista de resultados y su teclado.
import { buscar, load } from './indice.js';
import { ETIQUETA, escapeHtml, href, itemHtml } from './resultados.js';

// Un campo de búsqueda con su lista de resultados. Hay uno en el
// encabezado de todas las páginas y otro, grande, en la portada; los dos
// comparten índice, pero cada uno lleva su propia lista y su selección.
function conectar(input, box) {
  let sel = -1;
  let t;

  function render(list, q) {
    if (!list.length) {
      box.innerHTML = `<div class="empty">Sin resultados para “${escapeHtml(q)}”.</div>`;
      box.classList.add('open');
      return;
    }
    // Agrupado por tipo: mezclados, una tabla y una sección con el mismo
    // término se confundían en una sola lista plana. Cada grupo conserva
    // el orden por relevancia que ya trae de MiniSearch, y los GRUPOS
    // también se ordenan por su mejor resultado -no por una categoría
    // fija-: para "acometida" la definición del glosario le gana por
    // mucho a cualquier sección (88 de score contra 29), y un orden fijo
    // "Secciones primero" la mandaría al fondo aunque sea la más
    // relevante con diferencia.
    const porTipo = { sec: [], tabla: [], def: [], fig: [], cierre: [] };
    for (const r of list) porTipo[r.kind]?.push(r);
    box.innerHTML = Object.keys(porTipo)
      .filter((k) => porTipo[k].length)
      .sort((a, b) => porTipo[b][0].score - porTipo[a][0].score)
      .map((k) => `
        <div class="rgroup">
          <div class="rghead">${ETIQUETA[k]}</div>
          ${porTipo[k].map((r) => itemHtml(r, q)).join('')}
        </div>
      `)
      .join('');
    box.classList.add('open');
    sel = -1;
  }

  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        box.classList.remove('open');
        return;
      }
      render(await buscar(q), q);
    }, 110);
  });

  input.addEventListener('focus', load);

  // Ir al resultado elegido o, si no se eligió ninguno, al primero: es lo
  // que se espera al pulsar Enter o el botón de la portada.
  async function ir() {
    const items = [...box.querySelectorAll('a')];
    if (items.length) { location.href = (items[sel] || items[0]).href; return; }
    const q = input.value.trim();
    if (q.length < 2) return;
    const list = await buscar(q);
    if (list.length) location.href = href(list[0]);
    else render(list, q);
  }

  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('a')];
    if (e.key === 'Enter') {
      e.preventDefault();
      ir();
    } else if (e.key === 'Escape') {
      box.classList.remove('open');
      input.blur();
    } else if (items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      items[sel]?.classList.remove('sel');
      sel = e.key === 'ArrowDown'
        ? Math.min(sel + 1, items.length - 1)
        : Math.max(sel - 1, 0);
      items[sel].classList.add('sel');
      items[sel].scrollIntoView({ block: 'nearest' });
    }
  });

  return { ir };
}

for (const input of document.querySelectorAll('input[data-buscar]')) {
  const wrap = input.closest('.search-wrap');
  const api = conectar(input, wrap.querySelector('.results'));
  wrap.closest('form')?.addEventListener('submit', (e) => { e.preventDefault(); api.ir(); });
}

document.addEventListener('click', (e) => {
  const dentro = e.target.closest('.search-wrap');
  for (const b of document.querySelectorAll('.results.open')) {
    if (!dentro || !dentro.contains(b)) b.classList.remove('open');
  }
});

// "/" enfoca el buscador desde cualquier parte: el de la cabecera si se
// está viendo, y si no —la portada, arriba— el grande de la banda.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.target.closest?.('input, textarea, select')) return;
  e.preventDefault();
  const arriba = document.querySelector('.search-top:not(.oculto) input');
  (arriba || document.querySelector('.hero-buscar input[data-buscar]'))?.focus();
});
