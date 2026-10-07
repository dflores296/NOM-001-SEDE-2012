// Las tablas como las lee el asistente de /preguntar: una fila por renglón y
// sus encabezados arriba (ver src/lib/tabla-texto.js), por el mismo id que
// usa el buscador ("tabla:250-122"). Solo se descarga al hacer una pregunta.
import { tablas } from '../../lib/nom.js';
import { tablaComoTexto } from '../../lib/tabla-texto.js';

export function GET() {
  return new Response(
    JSON.stringify(Object.fromEntries(tablas.map((t) => [`tabla:${t.id}`, tablaComoTexto(t)])))
  );
}
