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
  '/preguntar/',
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

// ----------------------------------------------------------- seguridad

prueba('Un script inyectado en la página no corre: lo detiene la CSP', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/art/250/', { waitUntil: 'networkidle' });
  afirmar(
    await page.$('meta[http-equiv="content-security-policy"]'),
    'la página no trae Content-Security-Policy'
  );
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="x" onerror="window.__inyectado = 1">';
    document.body.append(d);
    const s = document.createElement('script');
    s.textContent = 'window.__inyectado = 2';
    document.body.append(s);
  });
  await page.waitForTimeout(300);
  afirmar(
    (await page.evaluate(() => window.__inyectado)) === undefined,
    'corrió el script inyectado'
  );
});

prueba('Un enlace armado no llena el formulario de observaciones', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  let alerta = false;
  page.on('dialog', (d) => {
    alerta = true;
    d.dismiss();
  });
  const ref = encodeURIComponent('<img src=x onerror=alert(1)> Urgente: https://phish.example');
  await page.goto(`/observaciones/?ref=${ref}&de=${encodeURIComponent('https://phish.example/')}`, {
    waitUntil: 'networkidle',
  });
  afirmar((await page.inputValue('#ref')) === '', 'llenó la referencia con lo del enlace');
  afirmar(!(await page.$('#ref[readonly]')), 'dejó fija la referencia del enlace');
  afirmar(!alerta, 'se ejecutó código del enlace');
});

prueba('Lo que se manda a Formspree va limpio y solo con lo esperado', async ({ nuevaPagina }) => {
  const { page, ctx } = await nuevaPagina(ESCRITORIO);
  let cuerpo = null;
  await ctx.route('https://formspree.io/**', (r) => {
    cuerpo = r.request().postData();
    r.fulfill({ json: { ok: true } });
  });
  const de = encodeURIComponent('/NOM-001-SEDE-2012/art/250/#250-32');
  await page.goto(`/observaciones/?ref=250-32(a)(1)&de=${de}`, { waitUntil: 'networkidle' });
  afirmar((await page.inputValue('#ref')) === '250-32(a)(1)', 'no tomó la referencia legítima');
  afirmar(await page.$('#ref[readonly]'), 'la referencia legítima no quedó fija');

  await page.fill(
    'textarea[name="observacion"]',
    'Dice 600 <script>alert(1)</script> y debe ser 1000. Ver https://phish.example/login'
  );
  await page.fill('input[name="email"]', 'yo@example.com');
  // Un campo que alguien le agregue a la página no viaja.
  await page.evaluate(() => {
    const i = Object.assign(document.createElement('input'), { name: '_cc', value: 'x@y.com' });
    document.getElementById('obs-form').append(i);
  });
  // Antes de 3 s el envío se da por bueno sin mandarse (ver MINIMO_MS).
  await page.waitForTimeout(3100);
  await page.click('#enviar');
  await page.waitForSelector('#obs-exito:not([hidden])');

  afirmar(cuerpo, 'no se mandó nada');
  const campos = Object.fromEntries(
    [...cuerpo.matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g)].map((m) => [m[1], m[2]])
  );
  afirmar(!('_cc' in campos), 'viajó un campo agregado');
  afirmar(!/<script/i.test(campos.observacion), `observación: ${campos.observacion}`);
  afirmar(campos.observacion.includes('hxxps://phish[.]example/login'), campos.observacion);
  afirmar(campos._subject === 'Observación: 250-32(a)(1)', `asunto: ${campos._subject}`);
  afirmar(campos.url?.endsWith('/NOM-001-SEDE-2012/art/250/#250-32'), `url: ${campos.url}`);
  afirmar(campos.email === 'yo@example.com', `email: ${campos.email}`);
});

// ------------------------------------------------------------------ asistente

