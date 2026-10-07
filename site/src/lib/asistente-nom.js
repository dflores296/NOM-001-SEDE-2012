// Los datos del asistente armados una sola vez por compilación, para los dos
// endpoints de src/pages/data/ia/. Ver asistente-datos.js.
import { armarAsistente } from './asistente-datos.js';
import { corpus, definiciones, tablas } from './nom.js';

export const ASISTENTE_NOM = armarAsistente({ corpus, tablas, definiciones });
