// El punto de entrada del Worker del asistente. Todo lo demás está en
// nucleo.js.
//
// Aquí solo va `export default`. Cloudflare toma CADA export de este archivo
// como una entrada del Worker (un manejador o una clase), y cualquier otra
// cosa —una constante, una función auxiliar— impide que arranque: le pasó a
// la primera versión, que exportaba TOPES y MODELO para las pruebas. La
// prueba «agente.js solo exporta default» lo cuida.
import { atender } from './nucleo.js';

export default { fetch: atender };
