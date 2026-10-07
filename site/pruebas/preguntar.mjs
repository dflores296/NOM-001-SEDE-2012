// Pruebas del asistente de /preguntar del lado de la página, sin navegador:
// lo que lee en cada paso (lib/asistente-datos.js), cómo se entiende lo que
// pide (lectura.js), el respaldo del buscador (pasajes.js), cómo se lee lo
// que contesta (respuesta.js),
// las tablas renglón por renglón (lib/tabla-texto.js) y que todo lo que arma
// la página pase la revisión del Worker (ia/nucleo.js). Las últimas recorren
// el sitio compilado.
//
//     cd site && npm run build && node pruebas/preguntar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPES, validar } from '../../ia/nucleo.js';
import { armarAsistente } from '../src/lib/asistente-datos.js';
import { rejilla, tablaComoTexto } from '../src/lib/tabla-texto.js';
import {
  citables,
  clavesPedidas,
  fragmentosDe,
  indiceCombinado,
  LECTURA,
  partesPedidas,
  TOPE_INDICE,
} from '../src/scripts/preguntar/lectura.js';
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
const DATOS = path.join(AQUI, '..', '..', 'data');
const CORPUS = leer(path.join(DATOS, 'corpus.json'));
const TABLAS = leer(path.join(DATOS, 'tablas.json'));
const DEFINICIONES = leer(path.join(DATOS, 'definiciones.json'));
const IA = armarAsistente({ corpus: CORPUS, tablas: TABLAS, definiciones: DEFINICIONES });
function* recorrer(n) {
  yield n;
  for (const h of n.children || []) yield* recorrer(h);
}

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

// ------------------------------------------------------------ lo que lee

prueba('El índice general cabe en el paso 1 y trae todos los artículos y el cierre', () => {
  afirmar(IA.indice.length < TOPES.indice.articulos, `${IA.indice.length} caracteres`);
  const claves = IA.indice.split('\n').map((l) => l.split(' ')[0]);
  for (const a of CORPUS.articles) afirmar(claves.includes(String(a.num)), `falta el ${a.num}`);
  for (const k of ['C10', 'AA', 'AB', 'AC', 'T']) afirmar(claves.includes(k), `falta ${k}`);
  // Lo que se publica es lo mismo que se prueba.
  const pub = leer(path.join(DIST, 'data', 'ia', 'indice.json'));
  afirmar(pub.indice === IA.indice, 'el índice publicado no es el que se arma aquí');
});

prueba('El índice de tres artículos cualesquiera cabe en el paso 2', () => {
  const grandes = Object.values(IA.claves).sort((a, b) => b.indice.length - a.indice.length);
  afirmar(
    grandes[0].indice.length < TOPE_INDICE,
    `${grandes[0].clave}: ${grandes[0].indice.length}`
  );
  const tres = indiceCombinado(grandes.slice(0, 3));
  afirmar(
    tres.length <= TOPE_INDICE && TOPE_INDICE < TOPES.indice.secciones,
    `${tres.length} caracteres`
  );
});

prueba(
  'Cada sección e inciso de la norma está en el texto de su artículo, con su identificador',
  () => {
    const faltan = [];
    for (const a of CORPUS.articles) {
      const partes = IA.claves[String(a.num)].partes;
      for (const s of a.sections || []) {
        const texto = partes[s.id]?.texto || '';
        for (const n of recorrer(s)) if (!texto.includes(`[${n.id}] `)) faltan.push(n.id);
      }
    }
    afirmar(!faltan.length, `${faltan.length}: ${faltan.slice(0, 5).join(', ')}`);
  }
);

prueba('Cada tabla y cada definición se pueden pedir', () => {
  const todas = Object.values(IA.claves).flatMap((c) => Object.values(c.partes));
  const tablas = new Set(todas.filter((p) => p.tipo === 'tabla').map((p) => p.tid));
  const faltan = TABLAS.filter((t) => !tablas.has(t.id)).map((t) => t.id);
  afirmar(!faltan.length, `tablas: ${faltan.join(', ')}`);
  const defs = Object.keys(IA.claves['100'].partes);
  afirmar(
    defs.length === DEFINICIONES.length,
    `${defs.length} definiciones de ${DEFINICIONES.length}`
  );
});

prueba('El 240-4(d) llega con sus incisos numerados y sus amperes', () => {
  const t = IA.claves['240'].partes['240-4'].texto;
  afirmar(t.includes('[240-4(d)] Conductores pequeños.'), 'sin el (d)');
  afirmar(t.includes('[240-4(d)(3)] 2.08 mm2 (14 AWG) de cobre. 15 amperes.'), 'sin el (d)(3)');
});

