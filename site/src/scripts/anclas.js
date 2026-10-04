import { base } from './base.js';

// ------------------------------------------- anclas que cambiaron de id
//
// Al destapar estructura mal anidada, incisos que colgaban un nivel más
// abajo del que les tocaba cambiaron de identificador: `800-113(d)(3)c.a.`
// pasó a `800-113(d)(3)c.(3)a.`. Un enlace profundo de antes apunta a un
// ancla que ya no existe y el navegador se queda arriba de la página sin
// decir nada, que es lo peor que puede pasar: parece que el contenido se
// perdió. Son 143 identificadores, el grueso del Artículo 800.
//
// El mapa se pide SOLO cuando el ancla falla, así que la navegación
// normal no paga nada por esto.
const rescatarAncla = async () => {
  // Moverse entre anclas de un mismo artículo no recarga la página, así
  // que el aviso anterior sigue en el DOM y se irían apilando.
  document.querySelectorAll('.aviso-ancla').forEach((n) => n.remove());

  const crudo = location.hash.slice(1);
  if (!crudo) return;
  let id;
  try { id = decodeURIComponent(crudo); } catch (e) { id = crudo; }
  if (document.getElementById(id)) return;

  let mapa;
  try {
    const r = await fetch(`${base}/ids-retirados.json`);
    if (!r.ok) return;
    mapa = await r.json();
  } catch (e) { return; }

  const destino = mapa[id];
  const el = destino && document.getElementById(destino);
  if (!el) return;

  el.scrollIntoView();
  // El identificador viejo se queda en la URL a propósito: reescribirla
  // borraría la única pista de a dónde quería ir el lector.
  const aviso = document.createElement('div');
  aviso.className = 'aviso-ancla';
  aviso.innerHTML =
    `<b>${id}</b> cambió de identificador al corregir la estructura ` +
    `de este artículo. Su contenido está en <b>${destino}</b>, aquí abajo.`;
  el.insertAdjacentElement('beforebegin', aviso);
};
addEventListener('hashchange', rescatarAncla);
rescatarAncla();
