// Lo que sale del formulario de /observaciones hacia el correo, y lo que
// entra a él desde la URL. Piezas puras, sin DOM: las prueba
// pruebas/observaciones.mjs.
//
// De qué se cuida:
// - Un enlace armado para engañar. /observaciones/?ref=…&de=… llena la
//   referencia (y la deja fija) y el origen del reporte. Quien arme ese
//   enlace podría hacer que el asunto del correo dijera lo que quisiera, o
//   que el «origen» fuera su sitio. Aquí solo se acepta lo que de verdad
//   generan los botones «Reportar» del sitio; lo demás se ignora.
// - Un correo que se disfraza de sugerencia: etiquetas HTML, enlaces y
//   caracteres invisibles (los de dirección bidi dan vuelta el texto:
//   «‮gpj.exe» se ve como «exe.jpg»). Las etiquetas se quitan y los enlaces
//   se desarman a la manera de los equipos de seguridad, hxxps://sitio[.]com:
//   se pueden leer y copiar, pero no se abren con un clic.
//
// Nada de esto sustituye la protección del lado de Formspree: la dirección
// del formulario va en el HTML y cualquiera puede mandarle un POST sin pasar
// por esta página. Ver «Seguridad del formulario» en docs/arquitectura.md.

export const LARGO = { referencia: 120, observacion: 3000, dice_el_dof: 2000, email: 254 };

// Lo que generan los botones «Reportar»: «250-32(a)(1)», «Tabla 430-250»,
// «Figura 551-46(c)», «Definición «Acometida» (Parte A)». Sin <, >, comillas
// rectas, dos puntos ni diagonales: ni HTML ni una URL caben aquí.
const REF_VALIDA = /^[\p{L}\p{N}][\p{L}\p{N} (),.\-«»]{0,99}$/u;

// Controles y caracteres de formato (\p{Cf}: ancho cero, marcas bidi, BOM).
// El salto de línea y el tabulador se conservan en los textos largos.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

// Una etiqueta abre con < seguido de letra, / o !: «<script>», «</a>»,
// «<!-- -->». «< 600 V» o «<=» no son etiquetas y se quedan.
const ETIQUETA = /<\/?[a-z!?][^<>]*>?/gi;

// Una dirección con esquema o con www.
const URL_ESCRITA = /\b(?:(?:https?|ftp):\/\/|www\.)[^\s<>"']+/gi;
// Esquemas que en un cliente de correo pueden ejecutar o descargar algo.
const ESQUEMA_PELIGROSO = /\b(javascript|vbscript|data|file):/gi;
// Un dominio sin esquema, que Gmail y Outlook enlazan solos:
// «banco-seguro.com/login», «alguien@sitio.mx».
const DOMINIO_SUELTO =
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|mx|io|info|biz|xyz|top|site|online|app|dev|co|me|ly|gl|link|click|ru|cn|tk|shop|live|store|gob|edu)\b/gi;

/** Sin invisibles, en forma normal NFC y con saltos de línea \n. */
function base(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(INVISIBLE, (c) => (c === '\n' || c === '\t' ? c : ''));
}

/** hxxps://sitio[.]com: legible, pero ya no es un enlace. */
export function desarmarEnlaces(s) {
  return s
    .replace(URL_ESCRITA, (u) =>
      u.replace(/^http/i, 'hxxp').replace(/^ftp/i, 'fxp').replace(/\./g, '[.]')
    )
    .replace(ESQUEMA_PELIGROSO, '$1[:]')
    .replace(DOMINIO_SUELTO, (d) => d.replace(/\./g, '[.]'));
}

/** Una sola línea: para la referencia y el asunto del correo. */
export function lineaUna(s, max) {
  return desarmarEnlaces(base(s).replace(ETIQUETA, '')).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Un texto de varios renglones: lo que se vio y lo que dice el DOF. */
export function textoLargo(s, max) {
  return desarmarEnlaces(base(s).replace(ETIQUETA, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** El correo de quien reporta, o '' si no parece uno. */
export function correo(s) {
  const c = base(s).trim();
  if (c.length > LARGO.email) return '';
  return /^[^\s@<>()[\]\\,;:"]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(c) ? c : '';
}

/** La referencia que trae ?ref=, solo si es de las que genera el sitio. */
export function refDeURL(valor) {
  const v = base(valor).trim();
  return REF_VALIDA.test(v) ? v : '';
}

/**
 * La página de donde vino el reporte, como URL completa del sitio, o ''.
 * Acepta ?de= (una ruta del sitio, como la arman los botones «Reportar») o
 * el referrer, si es del mismo sitio. Nunca una dirección de afuera.
 */
export function origenDe({ de, referrer, origin, raiz }) {
  const ruta = new RegExp(
    `^${raiz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[\\w\\-/]*(?:#[\\w\\-().]*)?$`
  );
  if (de && ruta.test(de)) return origin + de;
  try {
    const r = new URL(referrer);
    const camino = r.pathname + r.hash;
    if (r.origin === origin && ruta.test(camino)) return origin + camino;
  } catch {
    // referrer vacío o mal formado: sin origen.
  }
  return '';
}

/**
 * Lo que se manda, ya limpio y solo con los campos que se esperan. Devuelve
 * { campos } o { falta } con el nombre del campo que hay que corregir.
 */
export function armarEnvio(datos, { tipos, origen }) {
  const referencia = lineaUna(datos.referencia, LARGO.referencia);
  const observacion = textoLargo(datos.observacion, LARGO.observacion);
  if (!observacion) return { falta: 'observacion' };
  const email = correo(datos.email);
  if (String(datos.email ?? '').trim() && !email) return { falta: 'email' };

  return {
    campos: {
      referencia,
      tipo: tipos.includes(datos.tipo) ? datos.tipo : 'Otra cosa',
      observacion,
      dice_el_dof: textoLargo(datos.dice_el_dof, LARGO.dice_el_dof),
      email,
      url: origen,
      _subject: referencia
        ? `Observación: ${referencia}`
        : 'Observación en la guía NOM-001-SEDE-2012',
    },
  };
}
