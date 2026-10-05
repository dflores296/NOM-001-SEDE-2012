// Pruebas en navegador del sitio compilado: lo que la huella del contenido no
// ve porque vive en JavaScript (buscador, tema, índice lateral, mapa...).
//
//     cd site && npm run build && npm run prueba
//
// Usa Chromium de Playwright. Cada prueba abre un contexto nuevo, sin service
// worker, y la API de GitHub se responde aquí mismo: las estrellas no dependen
// de la red y la prueba tampoco.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servir, BASE } from './servidor.mjs';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const ESCRITORIO = { viewport: { width: 1440, height: 900 } };
const TELEFONO = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** El archivo de dist/ al que lleva un href del sitio, y su ancla. */
function destinoDe(href) {
  const [ruta, ancla = ''] = href.split('#');
  let f = path.join(DIST, ruta.slice(BASE.length));
  if (!path.extname(f)) f = path.join(f, 'index.html');
  return { f, ancla: decodeURIComponent(ancla) };
}

async function resultados(page, q, caja = '.search-top') {
  await page.fill(`${caja} input`, '');
  await page.fill(`${caja} input`, q);
  // La primera vez se abre con el aviso de que el índice se está armando.
  await page.waitForSelector(`${caja} .results.open:not(:has(.cargando))`);
  await page.waitForTimeout(250);
  return page.$$eval(`${caja} .results a`, (as) =>
    as.map((a) => ({
      href: a.getAttribute('href'),
      rid: a.querySelector('.rid')?.textContent.trim() || '',
      rsn: a.querySelector('.rsn')?.textContent.trim() || '',
    }))
  );
}

// ------------------------------------------------------------------ páginas

const PAGINAS = [
  '/',
  '/art/250/',
  '/art/100/',
  '/tablas/',
  '/tablas/generales/',
  '/figuras/',
  '/glosario/',
  '/apendices/',
  '/apendices/A/',
  '/cierre/',
  '/observaciones/',
  '/mapa/',
];

prueba(
  'Las páginas cargan sin errores de JavaScript, en escritorio y en teléfono',
  async ({ nuevaPagina }) => {
    for (const vista of [ESCRITORIO, TELEFONO]) {
      for (const ruta of PAGINAS) {
        const { page, errores } = await nuevaPagina(vista);
        const r = await page.goto(ruta, { waitUntil: 'networkidle' });
        afirmar(r.status() === 200, `${ruta} respondió ${r.status()}`);
        await page.waitForTimeout(ruta === '/mapa/' ? 2000 : 200);
        afirmar(
          !errores.length,
          `${ruta} (${vista.isMobile ? 'teléfono' : 'escritorio'}): ${errores.join(' | ')}`
        );
      }
    }
  }
);

// ----------------------------------------------------------- accesibilidad

prueba(
  'Cada página tiene un solo contenido principal y el primer Tab ofrece saltar a él',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(ESCRITORIO);
    for (const ruta of PAGINAS) {
      await page.goto(ruta, { waitUntil: 'networkidle' });
      const n = await page.$$eval('main#contenido', (ms) => ms.length);
      afirmar(
        n === 1 && (await page.$$eval('main', (ms) => ms.length)) === 1,
        `${ruta}: ${n} main#contenido`
      );
    }
    await page.goto('/art/250/', { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    afirmar(
      await page.evaluate(() => document.activeElement?.matches('a.saltar')),
      'el primer Tab no llega a «Saltar al contenido»'
    );
    afirmar(await page.isVisible('a.saltar'), 'el enlace no se ve al recibir el foco');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'contenido');
  }
);

prueba('Los encabezados no se saltan niveles', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  for (const ruta of PAGINAS) {
    await page.goto(ruta, { waitUntil: 'networkidle' });
    const saltos = await page.$$eval('h1, h2, h3, h4, h5, h6', (hs) => {
      const out = [];
      let prev = 0;
      for (const h of hs) {
        if (h.closest('[hidden], dialog, aside, .side, .toc')) continue;
        const n = +h.tagName[1];
        if (prev && n > prev + 1)
          out.push(`${h.tagName} «${h.textContent.trim().slice(0, 30)}» tras h${prev}`);
        prev = n;
      }
      return out;
    });
    afirmar(!saltos.length, `${ruta}: ${saltos.join(' · ')}`);
  }
});