// /preguntar con el asistente apuntando a una dirección de este mismo
// servidor, que la prueba contesta: así se prueba la página aunque el sitio
// se haya compilado sin asistente (src/lib/asistente.js vacío), y la CSP lo
// deja pasar porque es 'self'. `contestar` recibe lo que mandó la página.
async function conAsistente(nuevaPagina, contestar) {
  const { page, ctx, errores } = await nuevaPagina(ESCRITORIO);
  await ctx.route('**/preguntar/', async (r) => {
    const resp = await r.fetch();
    const origen = new URL(r.request().url()).origin;
    const html = (await resp.text()).replace(
      /data-asistente(="[^"]*")?/,
      `data-asistente="${origen}/__asistente"`
    );
    await r.fulfill({ response: resp, body: html });
  });
  await ctx.route('**/__asistente', async (r) => {
    const { estado = 200, json } = await contestar(JSON.parse(r.request().postData()));
    await r.fulfill({ status: estado, json });
  });
  let alerta = false;
  page.on('dialog', (d) => {
    alerta = true;
    d.dismiss();
  });
  await page.goto('/preguntar/', { waitUntil: 'networkidle' });
  return { page, errores, alerta: () => alerta };
}

const PREGUNTA_20A =
  '¿Qué calibre mínimo lleva el conductor de puesta a tierra de equipos en un circuito de 20 A?';

prueba('Sin asistente conectado no hay pestaña, y /preguntar lo dice', async ({ nuevaPagina }) => {
  const { page } = await nuevaPagina(ESCRITORIO);
  await page.goto('/preguntar/', { waitUntil: 'networkidle' });
  const url = await page.getAttribute('main', 'data-asistente');
  const pestana = await page.$('nav.tabs a[href$="/preguntar/"]');
  if (url) {
    afirmar(pestana, 'conectado y sin pestaña');
    afirmar(await page.isVisible('#preg-form'), 'conectado y sin formulario');
    afirmar(await page.isVisible('#preg-guia'), 'conectado y sin la guía');
  } else {
    afirmar(!pestana, 'hay pestaña sin asistente');
    afirmar(await page.isVisible('#preg-cerrado'), 'no avisa que no está conectado');
    afirmar(!(await page.isVisible('#preg-form')), 'enseña un formulario que no funciona');
    afirmar(
      !(await page.isVisible('#preg-guia')),
      'enseña la guía de un asistente que no funciona'
    );
  }
});

// Un asistente de mentiras que contesta cada paso como lo haría el modelo, y
// anota lo que recibió en cada uno.
function asistenteDePrueba(respuestas) {
  const recibido = [];
  const contestar = (cuerpo) => {
    recibido.push(cuerpo);
    const r = respuestas[cuerpo.paso];
    return typeof r === 'function' ? r(cuerpo) : { json: { respuesta: r } };
  };
  return { recibido, contestar };
}

const RESPUESTA_20A =
  '**Respuesta**: según la [Tabla 250-122], para 20 A el mínimo es 3.31 mm² (12 AWG), y [250-122(a)] dice que nunca menor que la tabla <img src=x onerror=alert(1)>.\n\n- También lo dice el [999-99].';

