// Genera public/ui/og.jpg, la imagen de vista previa al compartir un enlace,
// a partir de diseno/og.html. Se corre a mano cuando cambie el diseño:
//
//     cd site && node diseno/og.mjs
import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(new URL('./og.html', import.meta.url).href);
await p.evaluate(() => document.fonts.ready);
// JPEG y no PNG: con la red de fondo, el PNG pesaba 620 KB y algunas apps
// no muestran vistas previas tan pesadas.
await p.locator('.tarjeta').screenshot({
  path: new URL('../public/ui/og.jpg', import.meta.url).pathname,
  type: 'jpeg',
  quality: 82,
});
await b.close();
