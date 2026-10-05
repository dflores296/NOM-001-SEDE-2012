// ------------------------------------------------- tablas que no caben
//
// En el teléfono la mayoría de las tablas desbordan su caja y se recorren
// deslizando de lado, pero nada lo decía: la tabla parecía cortada. Aquí,
// solo en las que de verdad desbordan:
//
// - un aviso arriba («Desliza para ver las N columnas →») y una sombra en el
//   borde por donde sigue la tabla;
// - la primera columna fija al deslizar, para no perder de qué renglón es
//   cada valor (kW y hp en la 430-250). Si el encabezado agrupa dos columnas
//   («Tamaño o designación» sobre mm² y AWG en la 310-15(b)(16)), se fijan
//   las dos. Si una celda cruza ese borde, o lo fijo ocuparía casi media
//   caja, se deja como está;
// - los encabezados largos (los «TIPOS TW, UF…» de la 310-15(b)(16)) con un
//   ancho mínimo, para que no queden de una palabra por renglón (CSS, con
//   la clase th-larga).
//
// Todo se agrega con JavaScript sobre el HTML publicado, que no cambia.

// Columna de inicio de cada celda de un grupo de filas, contando los
// rowspan y colspan de las filas de arriba (el mismo reparto que hace el
// navegador al dibujar la tabla).
function columnas(filas) {
  const ocupadas = [];
  const inicio = new Map();
  filas.forEach((tr, i) => {
    let col = 0;
    for (const celda of tr.cells) {
      while (ocupadas[i]?.[col]) col++;
      inicio.set(celda, col);
      for (let r = 0; r < celda.rowSpan; r++) {
        ocupadas[i + r] ||= [];
        for (let c = 0; c < celda.colSpan; c++) ocupadas[i + r][col + c] = true;
      }
      col += celda.colSpan;
    }
  });
  return inicio;
}

// Las celdas de las columnas que se quedan fijas: las que abarca la celda
// más ancha de la primera columna (una o dos), siempre que ninguna celda
// cruce ese borde.
function columnasFijas(table) {
  const celdas = [];
  for (const grupo of [table.tHead, ...table.tBodies].filter(Boolean)) {
    for (const [celda, col] of columnas([...grupo.rows])) celdas.push([celda, col]);
  }
  const k = Math.max(0, ...celdas.filter(([, col]) => col === 0).map(([c]) => c.colSpan));
  if (k < 1 || k > 2) return [];
  const fijas = celdas.filter(([, col]) => col < k);
  if (fijas.some(([c, col]) => col + c.colSpan > k)) return [];
  // La primera columna lleva la línea izquierda de la tabla (articulo.css) y
  // las que dan al borde derecho de lo fijo, la sombra.
  for (const [c, col] of fijas) {
    c.classList.toggle('fija-ini', col === 0);
    c.classList.toggle('fija-fin', col + c.colSpan === k);
  }
  return fijas.map(([c]) => c);
}

for (const scroll of document.querySelectorAll('.tabla-scroll')) {
  const caja = scroll.parentElement;
  const table = scroll.querySelector('table');
  if (!table) continue;

  for (const th of table.querySelectorAll('thead th')) {
    if (th.colSpan === 1 && th.textContent.trim().length > 24) th.classList.add('th-larga');
  }

  const aviso = document.createElement('p');
  aviso.className = 'tabla-desliza';
  aviso.hidden = true;
  const ncols = Math.max(0, ...[...table.rows].map((tr) => [...tr.cells].reduce((n, c) => n + c.colSpan, 0)));
  aviso.textContent = `Desliza para ver las ${ncols} columnas →`;
  caja.before(aviso);

  const fijas = columnasFijas(table);
  const titulo = caja.closest('figure')?.querySelector('figcaption .tid')?.textContent.trim();
  const nombre = titulo ? `Tabla ${titulo.replace(/^Tabla\s+/, '')}` : 'Tabla';
  let desborda = false;

  // Al cambiar el ancho: si desborda y dónde se queda cada celda fija (la
  // segunda columna, a la derecha de la primera).
  const medir = () => {
    desborda = scroll.scrollWidth > scroll.clientWidth + 1;
    aviso.hidden = !desborda;
    // Una caja que se desliza tiene que poder recibir el foco: con el
    // teclado, las flechas la recorren de lado. Solo las que desbordan.
    if (desborda) {
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', nombre);
    } else {
      scroll.removeAttribute('tabindex');
      scroll.removeAttribute('role');
      scroll.removeAttribute('aria-label');
    }
    for (const c of fijas) { c.classList.remove('fija'); c.style.left = ''; }
    // Las líneas cambian de modelo con columnas fijas (articulo.css), y eso
    // mueve los anchos un píxel: se mide ya con el modelo que va a quedar.
    caja.classList.toggle('con-fijas', desborda && fijas.length > 0);
    // Con fracciones de píxel: offsetLeft redondea, y la segunda columna se
    // montaba medio píxel sobre la línea de la primera y la borraba.
    const rects = new Map(fijas.map((c) => [c, c.getBoundingClientRect()]));
    const x0 = fijas.length ? Math.min(...fijas.map((c) => rects.get(c).left)) : 0;
    const ancho = fijas.length ? Math.max(...fijas.map((c) => rects.get(c).right)) - x0 : 0;
    if (desborda && ancho <= scroll.clientWidth * 0.45) {
      for (const c of fijas) { c.style.left = `${rects.get(c).left - x0}px`; c.classList.add('fija'); }
    } else {
      caja.classList.remove('con-fijas');
    }
    sombras();
  };
  const sombras = () => {
    caja.classList.toggle('mas-izq', desborda && scroll.scrollLeft > 2);
    caja.classList.toggle('mas-der', desborda && scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 2);
  };
  scroll.addEventListener('scroll', sombras, { passive: true });
  new ResizeObserver(medir).observe(scroll);
}