prueba(
  'El asistente lee el índice, escoge, recibe la norma completa y su respuesta enlaza lo que cita',
  async ({ nuevaPagina }) => {
    // Pide solo el inciso: la Tabla 250-122, que el inciso cita, la agrega
    // la página.
    const { recibido, contestar } = asistenteDePrueba({
      articulos: 'Artículo 250',
      secciones: '250-122(a)',
      responder: RESPUESTA_20A,
    });
    const { page, errores, alerta } = await conAsistente(nuevaPagina, contestar);
    await page.fill('#preg-campo', PREGUNTA_20A);
    await page.press('#preg-campo', 'Enter');
    await page.waitForSelector('.preg-r .preg-ia', { timeout: 20000 });

    afirmar(
      JSON.stringify(recibido.map((c) => c.paso)) === '["articulos","secciones","responder"]',
      `pasos: ${recibido.map((c) => c.paso).join(', ')}`
    );
    const [uno, dos, tres] = recibido;
    afirmar(
      uno.pregunta === PREGUNTA_20A && uno.indice.includes('250 Puesta a tierra'),
      'paso 1 sin índice general'
    );
    afirmar(
      dos.indice.startsWith('Artículo 250') && dos.indice.includes('250-122 '),
      'paso 2 sin el índice del 250'
    );
    // Las pistas del buscador: en el paso 1 con su artículo; en el 2, solo
    // las del 250.
    const pistas = (indice) => indice.split('— Pistas del buscador de la guía')[1] ?? '';
    afirmar(/\(artículo 250\)/.test(pistas(uno.indice)), 'paso 1 sin pistas');
    afirmar(
      pistas(dos.indice).includes('\n250-') && !pistas(dos.indice).includes('(artículo'),
      'paso 2 sin las pistas del 250'
    );
    const refs = tres.fragmentos.map((f) => f.ref);
    afirmar(JSON.stringify(refs) === '["250-122(a)","Tabla 250-122"]', `refs: ${refs.join(', ')}`);
    afirmar(tres.fragmentos[0].texto.startsWith('[250-122] '), 'el inciso llegó sin su sección');
    afirmar(
      tres.fragmentos[1].texto.includes('20 | 3.31 | 12'),
      'la tabla no fue renglón por renglón'
    );
    afirmar(
      tres.fragmentos.every((f) => Object.keys(f).sort().join() === 'ref,texto,titulo'),
      'viajó algo más que referencia, título y texto'
    );

    const enlaces = await page.$$eval('.preg-r p a', (as) => as.map((a) => a.getAttribute('href')));
    afirmar(
      enlaces.length === 2 &&
        enlaces[0].endsWith('/art/250#tabla-250-122') &&
        enlaces[1].endsWith('/art/250#250-122(a)'),
      `enlaces: ${JSON.stringify(enlaces)}`
    );
    const texto = await page.textContent('.preg-r');
    afirmar(texto.includes('[999-99]'), 'perdió la cita inventada');
    afirmar(!texto.includes('**'), 'dejó el Markdown');
    afirmar(!(await page.$('.preg-r img')), 'pintó HTML de la respuesta');
    afirmar(!alerta(), 'se ejecutó código de la respuesta');
    afirmar((await page.$$('.preg-fuentes li')).length === 2, 'no enseña lo que leyó');
    afirmar(!errores.length, errores.join(' | '));
  }
);

prueba('La segunda pregunta lleva la conversación anterior', async ({ nuevaPagina }) => {
  const { recibido, contestar } = asistenteDePrueba({
    articulos: '240',
    secciones: '240-4(d)',
    responder: 'Según [240-4(d)(3)], 15 amperes.',
  });
  const { page } = await conAsistente(nuevaPagina, contestar);
  for (const [n, p] of ['¿Protección del 14 AWG de cobre?', '¿Y del 12 AWG?'].entries()) {
    await page.fill('#preg-campo', p);
    await page.press('#preg-campo', 'Enter');
    await page.waitForFunction(
      (k) => document.querySelectorAll('.preg-r .preg-ia').length === k,
      n + 1,
      {
        timeout: 20000,
      }
    );
    // La siguiente pregunta, cuando la página ya terminó con esta.
    await page.waitForFunction(() => !document.querySelector('#preg-enviar').disabled);
  }
  const segunda = recibido.filter((c) => c.pregunta === '¿Y del 12 AWG?');
  afirmar(segunda.length === 3, `${segunda.length} consultas en la segunda`);
  for (const c of segunda) {
    afirmar(
      c.historia?.length === 1 &&
        c.historia[0].p === '¿Protección del 14 AWG de cobre?' &&
        c.historia[0].r.includes('15 amperes'),
      `${c.paso}: historia ${JSON.stringify(c.historia)}`
    );
  }
  const enlace = await page.getAttribute('.preg-r p a', 'href');
  afirmar(enlace.endsWith('/art/240#240-4(d)(3)'), `la cita no lleva al inciso: ${enlace}`);
});

prueba(
  'Si el modelo no pide nada que exista, busca la página y el asistente contesta con eso',
  async ({ nuevaPagina }) => {
    const { recibido, contestar } = asistenteDePrueba({
      articulos: 'No sé, quizá el 999',
      responder: 'Según la [Tabla 250-122], 3.31 mm².',
    });
    const { page } = await conAsistente(nuevaPagina, contestar);
    await page.fill('#preg-campo', PREGUNTA_20A);
    await page.press('#preg-campo', 'Enter');
    await page.waitForSelector('.preg-r .preg-ia', { timeout: 20000 });
    afirmar(
      JSON.stringify(recibido.map((c) => c.paso)) === '["articulos","responder"]',
      `pasos: ${recibido.map((c) => c.paso).join(', ')}`
    );
    const refs = recibido[1].fragmentos.map((f) => f.ref);
    afirmar(
      refs.includes('250-122') && refs.includes('Tabla 250-122'),
      `el respaldo no encontró: ${refs.join(', ')}`
    );
  }
);

