// Pruebas del asistente de /preguntar del lado de la página, sin navegador:
// qué se le manda (pasajes.js), cómo se lee lo que contesta (respuesta.js),
// las tablas renglón por renglón (lib/tabla-texto.js) y que todo lo que arma
// la página pase la revisión del Worker (ia/nucleo.js). Las últimas recorren
// el sitio compilado.
//
//     cd site && npm run build && node pruebas/preguntar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPES, validar } from '../../ia/nucleo.js';
import { rejilla, tablaComoTexto } from '../src/lib/tabla-texto.js';
import {
  elegir,
  PRESUPUESTO,
  palabrasClave,
  recortar,
  rotulo,
} from '../src/scripts/preguntar/pasajes.js';
import { bloques, normRef, trozos } from '../src/scripts/preguntar/respuesta.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, '..', 'dist');
const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const DOCS = leer(path.join(AQUI, '..', 'src', 'generado', 'search.json'));
const TABLAS_IA = leer(path.join(DIST, 'data', 'tablas-ia.json'));
const doc = (id) => DOCS.find((d) => d.id === id);

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

// ------------------------------------------------------------ lo que se manda

prueba('De la pregunta quedan las palabras del tema, reducidas', () => {
  const c = palabrasClave('¿Qué calibre necesito para los circuitos de 20 A en una cocina?');
  afirmar(
    JSON.stringify(c) === JSON.stringify(['calibre', 'circuito', '20', 'cocina']),
    JSON.stringify(c)
  );
});

prueba('Un texto largo se recorta a las oraciones que tocan la pregunta', () => {
  const relleno = 'Los equipos deben estar aprobados para el uso previsto. '.repeat(40);
  const texto = `Alcance. ${relleno}El conductor de puesta a tierra debe ser de cobre. ${relleno}`;
  const r = recortar(texto, palabrasClave('¿de qué es el conductor de puesta a tierra?'), 300);
  afirmar(r.length <= 300, `${r.length} caracteres`);
  afirmar(r.startsWith('Alcance.'), 'perdió el principio');
  afirmar(r.includes('El conductor de puesta a tierra debe ser de cobre.'), r);
  afirmar(r.includes('…'), 'no marca lo que saltó');
});

prueba('Un número de la pregunta se busca entero: 20 no es 200 ni 2.08', () => {
  const texto = [
    'A | B',
    '200 | x',
    '2.08 | y',
    '20 | z',
    ...Array(200).fill('999 | relleno'),
  ].join('\n');
  // Con lugar para el encabezado y un renglón, el renglón es el del 20.
  const r = recortar(texto, ['20'], 20, { lineas: true });
  afirmar(r === 'A | B\n…\n20 | z\n…', JSON.stringify(r));
});

prueba('El rótulo de cada resultado es el que se cita', () => {
  afirmar(rotulo(doc('250-122')) === '250-122', 'sección');
  afirmar(rotulo(doc('tabla:250-122')) === 'Tabla 250-122', 'tabla');
  afirmar(rotulo(doc('tabla:220-83(a)')) === 'Tabla del 220-83(a)', 'tabla sin número');
  afirmar(rotulo(doc('Acometida')) === 'Definición: Acometida', 'definición');
  afirmar(rotulo(doc('cierre:apendice-C')) === 'Apéndice C', 'apéndice');
});

prueba('Una pregunta real arma un envío que el Worker acepta, con la tabla en renglones', () => {
  const pregunta =
    '¿Qué calibre mínimo lleva el conductor de puesta a tierra de equipos en un circuito de 20 A?';
  const resultados = [
    '250-122',
    'tabla:250-122',
    '250-118',
    '250-119',
    'tabla:250-66',
    '250-66',
    '250-4',
  ]
    .map(doc)
    .map((d) => ({ ...d, score: 1 }));
  const elegidos = elegir(resultados, pregunta, TABLAS_IA);
  // El presupuesto se acaba antes que la lista: tres secciones largas y dos
  // tablas ya lo llenan.
  afirmar(elegidos.length >= 4, `${elegidos.length} fragmentos`);
  const tabla = elegidos.find((f) => f.ref === 'Tabla 250-122');
  afirmar(
    tabla?.texto.includes('20 | 3.31 | 12 | - | -'),
    `la tabla no va en renglones: ${tabla?.texto.slice(0, 200)}`
  );
  const total = elegidos.reduce((n, f) => n + f.texto.length, 0);
  afirmar(total <= PRESUPUESTO.total, `${total} caracteres`);
  const envio = {
    pregunta,
    fragmentos: elegidos.map(({ ref, titulo, texto }) => ({ ref, titulo, texto })),
  };
  const v = validar(envio);
  afirmar(!v.error, `el Worker lo rechaza: ${v.error}`);
});

prueba('Un inciso y su sección no se mandan dos veces', () => {
  const sec = doc('310-15');
  const inciso = { ...sec, id: '310-15(b)(16)', docId: '310-15', score: 2 };
  const e = elegir([inciso, { ...sec, score: 1 }], 'ampacidad', TABLAS_IA);
  afirmar(e.length === 1 && e[0].ref === '310-15(b)(16)', JSON.stringify(e.map((f) => f.ref)));
});

