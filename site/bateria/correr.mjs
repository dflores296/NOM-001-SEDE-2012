// La batería de evaluación del asistente (paso 4 de la auditoría): hace las
// preguntas de preguntas.json al asistente real, en el sitio publicado, como
// un visitante, y califica cada respuesta contra lo que dice la norma.
//
//     cd site && node bateria/correr.mjs                # todas
//     cd site && node bateria/correr.mjs --solo 1,2,15  # algunas
//     cd site && node bateria/correr.mjs --recalificar bateria/resultados/<archivo>.json
//
// NO va en verificar.sh ni al publicar: gasta el cupo diario de todos (unas
// 230 neuronas por pregunta; las 24, más de la mitad del día) y necesita red.
// Se corre a mano, de preferencia justo después de las 6 pm del centro de
// México, cuando el cupo se reinicia. Cada pregunta va en un navegador nuevo
// (la 2 sigue a la 1 en el mismo), así que en el registro cuenta como un
// navegador de orden 1: anotar la hora de la corrida para restarla.
//
// Guarda todo en bateria/resultados/<fecha y hora UTC>.json. La calificación
// automática es un primer filtro: las que fallan se revisan a mano, para
// separar un error del asistente de uno de la calificación.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SITIO = 'https://dflores296.github.io/NOM-001-SEDE-2012/asistente/';
const { version, preguntas } = JSON.parse(
  fs.readFileSync(path.join(AQUI, 'preguntas.json'), 'utf8')
);

// Las respuestas terminadas del chat (las de la página y los avisos).
const RESPUESTAS = '.asis-chat .asis-ia:not(.asis-pensando)';
// La página se rinde a los 90 s por consulta, y una pregunta hace hasta tres.
const ESPERA_MS = 300_000;
// El Worker deja 15 consultas por minuto por conexión, y una pregunta hace
// hasta tres: entre el inicio de una y el de la siguiente, al menos 15 s.
const ENTRE_MS = 15_000;

const solo = (() => {
  const i = process.argv.indexOf('--solo');
  return i > 0 ? new Set(process.argv[i + 1].split(',').map(Number)) : null;
})();

/** El texto como se compara: minúsculas, «mm²», sin el espacio de miles. */
const normal = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
    .replace(/[\u2010-\u2013\u2212]/g, '-')
    .replace(/mm2\b/g, 'mm²')
    .replace(/(\d) (\d{3})\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

/** Una referencia como se compara: sin «sección» ni «artículo» delante. */
const ref = (s) => normal(s).replace(/^(secci[oó]n|art[ií]culo)\s+/, '');

/** ¿Cita la referencia esperada, o algo de adentro (210-8(a) → 210-8(a)(1))? */
function cita(citadas, esperada) {
  const e = ref(esperada);
  return citadas.some((c) => {
    const a = ref(c);
    return a === e || a.startsWith(`${e}(`) || a.startsWith(`${e} `);
  });
}

/** ¿Cita la sección de arriba de la esperada (680-22 por 680-22(a)(2))? Cuenta aparte. */
function citaArriba(citadas, esperada) {
  const e = ref(esperada);
  return citadas.some((c) => {
    const a = ref(c);
    return a.length < e.length && e.startsWith(`${a}(`);
  });
}

function calificar(p, r) {
  const texto = normal(r.texto);
  const citadas = [...r.citas, ...[...r.texto.matchAll(/\[([^\]]{1,80})\]/g)].map((m) => m[1])];
  const out = {};
  if (p.citar?.length) {
    out.cita = p.citar.some((e) => cita(citadas, e));
    if (!out.cita) out.cita_arriba = p.citar.some((e) => citaArriba(citadas, e));
    out.leyo = p.citar.some((e) => cita(r.fuentes, e));
  }
  if (p.decir?.length) {
    out.faltan = p.decir.filter((g) => !g.some((x) => new RegExp(x, 'u').test(texto)));
    out.valor = !out.faltan.length;
  }
  out.prohibidos = (p.no_decir ?? []).filter((x) => new RegExp(x, 'u').test(texto));
  // Una cita a la sección de arriba es imprecisa, no equivocada: el valor
  // decide. Se cuenta aparte en el resumen.
  out.bien =
    !r.aviso &&
    (out.cita !== false || out.cita_arriba) &&
    out.valor !== false &&
    !out.prohibidos.length &&
    !p.manual;
  return out;
}

/**
 * El resumen de una corrida. Las de revisión manual cuentan con lo que diga
 * `revision_manual` del archivo de resultados ({ id: { bien, nota } }).
 */
function resumir(resultados, manual = {}) {
  const conCita = resultados.filter((r) => r.calificacion.cita !== undefined);
  const conValor = resultados.filter((r) => r.calificacion.valor !== undefined);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const tiempos = resultados
    .map((r) => r.segundos)
    .filter((s) => s != null)
    .sort((a, b) => a - b);
  const correctas = resultados.filter((r) =>
    manual[r.id] ? manual[r.id].bien : r.calificacion.bien
  );
  return {
    preguntas: resultados.length,
    correctas: `${correctas.length} de ${resultados.length}`,
    correctas_pct: pct(correctas.length, resultados.length),
    incorrectas: resultados.filter((r) => !correctas.includes(r)).map((r) => r.id),
    citas_exactas: `${conCita.filter((r) => r.calificacion.cita).length} de ${conCita.length}`,
    citas_exactas_pct: pct(conCita.filter((r) => r.calificacion.cita).length, conCita.length),
    citas_a_la_seccion_de_arriba: conCita
      .filter((r) => r.calificacion.cita_arriba)
      .map((r) => r.id),
    leyo_lo_esperado: `${conCita.filter((r) => r.calificacion.leyo).length} de ${conCita.length}`,
    valores_correctos: `${conValor.filter((r) => r.calificacion.valor).length} de ${conValor.length}`,
    valores_pct: pct(conValor.filter((r) => r.calificacion.valor).length, conValor.length),
    con_prohibidos: resultados.filter((r) => r.calificacion.prohibidos.length).map((r) => r.id),
    sin_respuesta: resultados.filter((r) => r.aviso).map((r) => r.id),
    redacto_el_respaldo: resultados.filter((r) => /gpt-oss-20b/.test(r.modelo)).map((r) => r.id),
    revisadas_a_mano: Object.keys(manual).map(Number),
    sin_revisar_a_mano: resultados
      .filter((r) => preguntas.find((p) => p.id === r.id)?.manual && !manual[r.id])
      .map((r) => r.id),
    segundos_mediana: tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null,
    segundos_max: tiempos.at(-1) ?? null,
  };
}