prueba(
  'Si se acabó la cuota del día lo explica y deja lo que encontró',
  async ({ nuevaPagina }) => {
    const { contestar } = asistenteDePrueba({
      articulos: '250',
      secciones: '250-122',
      responder: () => ({ estado: 429, json: { error: 'cuota' } }),
    });
    const { page } = await conAsistente(nuevaPagina, contestar);
    await page.fill('#preg-campo', PREGUNTA_20A);
    await page.click('#preg-enviar');
    await page.waitForSelector('.preg-error', { timeout: 20000 });
    afirmar(
      (await page.textContent('.preg-error')).includes('6 de la tarde'),
      'no dice cuándo vuelve'
    );
    afirmar(
      (await page.textContent('.preg-fuentes summary')).includes('sin respuesta del asistente'),
      'no aclara que no hubo respuesta'
    );
    afirmar((await page.$$('.preg-fuentes li')).length > 0, 'no dejó lo que encontró');
    afirmar(await page.isEnabled('#preg-enviar'), 'el botón se quedó desactivado');
  }
);

prueba('Un ejemplo se pone en el campo y no se manda solo', async ({ nuevaPagina }) => {
  const { recibido, contestar } = asistenteDePrueba({});
  const { page } = await conAsistente(nuevaPagina, contestar);
  const ejemplo = await page.textContent('.preg-ejemplo');
  await page.click('.preg-ejemplo');
  afirmar(
    (await page.inputValue('#preg-campo')) === ejemplo.trim(),
    'no puso el ejemplo en el campo'
  );
  await page.waitForTimeout(500);
  afirmar(!recibido.length, 'mandó la pregunta sin que nadie la enviara');
});

prueba('Una conversación nueva olvida la anterior', async ({ nuevaPagina }) => {
  const { recibido, contestar } = asistenteDePrueba({
    articulos: '240',
    secciones: '240-4(d)',
    responder: 'Según [240-4(d)(3)], 15 amperes.',
  });
  const { page } = await conAsistente(nuevaPagina, contestar);
  await page.fill('#preg-campo', '¿Protección del 14 AWG de cobre?');
  await page.press('#preg-campo', 'Enter');
  await page.waitForSelector('#preg-nueva:not([hidden])', { timeout: 20000 });
  await page.click('#preg-nueva');
  afirmar(!(await page.$('.preg-turno')), 'la conversación anterior sigue a la vista');
  await page.fill('#preg-campo', '¿Qué es una acometida?');
  await page.press('#preg-campo', 'Enter');
  await page.waitForFunction(
    () => document.querySelectorAll('.preg-r .preg-ia').length === 1,
    null,
    {
      timeout: 20000,
    }
  );
  const ultima = recibido.filter((c) => c.pregunta === '¿Qué es una acometida?');
  afirmar(
    ultima.length && ultima.every((c) => !c.historia?.length),
    'se mandó la conversación anterior'
  );
});

prueba(
  'Reportar una respuesta lleva al formulario con la pregunta y la respuesta escritas',
  async ({ nuevaPagina }) => {
    const { contestar } = asistenteDePrueba({
      articulos: '240',
      secciones: '240-4(d)',
      responder: 'Para 14 AWG de cobre, 20 amperes [240-4(d)(3)].',
    });
    const { page } = await conAsistente(nuevaPagina, contestar);
    await page.fill('#preg-campo', '¿Protección del 14 AWG de cobre?');
    await page.press('#preg-campo', 'Enter');
    await page.waitForSelector('.preg-reportar', { timeout: 20000 });
    await Promise.all([page.waitForURL('**/observaciones/**'), page.click('.preg-reportar')]);
    await page.waitForLoadState('networkidle');
    afirmar((await page.inputValue('#ref')) === 'Respuesta del asistente', 'sin la referencia');
    afirmar(await page.$('#ref[readonly]'), 'la referencia no quedó fija');
    afirmar(
      (await page.inputValue('select[name="tipo"]')) === 'Respuesta del asistente',
      'sin el tipo'
    );
    const texto = await page.inputValue('textarea[name="observacion"]');
    afirmar(texto.startsWith('Pregunta: ¿Protección del 14 AWG de cobre?'), texto.slice(0, 80));
    afirmar(
      texto.includes('Respuesta del asistente: Para 14 AWG de cobre, 20 amperes'),
      'sin la respuesta'
    );
    afirmar(
      texto.includes('Lo que leyó: 240-4(d)') && texto.trimEnd().endsWith('Qué está mal:'),
      'sin lo que leyó'
    );
  }
);

