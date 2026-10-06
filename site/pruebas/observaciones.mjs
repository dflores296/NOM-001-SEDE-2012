// Pruebas de la limpieza del formulario de /observaciones
// (src/scripts/observaciones/limpieza.js), sin navegador. La última recorre
// el sitio compilado: cada enlace «Reportar» tiene que pasar el filtro.
//
//     cd site && npm run build && node pruebas/observaciones.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  armarEnvio,
  correo,
  desarmarEnlaces,
  lineaUna,
  origenDe,
  refDeURL,
  textoLargo,
} from '../src/scripts/observaciones/limpieza.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const RAIZ = '/NOM-001-SEDE-2012';
const ORIGEN = 'https://dflores296.github.io';
const TIPOS = ['Diferencia con el DOF', 'Falta algo', 'No se ve bien', 'Sugerencia', 'Otra cosa'];

let fallas = 0;
function prueba(nombre, fn) {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}
function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

prueba('La referencia de la URL solo se toma si es de las que arma el sitio', () => {
  for (const r of ['250-32(a)(1)', 'Tabla 430-250', 'Definición «Acometida» (Parte A)']) {
    afirmar(refDeURL(r) === r, `rechazó ${r}`);
  }
  for (const r of [
    '<img src=x onerror=alert(1)>',
    'Urgente: verifica tu cuenta en https://banco.example',
    '250-32\nBcc: otro@example.com',
    '"><script>alert(1)</script>',
    'x'.repeat(101),
  ]) {
    afirmar(refDeURL(r) === '', `aceptó ${JSON.stringify(r)}`);
  }
  // Un carácter invisible no la invalida: se quita.
  afirmar(refDeURL('250-32​') === '250-32', 'no quitó el ancho cero');
});

prueba('El origen es una página del sitio o nada', () => {
  const o = (de, referrer = '') => origenDe({ de, referrer, origin: ORIGEN, raiz: RAIZ });
  afirmar(o(`${RAIZ}/art/250/#250-32`) === `${ORIGEN}${RAIZ}/art/250/#250-32`, 'rechazó una ruta');
  afirmar(o('https://phish.example/login') === '', 'aceptó una URL de afuera');
  afirmar(o('//phish.example/x') === '', 'aceptó una URL sin esquema');
  afirmar(o(`${RAIZ}/../../x`) === '', 'aceptó una ruta con ..');
  afirmar(o('javascript:alert(1)') === '', 'aceptó javascript:');
  afirmar(o(null, `${ORIGEN}${RAIZ}/tablas/?q=x`) === `${ORIGEN}${RAIZ}/tablas/`, 'referrer');
  afirmar(o(null, 'https://phish.example/') === '', 'aceptó un referrer de afuera');
});

prueba('Las etiquetas HTML se quitan y las comparaciones se quedan', () => {
  const t = textoLargo(
    '<script>alert(1)</script>Dice <b>600</b> V, debe ser < 600 V y <= 1000',
    500
  );
  afirmar(!/<script|<\/?b>/i.test(t), t);
  afirmar(t.includes('< 600 V') && t.includes('<= 1000'), t);
  afirmar(!textoLargo('<a href="https://x.example">clic</a>', 99).includes('<a'), 'quedó el <a');
  // Etiquetas anidadas para que, al quitar la de en medio, se arme otra.
  for (const x of [
    '<<script>script>alert(1)<</script>/script>',
    '<scr<script>ipt>alert(1)</script>',
    '<<<b>b>b>negrita',
    '<<a>a href=x>clic',
  ]) {
    for (const f of [textoLargo, lineaUna]) {
      const t = f(x, 200);
      afirmar(!/<\/?[a-z!?]/i.test(t), `${f.name}(${JSON.stringify(x)}) dejó ${JSON.stringify(t)}`);
    }
  }
});