prueba('Una tabla que se desliza se puede recorrer con el teclado', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(TELEFONO);
  await page.goto('/art/430/#tabla-430-250', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const caja = '#tabla-430-250 .tabla-scroll';
  afirmar(
    await page.$eval(
      caja,
      (s) =>
        s.tabIndex === 0 &&
        s.getAttribute('role') === 'region' &&
        s.getAttribute('aria-label') === 'Tabla 430-250'
    ),
    'la caja no es una región enfocable con nombre'
  );
  await page.focus(caja);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  // El desplazamiento con flechas puede ser animado: se espera a que avance.
  await page
    .waitForFunction((c) => document.querySelector(c).scrollLeft > 0, caja, { timeout: 3000 })
    .catch(() => {
      throw new Error('las flechas no la desplazan');
    });
});

// ---------------------------------------------------------------- buscador

prueba('El buscador entiende un código escrito pegado, sin paréntesis', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  // Como se escribe en el teléfono: "310-15b16" es la Tabla 310-15(b)(16) y
  // "250-32b1" el inciso 250-32(b)(1). Los dos deben salir primero.
  const [tabla] = await resultados(page, '310-15b16');
  afirmar(tabla?.href.endsWith('/art/310#tabla-310-15-b-16'), `primero: ${tabla?.href}`);
  const [inciso] = await resultados(page, '250-32b1');
  afirmar(inciso?.href.endsWith('/art/250#250-32(b)(1)'), `primero: ${inciso?.href}`);
});

prueba(
  'Cada resultado del buscador lleva a una página y un ancla que existen',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(ESCRITORIO);
    await page.goto('/art/250/', { waitUntil: 'networkidle' });
    const rotos = [];
    let total = 0;
    for (const q of [
      '310-15b16',
      'Tabla 430-250',
      'tabla 310-16',
      'Tabla 1',
      'ampacidad',
      'acometida',
      'tablero',
      'Tabla 250-122',
      'Tabla B-310-15',
      'falla a tierra',
      'Figura 250-1',
      'motores',
      'Tabla 9',
      'Tabla C-1',
      'Tabla B1.1',
    ]) {
      for (const { href } of await resultados(page, q)) {
        total++;
        const { f, ancla } = destinoDe(href);
        if (!fs.existsSync(f)) {
          rotos.push(`${q}: ${href} (no existe la página)`);
          continue;
        }
        if (ancla && !fs.readFileSync(f, 'utf8').includes(`id="${ancla}"`))
          rotos.push(`${q}: ${href}`);
      }
    }
    afirmar(total > 200, `solo ${total} resultados revisados`);
    afirmar(!rotos.length, `${rotos.length} de ${total} rotos: ${rotos.slice(0, 5).join(' · ')}`);
  }
);

prueba(
  'Una tabla de apéndice se rotula con su apéndice, no como Capítulo 10',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(ESCRITORIO);
    await page.goto('/art/250/', { waitUntil: 'networkidle' });
    const rs = await resultados(page, 'Tabla C-1');
    const c1 = rs.find((r) => r.href.includes('/apendices/C/'));
    afirmar(c1, 'la Tabla C-1 no lleva al Apéndice C');
    afirmar(/Apéndice C/.test(c1.rsn), `rótulo: "${c1.rsn}"`);
  }
);

prueba('Enter lleva al primer resultado', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/glosario/', { waitUntil: 'networkidle' });
  const [primero] = await resultados(page, '250-32');
  await Promise.all([
    page.waitForURL((u) => u.pathname.includes('/art/250')),
    page.press('.search-top input', 'Enter'),
  ]);
  afirmar(primero.href.includes('/art/250'), `el primer resultado era ${primero.href}`);
});

prueba('Con «ampacidad» la Tabla 310-15(b)(16) encabeza las tablas', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  for (const q of ['ampacidad', 'ampacidades']) {
    const tablas = (await resultados(page, q)).filter((r) => r.rid.startsWith('Tabla'));
    afirmar(
      tablas[0]?.rid === 'Tabla 310-15(b)(16)',
      `${q}: ${tablas.map((r) => r.rid).join(', ')}`
    );
  }
});