prueba('Una pregunta sin nada que buscar no llega a redactar', async ({ nuevaPagina }) => {
  const { recibido, contestar } = asistenteDePrueba({ articulos: 'NADA' });
  const { page } = await conAsistente(nuevaPagina, contestar);
  await page.fill('#preg-campo', 'zxqwv kjhgf');
  await page.click('#preg-enviar');
  await page.waitForSelector('.preg-error', { timeout: 20000 });
  afirmar(
    (await page.textContent('.preg-error')).includes('No encontré'),
    'no dice que no encontró nada'
  );
  afirmar(!recibido.some((c) => c.paso === 'responder'), 'pidió redactar sin nada que leer');
});

// ------------------------------------------------------------------ mapa

prueba('El mapa busca un punto de partida y sigue sus hilos', async ({ nuevaPagina }) => {
  const { page, errores } = await nuevaPagina(ESCRITORIO);
  await page.goto('/mapa/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.mapa canvas', { timeout: 20000 });

  // En la red se elige el acomodo; empieza «Por tema» y se recuerda.
  afirmar(
    (await page.getAttribute('[data-acomodo="tema"]', 'aria-pressed')) === 'true',
    'no empezó por tema'
  );
  await page.click('[data-acomodo="capitulo"]');
  afirmar(
    (await page.getAttribute('[data-acomodo="capitulo"]', 'aria-pressed')) === 'true',
    'no cambió a capítulo'
  );
  afirmar(
    (await page.evaluate(() => localStorage.getItem('mapa-acomodo'))) === 'capitulo',
    'no recordó el acomodo'
  );

  // Vista 2D y tema claro: cambian sin recargar y sin errores.
  await page.click('[data-dim="2"]');
  afirmar((await page.getAttribute('[data-dim="2"]', 'aria-pressed')) === 'true', 'no cambió a 2D');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'claro';
  });
  await page.waitForTimeout(300);
  afirmar(
    (await page.$eval('.mapa', (e) => getComputedStyle(e).getPropertyValue('--m-bg').trim())) ===
      '#f7f7f8',
    'el mapa no tomó el tema claro'
  );

  await page.fill('.mapa-busca input', '250-122');
  await page.waitForSelector('#mapa-sug li');
  await page.press('.mapa-busca input', 'Enter');
  await page.waitForFunction(() => location.hash === '#250-122');
  afirmar(await page.$eval('.mapa-recorrido', (e) => !e.hidden), 'el recorrido no apareció');
  afirmar(
    await page.$eval('.mapa-acomodo', (e) => e.hidden),
    'el acomodo sigue a la vista en el hilo'
  );

  // El panel enseña la cita misma: la frase de la norma con la referencia
  // marcada («…de acuerdo con la Tabla 250-122…»).
  await page.waitForSelector('.mp-in .mp-cita mark');
  const marca = await page.textContent('.mp-in .mp-cita mark');
  afirmar(/250-122/.test(marca), `la cita marca «${marca}»`);

  // Todos los capítulos de la leyenda a la vista, sin deslizar de lado: con
  // un mouse de rueda no hay forma de llegar a los que se salen.
  afirmar(
    await page.$eval('.mapa-ley', (e) => e.scrollWidth <= e.clientWidth),
    'la leyenda se sale de lado'
  );

  // Doble clic en un capítulo deja solo ese, en el mapa y en el panel; el
  // conteo dice cuántas citas quedaron ocultas y «Mostrar todos» regresa.
  const antes = Number(await page.textContent('.mp-n-in'));
  await page.dblclick('.chip-cap[data-g="2"]');
  const pulsados = await page.$$eval('.chip-cap', (bs) =>
    bs.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.g)
  );
  afirmar(pulsados.join() === '2', `quedaron visibles: ${pulsados}`);
  const ahora = Number(await page.textContent('.mp-n-in'));
  const ocultas = await page.textContent('.mp-oc-in');
  afirmar(
    ahora < antes && ocultas.includes(String(antes - ahora)),
    `${antes} → ${ahora}, «${ocultas}»`
  );
  await page.click('.chip-todos');
  afirmar(Number(await page.textContent('.mp-n-in')) === antes, 'Mostrar todos no las regresó');

  // Centrar vuelve a encuadrar sin romper nada.
  await page.click('.mapa-centrar');
  await page.waitForTimeout(700);
  afirmar(errores.length === 0, errores.join(' | '));
});

