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
// Las letras se mueven como en el iPhone: la elegida queda en un círculo que
// se desliza con rebote de una a otra, al tocarlas se hunden y regresan con
// resorte, y en el teléfono se puede pasar el dedo de lado sobre ellas
// (como el índice de Contactos) con la letra en grande arriba del dedo. Con
// «reducir movimiento» activado en el sistema no se anima nada.
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
  // El círculo de la letra elegida y el globo que aparece arriba del dedo.
  const burbuja = document.createElement('span');
  burbuja.className = 'glos-burbuja';
  const globo = document.createElement('span');
  globo.className = 'glos-globo';
  burbuja.ariaHidden = globo.ariaHidden = 'true';
  letras.prepend(burbuja);
  letras.append(globo);
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  // El conteo de cada parte («167 definiciones») se cambia por «3 de 167»
  // mientras hay filtro, y vuelve a su texto al quitarlo.
  const descs = new Map(partes.map((p) => [p, p.querySelector('.sec-head .desc')]));
  const originales = new Map([...descs].map(([p, d]) => [p, d?.textContent]));

  // Las coincidencias se marcan con la API de resaltado de CSS, que pinta
  // sobre el texto sin meter etiquetas en él. Donde no existe, solo se filtra.
  const marcas = typeof Highlight === 'function' && CSS.highlights ? new Highlight() : null;
  if (marcas) CSS.highlights.set('glosario', marcas);

  let letra = '';

  // El círculo se pone sobre la letra elegida, del tamaño del botón. Si no
  // estaba visible aparece ahí mismo, creciendo, en vez de llegar deslizándose
  // desde donde se quedó la vez anterior.
  const moverBurbuja = () => {
    const b = botones.find((x) => x.dataset.letra === letra);
    const estaba = burbuja.classList.contains('on');
    burbuja.classList.toggle('on', !!b);
    if (!b) return;
    const d = Math.min(b.offsetWidth, b.offsetHeight);
    if (!estaba) burbuja.classList.add('sin-viaje');
    burbuja.style.width = burbuja.style.height = `${d}px`;
    burbuja.style.translate = `${b.offsetLeft + (b.offsetWidth - d) / 2}px ${
      b.offsetTop + (b.offsetHeight - d) / 2
    }px`;
    if (!estaba) {
      burbuja.offsetWidth;
      burbuja.classList.remove('sin-viaje');
    }
  };
  new ResizeObserver(moverBurbuja).observe(letras);

  // Al cambiar de letra, las primeras definiciones entran escalonadas.
  const entrar = (visibles) => {
    if (quieto.matches) return;
    let i = 0;
    for (const it of items) {
      if (!visibles.has(it)) continue;
      it.el.animate(
        [
          { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: 340,
          delay: i * 24,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          fill: 'backwards',
        }
      );
      if (++i === 12) break;
    }
  };

  const aplicar = (animar = false) => {
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
    moverBurbuja();
    if (animar) entrar(visibles);
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

  campo.addEventListener('input', () => aplicar());
  let trasArrastre = false;
  letras.addEventListener('click', (e) => {
    // El toque con que terminó un arrastre no cuenta como otro toque: la
    // letra ya quedó elegida al pasar el dedo.
    if (trasArrastre) {
      trasArrastre = false;
      return;
    }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    letra = letra === b.dataset.letra ? '' : b.dataset.letra;
    aplicar(true);
  });

  // Pasar el dedo de lado sobre las letras: cada letra por la que pasa queda
  // elegida, con un toque de vibración donde el teléfono lo permite. El
  // movimiento vertical sigue desplazando la página (touch-action en CSS).
  const mostrarGlobo = (b) => {
    globo.textContent = b.dataset.letra;
    globo.style.translate = `${b.offsetLeft + b.offsetWidth / 2}px ${b.offsetTop}px`;
    globo.classList.add('on');
  };
  const letraBajo = (e) =>
    document.elementFromPoint(e.clientX, e.clientY)?.closest('.glos-letras button:not(:disabled)');
  let dedo = null;
  letras.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const b = letraBajo(e);
    dedo = { id: e.pointerId, inicio: b, movio: false };
    if (b) mostrarGlobo(b);
  });
  letras.addEventListener('pointermove', (e) => {
    if (!dedo || e.pointerId !== dedo.id) return;
    const b = letraBajo(e);
    if (!b) return;
    mostrarGlobo(b);
    if (b === dedo.inicio && !dedo.movio) return;
    if (b.dataset.letra === letra) return;
    dedo.movio = true;
    letra = b.dataset.letra;
    aplicar(true);
    navigator.vibrate?.(4);
  });
  const soltar = (e) => {
    if (!dedo || e.pointerId !== dedo.id) return;
    // Si el navegador no manda ese clic, el aviso no debe tragarse el
    // siguiente toque de verdad.
    trasArrastre = dedo.movio && e.type === 'pointerup';
    if (trasArrastre) setTimeout(() => (trasArrastre = false), 400);
    dedo = null;
    globo.classList.remove('on');
  };
  letras.addEventListener('pointerup', soltar);
  letras.addEventListener('pointercancel', soltar);
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