prueba(
  'Mientras se arma el índice, el buscador avisa que se está preparando',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(TELEFONO);
    // Como en un teléfono con mala señal: el índice tarda en llegar.
    await page.route('**/data/indice.json', async (ruta) => {
      await new Promise((r) => setTimeout(r, 1500));
      await ruta.continue();
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.fill('.hero-buscar input', 'acometida');
    await page.waitForSelector('.hero-buscar .results.open .cargando');
    await page.waitForSelector('.hero-buscar .results.open a', { timeout: 15000 });
    afirmar(
      !(await page.$('.hero-buscar .results .cargando')),
      'el aviso se quedó con los resultados'
    );
  }
);

prueba(
  'Con señal lenta, los resultados salen antes que los fragmentos y estos llegan después',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(TELEFONO);
    // Los textos de los fragmentos tardan: los resultados no deben esperarlos.
    await page.route('**/data/textos.json', async (ruta) => {
      await new Promise((r) => setTimeout(r, 2000));
      await ruta.continue();
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.fill('.hero-buscar input', 'puesta a tierra');
    await page.waitForSelector('.hero-buscar .results.open a', { timeout: 15000 });
    afirmar(
      !(await page.$('.hero-buscar .results .rsnip')),
      'los fragmentos llegaron antes que los textos'
    );
    await page.waitForSelector('.hero-buscar .results .rsnip mark', { timeout: 15000 });
  }
);

prueba('Una búsqueda sin coincidencias lo dice', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  await page.fill('.search-top input', 'zqxjwv');
  await page.waitForSelector('.search-top .results.open .empty');
});

prueba('La tecla / lleva al buscador', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  afirmar(
    await page.evaluate(() => document.activeElement?.matches('input[data-buscar]')),
    'el foco no quedó en el buscador'
  );
});

prueba('El buscador de la portada también busca', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/', { waitUntil: 'networkidle' });
  const rs = await resultados(page, 'acometida', '.hero-buscar');
  afirmar(rs.length, 'sin resultados');
});

// --------------------------------------------------------------- cabecera

prueba('En la portada, el buscador de la cabecera aparece al bajar', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/', { waitUntil: 'networkidle' });
  afirmar(
    await page.$eval('.search-top', (e) => e.classList.contains('oculto')),
    'visible al cargar'
  );
  await page.mouse.wheel(0, 1400);
  await page.waitForFunction(
    () => !document.querySelector('.search-top').classList.contains('oculto')
  );
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  afirmar(
    !(await page.$eval('.search-top', (e) => e.classList.contains('oculto'))),
    'oculto en un artículo'
  );
});

prueba('El botón de GitHub muestra las estrellas', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.gh-n')?.textContent.trim() === '7');
});

// ------------------------------------------------------------------- tema

prueba('El interruptor cambia el tema y lo recuerda', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina({ ...ESCRITORIO, colorScheme: 'light' });
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  const tema = () => page.evaluate(() => document.documentElement.dataset.theme || '');
  const antes = await tema();
  await page.click('#tema');
  const despues = await tema();
  afirmar(
    despues && despues !== antes,
    `el tema no cambió (${antes || 'sin tema'} → ${despues || 'sin tema'})`
  );
  await page.reload({ waitUntil: 'networkidle' });
  afirmar((await tema()) === despues, 'no se recordó al recargar');
});

prueba('Un tema viejo guardado (sepia) se migra a claro', async ({ nuevaPagina }) => {
  const { page, ctx } = await nuevaPagina(ESCRITORIO);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('nom-tema', 'sepia');
    } catch {}
  });
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => document.documentElement.dataset.theme);
  afirmar(t === 'claro', `tema: ${t}`);
});

// ---------------------------------------------------------- índice lateral

prueba('El índice lateral marca la sección que se está leyendo', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/#250-32', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const on = await page.$$eval('.toc a.on', (as) => as.map((a) => a.getAttribute('href')));
  afirmar(
    on.some((h) => h.endsWith('#250-32')),
    `marcado: ${on.join(', ') || 'nada'}`
  );
});

