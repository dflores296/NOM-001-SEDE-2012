// Una tabla de la norma como texto para el asistente (/preguntar): un renglón
// de encabezados y un renglón por fila, con las celdas separadas por «|».
//
// El buscador guarda las tablas aplanadas, todas las celdas seguidas
// («15 2.08 14 - - 20 3.31 12 - -»): sirve para encontrar una palabra, pero
// un modelo que lee eso puede tomar el calibre de un renglón por el del
// siguiente. Aquí cada valor queda en su renglón y bajo su columna.
//
// Las celdas que abarcan varias filas o columnas (rs, cs) se repiten en cada
// posición que cubren, como se leen en la tabla dibujada: un encabezado
// «Cobre» sobre dos columnas nombra a las dos, y un valor que baja tres
// renglones vale para los tres.
import { notaErrata } from './erratas.js';

/** Las celdas de `rows` acomodadas en una rejilla: rejilla[fila][columna]. */
export function rejilla(rows, cols) {
  const g = rows.map(() => []);
  rows.forEach((fila, i) => {
    let j = 0;
    for (const celda of fila) {
      while (g[i][j]) j++;
      const rs = celda.rs || 1;
      const cs = celda.cs || 1;
      for (let a = i; a < Math.min(i + rs, rows.length); a++) {
        for (let b = j; b < j + cs; b++) g[a][b] = celda;
      }
      j += cs;
    }
  });
  const ancho = Math.max(cols || 0, ...g.map((f) => f.length));
  return g.map((f) => Array.from({ length: ancho }, (_, j) => f[j] || null));
}

const celda = (c) => (c?.t ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

export function tablaComoTexto(t) {
  const g = rejilla(t.rows || [], t.cols);
  const h = Math.min(t.header_rows || 0, g.length);
  const lineas = [];
  if (t.intro) lineas.push(celda({ t: t.intro }));

  // El nombre de cada columna junta lo que dicen sus encabezados de arriba
  // abajo, sin repetir el de una celda que abarca varias filas.
  if (h) {
    const nombres = g[0].map((_, j) => {
      const partes = [];
      for (let i = 0; i < h; i++) {
        const c = g[i][j];
        if (c && c !== g[i - 1]?.[j] && celda(c)) partes.push(celda(c));
      }
      return partes.join(', ');
    });
    lineas.push(nombres.join(' | '));
  }

  for (const fila of g.slice(h)) {
    // Una sola celda a todo lo ancho es un rótulo de grupo («Tipo RHH»),
    // no una fila de datos.
    if (fila.every((c) => c === fila[0])) {
      lineas.push(`— ${celda(fila[0])} —`);
      continue;
    }
    lineas.push(fila.map(celda).join(' | '));
  }

  for (const n of t.notes || []) {
    const txt = celda({ t: typeof n === 'string' ? n : n?.t });
    if (txt) lineas.push(txt);
  }
  // Las cuatro tablas con un valor mal impreso en el DOF llevan la errata al
  // pie, marcada como de la guía (erratas.js).
  const errata = notaErrata(t.id);
  if (errata) lineas.push(errata);
  return lineas.join('\n');
}