prueba('El Worker acepta como cita todo lo que se puede leer', () => {
  const malos = [];
  for (const c of Object.values(IA.claves)) {
    for (const [llave, parte] of Object.entries(c.partes)) {
      const ids = [llave, ...[...parte.texto.matchAll(/^\s*\[([^\]\n]+)\]/gm)].map((m) => m[1])];
      for (const ref of ids) {
        if (ref === 'Figura') continue;
        const v = validar({ pregunta: 'x', fragmentos: [{ ref, titulo: '', texto: 'x' }] });
        if (v.error) malos.push(ref);
      }
    }
  }
  afirmar(!malos.length, `${malos.length}: ${malos.slice(0, 5).join(' | ')}`);
});

// ------------------------------------------------------------ lo que pide

prueba('Las claves del paso 1 se entienden aunque el modelo las adorne', () => {
  const todas = Object.keys(IA.claves);
  const c = clavesPedidas('Artículo 240, 310\n- C10 (tablas)\n999\n250', todas);
  afirmar(JSON.stringify(c) === '["240","310","C10"]', JSON.stringify(c));
  afirmar(!clavesPedidas('NADA', todas).length, 'NADA no es una clave');
});

prueba('Lo que pide en el paso 2 se resuelve contra lo que existe', () => {
  const paqs = ['240', '310', 'C10'].map((k) => IA.claves[k]);
  const p = partesPedidas(
    '1. 240.4(D) Conductores pequeños\n- Tabla 310-15(B)(16)\n240-4(g)\nTabla 8\nAcometida\nNADA\n999-9',
    paqs
  );
  const vista = p.map((x) => x.parte + (x.focos ? ` → ${x.focos.join(',')}` : ''));
  afirmar(
    JSON.stringify(vista) ===
      JSON.stringify(['240-4 → 240-4(d),240-4(g)', 'Tabla 310-15(b)(16)', 'Tabla 8']),
    JSON.stringify(vista)
  );
  // Una sección pedida entera se manda entera aunque también pida un inciso.
  const entera = partesPedidas('240-4(d)\n240-4', paqs);
  afirmar(
    entera.length === 1 && entera[0].focos === null,
    JSON.stringify(entera.map((x) => x.focos))
  );
});

prueba('Lo que se lee en el paso 3 cabe en los topes del Worker y lo acepta', () => {
  afirmar(LECTURA.partes <= TOPES.fragmentos, 'partes');
  afirmar(LECTURA.porParte < TOPES.texto, 'por parte');
  afirmar(LECTURA.total < TOPES.total, 'total');
  // Lo más grande que se puede pedir: las seis partes más largas de la norma.
  const largas = Object.values(IA.claves)
    .flatMap((c) => Object.keys(c.partes).map((parte) => ({ paq: c, parte, focos: null })))
    .sort((a, b) => b.paq.partes[b.parte].texto.length - a.paq.partes[a.parte].texto.length)
    .slice(0, 6);
  const fr = fragmentosDe(largas);
  const v = validar({
    paso: 'responder',
    pregunta: 'x',
    fragmentos: fr.map(({ ref, texto }) => ({ ref, titulo: '', texto })),
  });
  afirmar(!v.error, `el Worker lo rechaza: ${v.error}`);
  afirmar(
    fr.every((f) => f.texto.length <= LECTURA.porParte),
    'una parte se pasó'
  );
});

prueba('Un inciso pedido de una sección llega completo, con lo que cuelga de él', () => {
  const [f] = fragmentosDe(partesPedidas('240-4(d)', [IA.claves['240']]));
  afirmar(f.ref === '240-4(d)', f.ref);
  afirmar(
    f.texto.startsWith('[240-4] Protección de los conductores.'),
    'sin el renglón de la sección'
  );
  afirmar(
    f.texto.includes('[240-4(d)(3)]') && !f.texto.includes('[240-4(e)]'),
    'no es solo el (d)'
  );
});

prueba('Una cita a un inciso de lo leído lleva a su ancla', () => {
  // «Tabla 240-4(g)» es la tabla y «240-4(g)» el inciso: los dos existen.
  const fr = fragmentosDe(partesPedidas('240-4(d)\nTabla 240-4(g)', [IA.claves['240']]));
  const m = new Map(citables(fr).map(([id, r]) => [id, r]));
  const r = m.get('240-4(d)(3)');
  afirmar(r?.kind === 'sec' && r.art === '240' && r.id === '240-4(d)(3)', JSON.stringify(r));
  afirmar(m.get('Tabla 240-4(g)')?.kind === 'tabla', 'la tabla no es citable');
  afirmar(fr.length === 2 && fr[1].ref === 'Tabla 240-4(g)', JSON.stringify(fr.map((f) => f.ref)));
});

// ------------------------------------------------------------ el respaldo

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