prueba(
  'En el teléfono, el índice de la página se abre desde abajo y lleva a la sección',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(TELEFONO);
    await page.goto('/art/250/#250-32', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    afirmar(
      /250-32/.test(await page.textContent('.im-abrir')),
      `el botón dice: ${await page.textContent('.im-abrir')}`
    );
    await page.click('.im-abrir');
    await page.waitForSelector('.im-hoja[open]');
    afirmar(
      (await page.$eval('.im-hoja a.on', (a) => a.getAttribute('href'))) === '#250-32',
      'la hoja no marca 250-32'
    );
    await page.click('.im-hoja a[href="#250-122"]');
    await page.waitForFunction(() => !document.querySelector('.im-hoja').open);
    await page.waitForTimeout(400);
    afirmar(page.url().endsWith('#250-122'), `quedó en ${page.url()}`);
    afirmar(
      /250-122/.test(await page.textContent('.im-abrir')),
      `el botón dice: ${await page.textContent('.im-abrir')}`
    );
    await page.click('.im-arriba');
    await page.waitForFunction(() => scrollY === 0);
  }
);

prueba('En escritorio no aparecen los botones del índice móvil', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  afirmar(!(await page.isVisible('.im-abrir')), 'el botón del índice móvil se ve en escritorio');
});

prueba(
  'En el teléfono, una tabla ancha avisa que se desliza y deja fija su primera columna',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(TELEFONO);
    await page.goto('/art/310/#tabla-310-15-b-16', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const t = '#tabla-310-15-b-16';
    afirmar(
      /Desliza para ver las \d+ columnas/.test(await page.textContent(`${t} .tabla-desliza`)),
      'sin aviso de deslizar'
    );
    // mm² y AWG (el encabezado «Tamaño o designación» las agrupa) se quedan
    // en su lugar al deslizar; el resto de la fila se va.
    const antes = await page.$$eval(`${t} tbody tr:nth-child(3) td`, (tds) =>
      tds.slice(0, 3).map((c) => c.getBoundingClientRect().left)
    );
    await page.$eval(`${t} .tabla-scroll`, (s) => {
      s.scrollLeft = 200;
    });
    await page.waitForTimeout(200);
    const despues = await page.$$eval(`${t} tbody tr:nth-child(3) td`, (tds) =>
      tds.slice(0, 3).map((c) => c.getBoundingClientRect().left)
    );
    afirmar(
      Math.abs(antes[0] - despues[0]) < 1 && Math.abs(antes[1] - despues[1]) < 1,
      `las columnas fijas se movieron: ${antes} → ${despues}`
    );
    afirmar(despues[2] < antes[2] - 100, 'la tercera columna no se deslizó');
  }
);

prueba('Una tabla que cabe no lleva aviso ni columnas fijas', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/#tabla-250-122', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  afirmar(!(await page.isVisible('#tabla-250-122 .tabla-desliza')), 'aviso en una tabla que cabe');
  afirmar(!(await page.$('#tabla-250-122 .fija')), 'columna fija en una tabla que cabe');
});

prueba(
  'Una dirección que no existe muestra la página 404 con buscador y atajos',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(TELEFONO);
    const r = await page.goto('/art/250-122', { waitUntil: 'networkidle' });
    afirmar(r.status() === 404, `respondió ${r.status()}`);
    afirmar((await page.textContent('h1')).includes('no existe'), 'sin el título de la 404');
    // La dirección traía un código que sí existe: se ofrece el enlace directo.
    const enlace = await page.getAttribute('.sugerencia a', 'href');
    afirmar(enlace?.endsWith('/art/250/#250-122'), `sugerencia: ${enlace}`);
    await Promise.all([page.waitForURL((u) => u.hash === '#250-122'), page.click('.sugerencia a')]);
    // Un artículo que no existe no inventa sugerencia; el buscador sí funciona.
    await page.goto('/art/999/', { waitUntil: 'networkidle' });
    afirmar(await page.isHidden('.sugerencia'), 'sugirió un artículo que no existe');
    const rs = await resultados(page, 'acometida', '.buscar-404');
    afirmar(rs.length, 'el buscador de la 404 no dio resultados');
  }
);

prueba(
  'Cada página trae su vista previa para compartir, con dirección completa',
  async ({ nuevaPagina }) => {
    const { page } = await nuevaPagina(ESCRITORIO);
    await page.goto('/art/250/', { waitUntil: 'domcontentloaded' });
    const og = (k) => page.getAttribute(`meta[property="og:${k}"]`, 'content');
    afirmar((await og('title')).startsWith('Artículo 250'), `og:title: ${await og('title')}`);
    afirmar((await og('description')).includes('Puesta a tierra'), 'og:description');
    afirmar(
      (await og('url')) === 'https://dflores296.github.io/NOM-001-SEDE-2012/art/250/',
      `og:url: ${await og('url')}`
    );
    const img = await og('image');
    afirmar(img === 'https://dflores296.github.io/NOM-001-SEDE-2012/ui/og.jpg', `og:image: ${img}`);
    afirmar(fs.existsSync(path.join(DIST, 'ui', 'og.jpg')), 'no se publicó ui/og.jpg');
    // La 404 se sirve en cualquier dirección: no declara una propia.
    await page.goto('/no-existe/', { waitUntil: 'domcontentloaded' });
    afirmar(
      !(await page.$('link[rel="canonical"], meta[property="og:url"]')),
      'la 404 declara dirección propia'
    );
  }
);