// --recalificar <archivo>: vuelve a calificar una corrida guardada con las
// preguntas de hoy, sin preguntar nada (no gasta cupo).
const iRecalificar = process.argv.indexOf('--recalificar');
if (iRecalificar > 0) {
  const archivo = path.resolve(process.argv[iRecalificar + 1]);
  const corrida = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  for (const r of corrida.resultados) {
    r.calificacion = calificar(
      preguntas.find((p) => p.id === r.id),
      r
    );
  }
  corrida.version_preguntas = version;
  corrida.recalificada_utc = new Date().toISOString();
  corrida.resumen = resumir(corrida.resultados, corrida.revision_manual);
  fs.writeFileSync(archivo, `${JSON.stringify(corrida, null, 2)}\n`);
  console.log(corrida.resumen);
  process.exit(0);
}

/** Hace una pregunta en la burbuja y espera la respuesta. */
async function preguntar(page, texto) {
  const antes = await page.locator(RESPUESTAS).count();
  if (await page.isHidden('#asis-panel')) await page.click('.asis-lanzar');
  await page.fill('#asis-campo', texto);
  const inicio = Date.now();
  await page.press('#asis-campo', 'Enter');
  await page.waitForFunction(
    ([sel, k]) =>
      document.querySelectorAll(sel).length > k && !document.querySelector('.asis-enviar').disabled,
    [RESPUESTAS, antes],
    { timeout: ESPERA_MS }
  );
  const ultima = page.locator(RESPUESTAS).last();
  return {
    segundos: Math.round((Date.now() - inicio) / 100) / 10,
    aviso: await ultima.evaluate((li) => li.classList.contains('asis-error')),
    texto: (await ultima.locator('.asis-burbuja').innerText()).trim(),
    citas: await ultima.locator('.asis-burbuja a').allInnerTexts(),
    fuentes: await ultima.locator('.asis-fuente').allInnerTexts(),
    modelo: (await ultima.locator('.asis-modelo').allInnerTexts())[0] ?? '',
  };
}

// Las conversaciones: cada pregunta sola, salvo las que siguen a otra.
const conversaciones = [];
for (const p of preguntas) {
  if (solo && !solo.has(p.id) && !(p.sigue && solo.has(p.sigue))) continue;
  const previa = p.sigue && conversaciones.find((c) => c.some((q) => q.id === p.sigue));
  if (previa) previa.push(p);
  else conversaciones.push([p]);
}

const navegador = await chromium.launch(
  process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}
);
const inicio = new Date();
const resultados = [];
let ultimaVez = 0;
for (const conv of conversaciones) {
  const ctx = await navegador.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(SITIO, { waitUntil: 'networkidle' });
  for (const p of conv) {
    const falta = ultimaVez + ENTRE_MS - Date.now();
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    ultimaVez = Date.now();
    let r;
    try {
      r = await preguntar(page, p.pregunta);
    } catch (e) {
      r = { segundos: null, aviso: true, texto: `(sin respuesta: ${e.message.split('\n')[0]})` };
      r.citas = [];
      r.fuentes = [];
      r.modelo = '';
    }
    const c = calificar(p, r);
    resultados.push({ id: p.id, pregunta: p.pregunta, ...r, calificacion: c });
    const marca = c.bien ? '✓' : p.manual && !r.aviso ? '?' : '✗';
    console.log(
      `${marca} ${String(p.id).padStart(2)} ${r.segundos ?? '-'} s ${r.modelo || (r.aviso ? 'aviso' : '')}` +
        (c.cita === false ? ' · sin la cita' : '') +
        (c.valor === false ? ' · sin el valor' : '') +
        (c.prohibidos?.length ? ` · dijo lo prohibido (${c.prohibidos.join(', ')})` : '') +
        (p.manual ? ' · revisar a mano' : '')
    );
  }
  await ctx.close();
}
await navegador.close();
const fin = new Date();

const resumen = resumir(resultados);

const salida = {
  version_preguntas: version,
  sitio: SITIO,
  inicio_utc: inicio.toISOString(),
  fin_utc: fin.toISOString(),
  resumen,
  resultados,
};
const dir = path.join(AQUI, 'resultados');
fs.mkdirSync(dir, { recursive: true });
const archivo = path.join(dir, `${inicio.toISOString().slice(0, 16).replace(':', '')}Z.json`);
fs.writeFileSync(archivo, `${JSON.stringify(salida, null, 2)}\n`);
console.log('\n', resumen, `\nGuardado en ${path.relative(process.cwd(), archivo)}`);
console.log(`Corrida de ${salida.inicio_utc} a ${salida.fin_utc} (UTC).`);
