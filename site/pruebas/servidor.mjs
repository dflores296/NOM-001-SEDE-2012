// Servidor estático para las pruebas: sirve site/dist/ bajo /NOM-001-SEDE-2012
// como lo hace GitHub Pages, incluido el 301 de una carpeta sin barra final.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = '/NOM-001-SEDE-2012';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.txt': 'text/plain',
};

/** Arranca el servidor en un puerto libre; devuelve su URL base y cómo cerrarlo. */
export function servir(dist) {
  const srv = http.createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!ruta.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
    let f = path.join(dist, ruta.slice(BASE.length));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!ruta.endsWith('/')) { res.writeHead(301, { Location: ruta + '/' }); res.end(); return; }
      f = path.join(f, 'index.html');
    }
    if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404</h1>'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${srv.address().port}${BASE}`,
    cerrar: () => new Promise((fin) => srv.close(fin)),
  })));
}