prueba('Los enlaces se desarman: se leen pero no se abren', () => {
  const t = desarmarEnlaces(
    'Ve a https://banco-seguro.example.com/login, www.otro.mx o seguro.com y javascript:alert(1)'
  );
  afirmar(!/https?:\/\//i.test(t) && t.includes('hxxps://banco-seguro[.]example[.]com/login'), t);
  afirmar(t.includes('www[.]otro[.]mx') && t.includes('seguro[.]com'), t);
  afirmar(t.includes('javascript[:]'), t);
  // Lo de la norma no se toca.
  const norma = 'Tabla B.310.15(B)(2)(1), 250-32(a)(1) y NOM-001-SEDE-2012';
  afirmar(desarmarEnlaces(norma) === norma, desarmarEnlaces(norma));
});

prueba('Los invisibles se quitan, y el bidi ya no da vuelta el texto', () => {
  const t = textoLargo('factura‮gpj.exe​\u0007 y\tbien\r\nfin', 99);
  afirmar(t === 'facturagpj.exe y\tbien\nfin', JSON.stringify(t));
});

prueba('Una línea no admite saltos: el asunto no puede inyectar encabezados', () => {
  afirmar(lineaUna('250-32\r\nBcc: x@example.com', 120) === '250-32 Bcc: x@example[.]com', 'salto');
});

prueba('El correo se valida', () => {
  afirmar(correo('alguien@example.com') === 'alguien@example.com', 'rechazó uno bueno');
  for (const c of [
    'a@b',
    'a b@c.com',
    'x@y.com\nBcc: z@w.com',
    '<a@b.com>',
    `${'a'.repeat(250)}@b.com`,
  ]) {
    afirmar(correo(c) === '', `aceptó ${JSON.stringify(c)}`);
  }
});

prueba('El envío lleva solo los campos esperados, ya limpios', () => {
  const { campos } = armarEnvio(
    {
      referencia: '250-32',
      tipo: '<script>',
      observacion: 'Visita https://phish.example <img src=x onerror=alert(1)>',
      email: 'yo@example.com',
      _cc: 'otro@example.com',
      _next: 'https://phish.example',
    },
    { tipos: TIPOS, origen: `${ORIGEN}${RAIZ}/art/250/` }
  );
  afirmar(
    Object.keys(campos).sort().join() ===
      '_subject,dice_el_dof,email,observacion,referencia,tipo,url',
    Object.keys(campos).join()
  );
  afirmar(campos.tipo === 'Otra cosa', `tipo: ${campos.tipo}`);
  afirmar(campos.observacion === 'Visita hxxps://phish[.]example', campos.observacion);
  afirmar(campos._subject === 'Observación: 250-32', campos._subject);
  afirmar(
    armarEnvio({ observacion: '<b></b>' }, { tipos: TIPOS, origen: '' }).falta === 'observacion',
    'vacía'
  );
  afirmar(
    armarEnvio({ observacion: 'x', email: 'no' }, { tipos: TIPOS, origen: '' }).falta === 'email',
    'correo malo'
  );
});

prueba('Cada «Reportar» del sitio compilado pasa el filtro', () => {
  let n = 0;
  const malos = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) recorrer(f);
      else if (e.name.endsWith('.html')) {
        const html = fs.readFileSync(f, 'utf8');
        for (const m of html.matchAll(/observaciones\/\?ref=([^&"]*)&(?:amp;)?de=([^"]*)"/g)) {
          n++;
          const ref = decodeURIComponent(m[1].replaceAll('&amp;', '&'));
          const de = decodeURIComponent(m[2].replaceAll('&amp;', '&'));
          if (refDeURL(ref) !== ref) malos.push(ref);
          // Las tablas de los índices no dicen de dónde: lo pone el referrer.
          if (de && !origenDe({ de, referrer: '', origin: ORIGEN, raiz: RAIZ })) malos.push(de);
        }
      }
    }
  };
  recorrer(DIST);
  afirmar(n > 3000, `solo ${n} enlaces: ¿se compiló el sitio?`);
  afirmar(!malos.length, `${malos.length} rechazados: ${malos.slice(0, 3).join(' | ')}`);
});

console.log(
  fallas
    ? `\n${fallas} pruebas de observaciones fallaron.`
    : '\nLas pruebas de observaciones pasaron.'
);
process.exit(fallas ? 1 : 0);
