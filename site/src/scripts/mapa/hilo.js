// Las posiciones de un hilo: el punto de partida y lo que lo cita o lo que
// cita, a uno o dos saltos. Es geometría pura, sin estado de la página: recibe
// los índices de la red (datos.js) y qué hilos seguir.
// El punto de partida va al centro. Lo que lo cita, a la izquierda; lo
// que él cita, a la derecha; el segundo salto, un arco más afuera del
// mismo lado. Así el hilo se lee de izquierda a derecha en el sentido de
// la cita.
const TOPE_SALTO2 = 40;
export function armarHilo(id, { porId, entran, salen }, { dir, prof }) {
  const lado = new Map([[id, { x: 0, d: 0 }]]);
  const capa = (desde, lista, signo, d, tope = Infinity) => {
    const nuevos = [];
    for (const de of desde) for (const v of lista(de) || []) {
      if (lado.has(v) || nuevos.length >= tope) continue;
      lado.set(v, { x: signo, d });
      nuevos.push(v);
    }
    return nuevos;
  };
  const ent = (x) => entran.get(x);
  const sal = (x) => salen.get(x);
  const masCitados = (ids) => [...ids].sort((a, b) => porId.get(b).n - porId.get(a).n);
  const izq = dir !== 'salen' ? capa([id], ent, -1, 1) : [];
  const der = dir !== 'entran' ? capa([id], sal, 1, 1) : [];
  if (prof === 2) {
    // Del segundo salto, solo lo que sale de los más citados y con tope:
    // sin él, el hilo de 310-15 a dos saltos serían cientos de puntos.
    if (dir !== 'salen') capa(masCitados(izq).slice(0, 12), ent, -1, 2, TOPE_SALTO2);
    if (dir !== 'entran') capa(masCitados(der).slice(0, 12), sal, 1, 2, TOPE_SALTO2);
  }

  // Disposición fija y no simulada: cada lado es un arco alrededor del
  // centro —lo que lo cita a la izquierda, lo que cita a la derecha—,
  // ordenado de arriba abajo por cuántas citas tiene cada punto. El
  // segundo salto va en un arco más afuera. Una ligera profundidad en z
  // conserva la sensación de 3D sin estorbar la lectura.
  const ESPACIO = 22;
  const ARCO = (150 * Math.PI) / 180;
  const radio = (k, min) => Math.max(min, (k * ESPACIO) / ARCO);
  const grupo = (x, d) => [...lado].filter(([, o]) => o.x === x && o.d === d).map(([k]) => k)
    .sort((a, b) => porId.get(b).n - porId.get(a).n);
  const pos = new Map([[id, [0, 0, 0]]]);
  for (const x of [-1, 1]) {
    const g1 = grupo(x, 1);
    const g2 = grupo(x, 2);
    const r1 = radio(g1.length, 150);
    const r2 = Math.max(r1 + 170, radio(g2.length, 0));
    for (const [g, r] of [[g1, r1], [g2, r2]]) {
      g.forEach((k, j) => {
        const t = g.length === 1 ? 0.5 : j / (g.length - 1);
        const ang = (t - 0.5) * ARCO; // de arriba (−) a abajo (+)
        pos.set(k, [x * r * Math.cos(ang), -r * Math.sin(ang), 18 * Math.sin(j * 1.7)]);
      });
    }
  }
  const nodes = [...lado.keys()].map((k) => {
    const [fx, fy, fz] = pos.get(k);
    return { ...porId.get(k), fx, fy, fz, x: fx, y: fy, z: fz };
  });
  const links = [];
  for (const [k, { x, d }] of lado) {
    if (d === 0) continue;
    // Cada punto se une al de un salto más adentro, en el sentido de la cita.
    const hacia = x < 0 ? salen.get(k) || [] : entran.get(k) || [];
    for (const v of hacia) {
      const o = lado.get(v);
      if (!o || o.d !== d - 1 || (o.d > 0 && o.x !== x)) continue;
      links.push(x < 0 ? { source: k, target: v } : { source: v, target: k });
    }
  }
  return { nodes, links };
}
