// Comunidades de artículos para el acomodo «Por tema» del mapa de /mapa:
// grupos de artículos que se citan mucho entre sí, sin importar su capítulo
// (la puesta a tierra del 250 sale junto a los fotovoltaicos del 690, por
// ejemplo). Se calculan al construir el sitio con el método de Louvain, que
// mueve cada artículo al grupo donde más aumenta la modularidad (cuántas
// citas quedan dentro de los grupos, contra las que se esperarían al azar)
// hasta que ningún cambio mejora.
//
// Es determinista: los artículos se recorren en orden numérico, así que con
// la misma norma salen siempre los mismos grupos. No se nombran: un nombre
// sería una interpretación; el mapa los rotula con sus artículos.

/**
 * @param {Map<string, number>} pares  «a|b» → citas entre los artículos a y b
 * @returns {Map<number, number>}  artículo → número de grupo (0 = el más grande)
 */
export function comunidades(arts, pares) {
  const vec = new Map(arts.map((a) => [a, new Map()]));
  let m2 = 0;
  for (const [k, w] of pares) {
    const [a, b] = k.split('|').map(Number);
    vec.get(a).set(b, w);
    vec.get(b).set(a, w);
    m2 += 2 * w;
  }
  const grado = new Map(arts.map((a) => [a, [...vec.get(a).values()].reduce((x, y) => x + y, 0)]));
  const com = new Map(arts.map((a) => [a, a]));
  const total = new Map(arts.map((a) => [a, grado.get(a)]));
  for (let mejoro = true; mejoro; ) {
    mejoro = false;
    for (const a of arts) {
      const ca = com.get(a);
      const ka = grado.get(a);
      total.set(ca, total.get(ca) - ka);
      const hacia = new Map();
      for (const [b, w] of vec.get(a)) hacia.set(com.get(b), (hacia.get(com.get(b)) || 0) + w);
      let mejor = ca;
      let ganancia = (hacia.get(ca) || 0) - (total.get(ca) * ka) / m2;
      for (const [c, w] of hacia) {
        const g = w - (total.get(c) * ka) / m2;
        if (g > ganancia + 1e-9) {
          ganancia = g;
          mejor = c;
        }
      }
      com.set(a, mejor);
      total.set(mejor, total.get(mejor) + ka);
      if (mejor !== ca) mejoro = true;
    }
  }
  // Numerados por tamaño, del más grande al más chico (a igual tamaño, por
  // su artículo más bajo).
  const miembros = new Map();
  for (const [a, c] of com) miembros.set(c, [...(miembros.get(c) || []), a]);
  const orden = [...miembros.values()].sort((x, y) => y.length - x.length || x[0] - y[0]);
  const num = new Map();
  orden.forEach((ms, i) => {
    for (const a of ms) num.set(a, i);
  });
  return num;
}
