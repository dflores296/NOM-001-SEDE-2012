// ------------------------------------------- índice A–Z y filtro del glosario
//
// Las 185 definiciones van en el orden del DOF, que no es alfabético estricto:
// los términos derivados quedan junto al suyo («No accesible» debajo de
// «Accesible»). Ese orden no se toca. Encima de la lista se agregan:
//
// - una barra A–Z: una letra deja solo los términos que empiezan con ella
//   (las letras sin términos quedan apagadas);
// - un campo que filtra por palabra en el término y en su definición, sin
//   importar acentos, con las coincidencias marcadas.
//
// Se arma con JavaScript sobre el HTML publicado, que no cambia: sin
// JavaScript el glosario se ve completo como siempre.
import { sinAcentos, termino } from './buscador/terminos.js';

const partes = [...document.querySelectorAll('.sec')].filter((s) => s.querySelector('.defs'));
const defs = [...document.querySelectorAll('.defs > .def')];

// Texto en minúsculas y sin acentos, con la posición de cada letra en su
// nodo original para poder marcar la coincidencia después. Se normaliza letra
// por letra: así una «é» que quede en dos caracteres no corre las posiciones.
function plano(nodos) {
  let texto = '';
  const pos = [];
  for (const nodo of nodos) {
    for (let i = 0; i < nodo.data.length; i++) {
      const c = sinAcentos(nodo.data[i].toLowerCase());
      texto += c;
      for (let k = 0; k < c.length; k++) pos.push([nodo, i]);
    }
    texto += ' ';
    pos.push(null);
  }
  return { texto, pos };
}

// Los nodos de texto de un elemento, sin las etiquetas que agrega la página
// («pág. 12», «Reportar»).
function textos(el) {
  const out = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement.closest('.tag, .report')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}

const items = defs.map((el) => {
  const dt = el.querySelector('dt');
  const termino = [...dt.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.data)
    .join('')
    .trim();
  return {
    el,
    parte: el.closest('.sec'),
    letra: sinAcentos(termino.charAt(0)).toUpperCase(),
    ...plano(textos(el)),
  };
});

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

if (items.length && partes.length) {
  const caja = document.createElement('div');
  caja.className = 'glos-filtro';
  caja.setAttribute('role', 'search');
  caja.setAttribute('aria-label', 'Filtrar el glosario');
  caja.innerHTML = `
    <div class="search-wrap">
      <svg class="lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" autocomplete="off" spellcheck="false"
             placeholder="Filtra: tierra, tablero, carga…" aria-label="Filtrar las definiciones" />
    </div>
    <div class="glos-letras" role="group" aria-label="Por letra inicial"></div>
    <p class="glos-cuenta" aria-live="polite"><span></span>
      <button type="button" class="glos-todas" hidden>Ver todas</button></p>`;
  const letras = caja.querySelector('.glos-letras');
  for (const l of ABC) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l;
    b.dataset.letra = l;
    b.setAttribute('aria-pressed', 'false');
    letras.append(b);
  }
  (document.querySelector('.cap-nav') || partes[0]).after(caja);

  const campo = caja.querySelector('input');
  const cuenta = caja.querySelector('.glos-cuenta span');
  const todas = caja.querySelector('.glos-todas');
  const botones = [...letras.children];
  // El conteo de cada parte («167 definiciones») se cambia por «3 de 167»
  // mientras hay filtro, y vuelve a su texto al quitarlo.
  const descs = new Map(partes.map((p) => [p, p.querySelector('.sec-head .desc')]));
  const originales = new Map([...descs].map(([p, d]) => [p, d?.textContent]));

  // Las coincidencias se marcan con la API de resaltado de CSS, que pinta
  // sobre el texto sin meter etiquetas en él. Donde no existe, solo se filtra.
  const marcas = typeof Highlight === 'function' && CSS.highlights ? new Highlight() : null;
  if (marcas) CSS.highlights.set('glosario', marcas);

  let letra = '';

  const aplicar = () => {
    // La misma regla que el buscador: sin acentos, en singular («tierras»
    // encuentra «tierra») y sin las palabras que no dicen nada («a», «de»):
    // en «puesta a tierra» la «a» marcaba cada letra a de la página.
    const palabras = campo.value
      .split(/[^\p{L}\p{N}-]+/u)
      .map((w) => termino(w))
      .filter(Boolean);
    const conTexto = items.filter((it) => palabras.every((p) => it.texto.includes(p)));
    const conLetras = new Set(conTexto.map((it) => it.letra));
    for (const b of botones) {
      const l = b.dataset.letra;
      b.setAttribute('aria-pressed', String(l === letra));
      // La letra elegida sigue activa aunque el texto la deje sin términos,
      // para poder quitarla.
      b.disabled = !conLetras.has(l) && l !== letra;
    }

    const visibles = new Set(conTexto.filter((it) => !letra || it.letra === letra));
    for (const it of items) it.el.hidden = !visibles.has(it);
    for (const p of partes) {
      const total = items.filter((it) => it.parte === p).length;
      const n = items.filter((it) => it.parte === p && visibles.has(it)).length;
      p.hidden = n === 0;
      const d = descs.get(p);
      if (d) d.textContent = n === total ? originales.get(p) : `${n} de ${total}`;
    }

    const filtrando = palabras.length > 0 || letra !== '';
    todas.hidden = !filtrando;
    if (!filtrando) cuenta.textContent = `${items.length} definiciones.`;
    else if (visibles.size === 0) cuenta.textContent = 'Ninguna definición coincide.';
    else
      cuenta.textContent = `${visibles.size} de ${items.length} definiciones${
        letra ? ` con la ${letra}` : ''
      }.`;

    if (marcas) {
      marcas.clear();
      for (const it of visibles) {
        for (const p of palabras) {
          let i = it.texto.indexOf(p);
          while (i !== -1) {
            const ini = it.pos[i];
            const fin = it.pos[i + p.length - 1];
            if (ini && fin && ini[0] === fin[0]) {
              const r = new Range();
              r.setStart(ini[0], ini[1]);
              r.setEnd(fin[0], fin[1] + 1);
              marcas.add(r);
            }
            i = it.texto.indexOf(p, i + p.length);
          }
        }
      }
    }
  };

  campo.addEventListener('input', aplicar);
  letras.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    letra = letra === b.dataset.letra ? '' : b.dataset.letra;
    aplicar();
  });
  const limpiar = () => {
    campo.value = '';
    letra = '';
    aplicar();
  };
  todas.addEventListener('click', () => {
    limpiar();
    campo.focus();
  });

  // Un enlace a una definición que el filtro esconde (desde otra definición o
  // desde el buscador de arriba) quita el filtro para que se vea.
  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const destino = id && document.getElementById(id);
    if (destino && (destino.hidden || destino.closest('[hidden]'))) {
      limpiar();
      destino.scrollIntoView();
    }
  });

  aplicar();
}
