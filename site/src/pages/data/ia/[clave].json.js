// Pasos 2 y 3 del asistente: el índice de una clave (un artículo, el
// Capítulo 10, un Apéndice) y el texto completo de cada parte suya. La página
// solo descarga las de 1 a 3 claves que el modelo escogió.
import { ASISTENTE_NOM } from '../../../lib/asistente-nom.js';

export function getStaticPaths() {
  return Object.values(ASISTENTE_NOM.claves).map((c) => ({ params: { clave: c.clave }, props: c }));
}

export function GET({ props }) {
  return new Response(JSON.stringify(props));
}
