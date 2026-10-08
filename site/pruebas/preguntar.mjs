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
import { ERRATAS } from '../src/lib/erratas.js';
import { rejilla, tablaComoTexto } from '../src/lib/tabla-texto.js';
import {
  articuloDeTabla,
  bloquePistas,
  citables,
  clavesPedidas,
  conTablasCitadas,
  fragmentosDe,
  indiceCombinado,
  LECTURA,
  partesPedidas,
  pistasDe,
  TOPE_INDICE,
  tablasCitadas,
} from '../src/scripts/preguntar/lectura.js';
import {
  elegir,
  PRESUPUESTO,
  palabrasClave,
  recortar,
  rotulo,
} from '../src/scripts/preguntar/pasajes.js';
import { bloques, normalizarCitas, normRef, trozos } from '../src/scripts/preguntar/respuesta.js';

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

prueba('Primero se lee el inciso pedido y las secciones; las tablas al final', () => {
  const paqs = ['240', '310'].map((k) => IA.claves[k]);
  // Como lo pidió el modelo con «calibres pequeños»: tablas grandes primero.
  const pedidas = partesPedidas(
    'Tabla 310-15(B)(16)\nTabla 240-4(g)\n310-15\n240-4(d)\n240-6',
    paqs
  );
  afirmar(
    pedidas.length === LECTURA.partes,
    `${pedidas.length} pedidas; se leen ${LECTURA.partes}`
  );
  const refs = fragmentosDe(pedidas).map((f) => f.ref);
  afirmar(
    JSON.stringify(refs) ===
      JSON.stringify(['240-4(d)', '310-15', 'Tabla 310-15(b)(16)', 'Tabla 240-4(g)']),
    JSON.stringify(refs)
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

prueba('Lo que se lee trae la tabla que cita: el 250-122(a) manda a la Tabla 250-122', () => {
  const paqs = [IA.claves['250']];
  const pedidas = partesPedidas('250-122(a)', paqs);
  afirmar(JSON.stringify(tablasCitadas(pedidas)) === '["250-122"]', 'no ve la cita');
  const refs = fragmentosDe(conTablasCitadas(pedidas, paqs)).map((f) => f.ref);
  afirmar(
    JSON.stringify(refs) === JSON.stringify(['250-122(a)', 'Tabla 250-122']),
    JSON.stringify(refs)
  );
  // Si ya se lee todo lo que cabe, no se agrega nada.
  const llenas = partesPedidas('250-122(a)\n250-4\n250-24\n250-30', paqs);
  afirmar(conTablasCitadas(llenas, paqs).length === LECTURA.partes, 'se pasó de las partes');
});

prueba('Una tabla que ya viene en el texto, o que solo nombra otra tabla, no se agrega', () => {
  // La sección entera trae la Tabla 250-122 dentro.
  const entera = partesPedidas('250-122', [IA.claves['250']]);
  afirmar(!tablasCitadas(entera).length, JSON.stringify(tablasCitadas(entera)));
  // Los encabezados de las tablas del 310-15 dicen «[Ver tabla 310-104(a)]».
  const t = tablasCitadas(partesPedidas('310-15', [IA.claves['310']]));
  afirmar(!t.includes('310-104(a)'), JSON.stringify(t));
  // «Las Tablas 430-247 a 430-250» son para escoger una: eso lo hace el modelo.
  const motor = tablasCitadas(partesPedidas('430-6(a)(1)', [IA.claves['430']]));
  afirmar(!motor.length, JSON.stringify(motor));
});

prueba('Una tabla citada de otro artículo se busca en el suyo', () => {
  // El 240-5(a) manda a la Tabla 402-5 (ampacidad de los cordones flexibles).
  const pedidas = partesPedidas('240-5(a)', [IA.claves['240']]);
  const citadas = tablasCitadas(pedidas);
  afirmar(citadas.includes('402-5') && articuloDeTabla('402-5') === '402', JSON.stringify(citadas));
  afirmar(conTablasCitadas(pedidas, [IA.claves['240']]).length === 1, 'sin el 402 no la hay');
  const con = conTablasCitadas(pedidas, [IA.claves['240'], IA.claves['402']]);
  afirmar(con.at(-1).parte === 'Tabla 402-5', JSON.stringify(con.map((p) => p.parte)));
});

// ------------------------------------------------------------ las pistas

prueba('Cada resultado del buscador es una pista que se puede pedir en su artículo', () => {
  const malos = [];
  for (const d of DOCS) {
    const [p] = pistasDe([d]);
    // Las figuras de los apéndices no dicen de cuál son, y no dan pista.
    if (!p && d.kind === 'fig' && d.art == null) continue;
    const paq = p && IA.claves[p.clave];
    if (!paq) {
      malos.push(`${d.id}: sin clave`);
      continue;
    }
    if (!p.general.includes(p.detalle.slice(0, 40))) malos.push(`${d.id}: renglones distintos`);
    // Lo que se dice en el paso 2 es un identificador de ese artículo.
    if (d.kind !== 'cierre' && partesPedidas(p.detalle, [paq]).length !== 1)
      malos.push(`${d.id}: «${p.detalle}» no se puede pedir`);
  }
  afirmar(!malos.length, `${malos.length}: ${malos.slice(0, 5).join(' | ')}`);
});

prueba('Las pistas se dicen con su clave y caben con el índice en los topes del Worker', () => {
  const p = pistasDe([
    doc('210-8'),
    doc('tabla:250-122'),
    DOCS.find((d) => d.kind === 'def' && d.id === 'Acometida'),
    DOCS.find((d) => d.kind === 'tabla' && d.art == null && !d.apendice),
    DOCS.find((d) => d.kind === 'tabla' && d.apendice === 'A'),
    doc('210-8'),
  ]);
  afirmar(p.length === 5, `${p.length} pistas: la repetida no cuenta`);
  afirmar(
    JSON.stringify(p.map((x) => x.clave)) === '["210","250","100","C10","AA"]',
    JSON.stringify(p.map((x) => x.clave))
  );
  afirmar(
    p[0].general.endsWith('(artículo 210)') && p[0].detalle.startsWith('210-8 '),
    p[0].general
  );
  afirmar(p[1].detalle.startsWith('Tabla 250-122 '), p[1].detalle);
  afirmar(p[2].general === 'Definición: Acometida (artículo 100)', p[2].general);
  // Lo más largo que pueden ser: las ocho pistas más largas del buscador.
  const todas = DOCS.flatMap((d) => pistasDe([d]));
  const largas = (k) =>
    todas
      .map((x) => x[k])
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
  const uno = IA.indice + bloquePistas(largas('general'));
  afirmar(uno.length < TOPES.indice.articulos, `paso 1: ${uno.length} caracteres`);
  const suyas = bloquePistas(largas('detalle'));
  const grandes = Object.values(IA.claves)
    .sort((a, b) => b.indice.length - a.indice.length)
    .slice(0, 3);
  const dos = indiceCombinado(grandes, TOPE_INDICE - suyas.length) + suyas;
  afirmar(dos.length <= TOPE_INDICE, `paso 2: ${dos.length} caracteres`);
  afirmar(!bloquePistas([]), 'sin pistas no va nada');
});

// ------------------------------------------------------------ las erratas

prueba('Las cuatro tablas con errata del DOF la llevan al pie, y el valor impreso sigue', () => {
  afirmar(Object.keys(ERRATAS).length === 4, `${Object.keys(ERRATAS).length} erratas`);
  for (const [id, e] of Object.entries(ERRATAS)) {
    const t = TABLAS.find((x) => x.id === id);
    afirmar(t, `no existe la Tabla ${id}`);
    const texto = tablaComoTexto(t);
    for (const pedazo of e.impreso)
      afirmar(texto.includes(pedazo), `la Tabla ${id} ya no dice «${pedazo}»`);
    afirmar(
      texto.endsWith(
        `Nota de la guía (no es texto de la norma): errata del DOF en esta tabla: ${e.nota}`
      ),
      `la Tabla ${id} sin su nota`
    );
    // También en lo que se publica: el paso 3 y el respaldo.
    const parte = Object.values(IA.claves[articuloDeTabla(id)].partes).find((p) => p.tid === id);
    afirmar(parte.texto.includes(e.nota), `la Tabla ${id} del paso 3 sin su nota`);
    afirmar(TABLAS_IA[`tabla:${id}`]?.includes(e.nota), `la Tabla ${id} del respaldo sin su nota`);
  }
  const otra = tablaComoTexto(TABLAS.find((x) => x.id === '250-122'));
  afirmar(!otra.includes('Nota de la guía'), 'una tabla sin errata lleva nota');
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
  const max = Number(/id="asis-campo"[^>]*maxlength="(\d+)"/.exec(html)?.[1]);
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

prueba('Las citas con los corchetes de gpt-oss también son enlace', () => {
  const t = normalizarCitas('Según 【240-4†L3-L5】, ［Tabla 250-122］ y 〔250-122〕.');
  afirmar(t === 'Según [240-4], [Tabla 250-122] y [250-122].', t);
  // Abre con uno y cierra con otro, como pasó con la nota de una errata.
  const mixta = normalizarCitas('el valor correcto es 11 A 【Nota de la guía (errata del DOF)}].');
  afirmar(mixta === 'el valor correcto es 11 A [Nota de la guía (errata del DOF)].', mixta);
  const enlaces = bloques('Ver 【Tabla 250-122】.')
    .flatMap((b) => trozos(b.texto, REFS))
    .filter((x) => x.href);
  afirmar(enlaces.length === 1, JSON.stringify(enlaces));
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