prueba(
  'En el teléfono también se dibuja el mapa, con la leyenda plegada',
  async ({ nuevaPagina }) => {
    const { page, errores } = await nuevaPagina(TELEFONO);
    await page.goto('/mapa/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.mapa canvas', { timeout: 20000 });
    afirmar(
      await page.$eval('nav.tabs a[href$="/mapa/"]', (a) => getComputedStyle(a).display !== 'none'),
      'sin pestaña Mapa en el teléfono'
    );
    // La leyenda va plegada tras «Capítulos» y se abre con un toque.
    const leyVisible = () => page.$eval('.mapa-ley', (e) => getComputedStyle(e).display !== 'none');
    afirmar(!(await leyVisible()), 'la leyenda empieza abierta');
    await page.click('.ley-abrir');
    afirmar(await leyVisible(), 'la leyenda no se abrió');
    afirmar(errores.length === 0, errores.join(' | '));
  }
);

prueba(
  'En una tablet el mapa se dibuja, y el doble toque deja un capítulo solo',
  async ({ nuevaPagina }) => {
    // Lo que distingue a la tablet del teléfono es el lado corto de la
    // pantalla (600 px o más), no la marca ni el ancho de la ventana.
    const { page, errores } = await nuevaPagina({
      viewport: { width: 820, height: 1180 },
      screen: { width: 820, height: 1180 },
      isMobile: true,
      hasTouch: true,
    });
    await page.goto('/mapa/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.mapa canvas', { timeout: 20000 });
    afirmar(
      await page.$eval('nav.tabs a[href$="/mapa/"]', (a) => getComputedStyle(a).display !== 'none'),
      'sin pestaña Mapa en la tablet'
    );
    // Dos toques seguidos en el mismo capítulo: solo ese; otra vez, todos. Se
    // simulan al instante: el navegador de las pruebas dibuja el 3D sin
    // tarjeta de video y tarda más de un segundo entre toques reales.
    const dobleToque = () =>
      page.$eval('.chip-cap[data-g="2"]', (c) => {
        for (let i = 0; i < 2; i++) {
          c.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
          c.click();
        }
      });
    const visibles = () =>
      page.$$eval('.chip-cap[aria-pressed="true"]', (bs) => bs.map((b) => b.dataset.g).join());
    await dobleToque();
    afirmar((await visibles()) === '2', `quedaron: ${await visibles()}`);
    await dobleToque();
    afirmar((await visibles()).split(',').length === 9, `quedaron: ${await visibles()}`);
    afirmar(errores.length === 0, errores.join(' | '));
  }
);