prueba('Lo que manda la página cabe en los topes del Worker', () => {
  afirmar(PRESUPUESTO.fragmentos <= TOPES.fragmentos, 'fragmentos');
  afirmar(PRESUPUESTO.porFragmento < TOPES.texto, 'texto por fragmento');
  afirmar(PRESUPUESTO.total < TOPES.total, 'total');
  const html = fs.readFileSync(path.join(DIST, 'preguntar', 'index.html'), 'utf8');
  const max = Number(/id="preg-campo"[^>]*maxlength="(\d+)"/.exec(html)?.[1]);
  afirmar(max === TOPES.pregunta, `el campo admite ${max} y el Worker ${TOPES.pregunta}`);
});

prueba('El Worker acepta el rótulo y el título de todo lo que el buscador puede encontrar', () => {
  const malos = DOCS.filter((d) => {
    const v = validar({
      pregunta: 'x',
      fragmentos: [{ ref: rotulo(d), titulo: d.title || '', texto: 'x' }],
    });
    return v.error;
  });
  afirmar(
    !malos.length,
    `${malos.length}: ${malos
      .slice(0, 5)
      .map((d) => d.id)
      .join(', ')}`
  );
});

// ------------------------------------------------------------ las tablas

prueba('Cada tabla del buscador tiene su versión en renglones', () => {
  const faltan = DOCS.filter((d) => d.kind === 'tabla' && !TABLAS_IA[d.id]).map((d) => d.id);
  afirmar(!faltan.length, faltan.slice(0, 5).join(', '));
});

prueba('Una celda que abarca filas o columnas vale en cada posición que cubre', () => {
  const g = rejilla(
    [
      [
        { t: 'A', rs: 2 },
        { t: 'B', cs: 2 },
      ],
      [{ t: 'b1' }, { t: 'b2' }],
      [{ t: '1' }, { t: '2', rs: 2 }, { t: '3' }],
      [{ t: '4' }, { t: '6' }],
    ],
    3
  );
  const t = g.map((f) => f.map((c) => c?.t ?? '·').join(' '));
  afirmar(
    JSON.stringify(t) === JSON.stringify(['A B B', 'A b1 b2', '1 2 3', '4 2 6']),
    JSON.stringify(t)
  );
  const s = tablaComoTexto({
    rows: [
      [
        { t: 'A', rs: 2 },
        { t: 'B', cs: 2 },
      ],
      [{ t: 'b1' }, { t: 'b2' }],
      [{ t: 'Grupo', cs: 3 }],
      [{ t: '1' }, { t: '2' }, { t: '3' }],
    ],
    cols: 3,
    header_rows: 2,
  });
  afirmar(s === 'A | B, b1 | B, b2\n— Grupo —\n1 | 2 | 3', JSON.stringify(s));
});

// ------------------------------------------------------------ lo que contesta

const REFS = new Map([
  [normRef('250-122'), '/x/art/250#250-122'],
  [normRef('Tabla 250-122'), '/x/art/250#tabla-250-122'],
]);

prueba('Una cita de lo que se mandó se vuelve enlace; una inventada, no', () => {
  const t = trozos('Según la [Tabla 250-122] y la [999-1], 3.31 mm².', REFS);
  const enlaces = t.filter((x) => x.href);
  afirmar(
    enlaces.length === 1 && enlaces[0].href === '/x/art/250#tabla-250-122',
    JSON.stringify(t)
  );
  afirmar(
    t.map((x) => x.texto).join('') === 'Según la [Tabla 250-122] y la [999-1], 3.31 mm².',
    'cambió el texto'
  );
});

prueba('Varias citas en unos corchetes, y un inciso de una sección mandada', () => {
  const t = trozos('Ver [250-122(a); tabla 250-122].', REFS);
  const hrefs = t.filter((x) => x.href).map((x) => x.href);
  afirmar(
    JSON.stringify(hrefs) === JSON.stringify(['/x/art/250#250-122', '/x/art/250#tabla-250-122']),
    JSON.stringify(t)
  );
});

prueba('Lo que escriba el modelo se queda como texto, aunque parezca HTML', () => {
  const t = trozos('<img src=x onerror=alert(1)> [<b>250-122</b>]', REFS);
  afirmar(
    t.every((x) => !x.href),
    'enlazó algo dentro de etiquetas'
  );
  afirmar(
    t.map((x) => x.texto).join('') === '<img src=x onerror=alert(1)> [<b>250-122</b>]',
    'perdió texto'
  );
});

prueba('La respuesta se parte en párrafos y listas, sin el Markdown', () => {
  const b = bloques(
    '## Respuesta\nEl calibre es **12 AWG**.\n\n- Cobre: 3.31 mm²\n- Aluminio: no aplica\nFin.'
  );
  afirmar(
    JSON.stringify(b) ===
      JSON.stringify([
        { tipo: 'p', texto: 'Respuesta' },
        { tipo: 'p', texto: 'El calibre es 12 AWG.' },
        { tipo: 'ul', items: ['Cobre: 3.31 mm²', 'Aluminio: no aplica'] },
        { tipo: 'p', texto: 'Fin.' },
      ]),
    JSON.stringify(b)
  );
});

console.log(fallas ? `\n${fallas} pruebas fallaron.` : '\nLas pruebas de /preguntar pasaron.');
process.exit(fallas ? 1 : 0);