prueba('Un identificador retirado avisa dónde quedó su contenido', async ({ nuevaPagina }) => {
  const mapa = JSON.parse(fs.readFileSync(path.join(DIST, 'ids-retirados.json'), 'utf8'));
  const [viejo, nuevo] =
    Object.entries(mapa).find(([v]) => v.startsWith('250-')) || Object.entries(mapa)[0];
  const art = viejo.slice(0, 3);
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto(`/art/${art}/#${encodeURIComponent(viejo)}`, { waitUntil: 'networkidle' });
  const aviso = await page.waitForSelector('.aviso-ancla');
  const txt = await aviso.textContent();
  afirmar(txt.includes(viejo) && txt.includes(nuevo), `aviso: ${txt}`);
});

// -------------------------------------------------------------- portada

prueba('El video de la portada solo se carga en escritorio', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/', { waitUntil: 'networkidle' });
  afirmar(await page.$('.portada-fondo video'), 'sin video en escritorio');
  const tel = await nuevaPagina(TELEFONO);
  await tel.page.goto('/', { waitUntil: 'networkidle' });
  afirmar(!(await tel.page.$('.portada-fondo video')), 'hay video en el teléfono');
});

// ------------------------------------------------------------------ mapa

prueba('El mapa busca un punto de partida y sigue sus hilos', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/mapa/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.mapa canvas', { timeout: 20000 });
  await page.fill('.mapa-busca input', '250-122');
  await page.waitForSelector('#mapa-sug li');
  await page.press('.mapa-busca input', 'Enter');
  await page.waitForFunction(() => location.hash === '#250-122');
  afirmar(await page.$eval('.mapa-recorrido', (e) => !e.hidden), 'el recorrido no apareció');
});

prueba('En el teléfono, el mapa no carga la librería 3D', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(TELEFONO);
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto('/mapa/', { waitUntil: 'networkidle' });
  afirmar(
    await page.$eval('.mapa-movil', (e) => getComputedStyle(e).display !== 'none'),
    'sin aviso móvil'
  );
  afirmar(
    !pedidos.some((u) => /3d-force-graph|mapa\.json/.test(u)),
    'pidió la librería 3D o los datos'
  );
});

// ---------------------------------------------------------------- correr

const { url, cerrar } = await servir(DIST);
const navegador = await chromium.launch();
let fallas = 0;
for (const { nombre, fn } of pruebas) {
  const abiertos = [];
  const nuevaPagina = async (opciones = {}) => {
    const ctx = await navegador.newContext({
      ...opciones,
      baseURL: `${url}/`,
      serviceWorkers: 'block',
    });
    abiertos.push(ctx);
    await ctx.route('https://api.github.com/**', (r) =>
      r.fulfill({ json: { stargazers_count: 7 } })
    );
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errores.push(m.text());
    });
    // Las rutas de las pruebas van relativas al sitio: '/art/250/' -> url + '/art/250/'.
    const goto = page.goto.bind(page);
    page.goto = (ruta, o) => goto(ruta.startsWith('http') ? ruta : url + ruta, o);
    return { page, ctx, errores };
  };
  const t0 = Date.now();
  try {
    await fn({ nuevaPagina });
    console.log(`  ✓ ${nombre} (${Date.now() - t0} ms)`);
  } catch (e) {
    fallas++;
    console.log(`  ✗ ${nombre}\n      ${String(e.message).split('\n')[0]}`);
  } finally {
    for (const c of abiertos) await c.close();
  }
}
await navegador.close();
await cerrar();
console.log(
  fallas
    ? `\n${fallas} de ${pruebas.length} pruebas fallaron.`
    : `\nLas ${pruebas.length} pruebas pasaron.`
);
process.exit(fallas ? 1 : 0);
