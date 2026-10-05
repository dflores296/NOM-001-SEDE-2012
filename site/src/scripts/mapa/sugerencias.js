// Las sugerencias del buscador del mapa.
import { codigo, rotuloLargo, sinAcentos, titulo } from './datos.js';

// Por código (250-122, 250122, 430) o por palabras del título, sin
// importar acentos. Primero el código exacto, luego los que empiezan
// igual, luego por palabras; en cada grupo, los más citados primero.
export function crearSugeridor(nodes) {
  const indice = nodes.map((n) => ({
    n,
    cod: codigo(n.k === 'a' ? String(n.a) : n.id),
    txt: sinAcentos(`${rotuloLargo(n)} ${titulo(n)}`),
  }));

  function sugerir(q) {
    const qc = codigo(q);
    const palabras = sinAcentos(q)
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (!qc) return [];
    const puntaje = (x) => {
      if (x.cod === qc) return 1e6 + x.n.n;
      if (/\d/.test(qc) && x.cod.startsWith(qc)) return 1e5 + x.n.n - x.cod.length;
      if (palabras.length && palabras.every((w) => x.txt.includes(w))) return 1e3 + x.n.n;
      return -1;
    };
    return indice
      .map((x) => [puntaje(x), x.n])
      .filter(([p]) => p >= 0)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 9)
      .map(([, n]) => n);
  }
  return sugerir;
}