prueba(
  'Glosario: la letra y el texto filtran, y un enlace quita el filtro',
  async ({ nuevaPagina }) => {
    const { page, errores } = await nuevaPagina(TELEFONO);
    await page.goto('/glosario/', { waitUntil: 'networkidle' });
    const visibles = () =>
      page.$$eval('.def', (ds) =>
        ds.filter((d) => !d.hidden).map((d) => d.querySelector('dt').firstChild.data.trim())
      );
    const cuenta = () => page.textContent('.glos-cuenta span');
    afirmar((await visibles()).length === 185, 'no empieza con las 185');

    // Letra: solo términos que empiezan con ella; las letras sin términos, apagadas.
    await page.click('.glos-letras button[data-letra="A"]');
    const conA = await visibles();
    afirmar(conA.length === 23 && conA.every((t) => /^[AÁ]/.test(t)), `con A: ${conA.length}`);
    afirmar(/^23 de 185/.test(await cuenta()), `cuenta: ${await cuenta()}`);
    afirmar(await page.$eval('.glos-letras [data-letra="K"]', (b) => b.disabled), 'K activa');
    afirmar(
      await page.$eval('#parte-B', (s) => s.hidden),
      'la Parte B sin términos con A sigue visible'
    );

    // Texto sin acentos: «proteccion» encuentra «protección», junto con la letra.
    await page.fill('.glos-filtro input', 'proteccion');
    const ambos = await visibles();
    afirmar(ambos.length > 0 && ambos.length < 23, `A + proteccion: ${ambos.length}`);
    await page.click('.glos-letras button[data-letra="A"]');
    const soloTexto = await page.$$eval('.def:not([hidden])', (ds) =>
      ds.map((d) =>
        d.textContent
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      )
    );
    afirmar(
      soloTexto.length > ambos.length && soloTexto.every((t) => t.includes('proteccion')),
      `proteccion: ${soloTexto.length}`
    );

    // Un ancla a una definición escondida quita el filtro.
    await page.fill('.glos-filtro input', 'zzz');
    afirmar((await cuenta()) === 'Ninguna definición coincide.', `vacío: ${await cuenta()}`);
    await page.evaluate(() => {
      location.hash = 'ampacidad';
    });
    await page.waitForFunction(() => !document.getElementById('ampacidad').hidden);
    afirmar((await page.inputValue('.glos-filtro input')) === '', 'el campo no se limpió');

    // Pasar el dedo de la C a la M deja elegida la M, y el toque con que
    // termina el arrastre no la vuelve a quitar.
    await page.$eval('.glos-letras', (e) => e.scrollIntoView({ block: 'center' }));
    const centro = (l) =>
      page.$eval(`.glos-letras [data-letra="${l}"]`, (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    const [c, m] = [await centro('C'), await centro('M')];
    const cdp = await page.context().newCDPSession(page);
    const toque = (type, p) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
    await toque('touchStart', c);
    for (let i = 1; i <= 10; i++)
      await toque('touchMove', { x: c.x + ((m.x - c.x) * i) / 10, y: c.y });
    await toque('touchEnd');
    await page.waitForTimeout(100);
    const elegida = await page.$eval('.glos-letras [aria-pressed="true"]', (b) => b.dataset.letra);
    afirmar(elegida === 'M', `tras arrastrar quedó ${elegida}`);
    afirmar(errores.length === 0, errores.join(' | '));
  }
);

prueba('Al imprimir, ninguna tabla se sale de la hoja', async ({ nuevaPagina }) => {
  // 710 px es lo que queda de una hoja carta o A4 vertical con los márgenes
  // de impresion.css; 950, de una horizontal (las que van con `page:
  // horizontal`). Una tabla más ancha que eso saldría cortada en el papel.
  const { page } = await nuevaPagina({ viewport: { width: 710, height: 900 } });
  await page.emulateMedia({ media: 'print' });
  const conTablas = [];
  for (const dir of ['art', 'apendices', 'tablas', 'cierre']) {
    for (const f of fs.readdirSync(path.join(DIST, dir), { recursive: true })) {
      if (!f.endsWith('index.html')) continue;
      const html = fs.readFileSync(path.join(DIST, dir, f), 'utf8');
      if (html.includes('class="tabla-scroll"'))
        conTablas.push(`/${dir}/${path.dirname(f)}/`.replace('/./', '/'));
    }
  }
  const fuera = [];
  let n = 0;
  for (const ruta of conTablas) {
    await page.goto(ruta, { waitUntil: 'load' });
    const medidas = await page.$$eval('.tabla-scroll table', (ts) =>
      ts.map((t) => {
        const fig = t.closest('figure');
        return {
          id: fig?.id,
          ancho: t.getBoundingClientRect().width,
          max: getComputedStyle(fig).page === 'horizontal' ? 950 : 710,
        };
      })
    );
    n += medidas.length;
    for (const m of medidas)
      if (m.ancho > m.max + 0.5) fuera.push(`${m.id} (${Math.round(m.ancho)} px)`);
  }
  afirmar(n >= 245, `solo se midieron ${n} tablas`);
  afirmar(fuera.length === 0, `se salen: ${fuera.join(', ')}`);
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
