// Copia sin conexión del sitio, para consultarlo en obra sin señal.
//
// Cada tipo de archivo se sirve con su propia estrategia:
//
// - Páginas y datos (.json): primero la red. Así lo publicado se ve en la
//   primera visita y no en la segunda. Antes se servía primero la copia
//   guardada y la nueva se bajaba por detrás, así que después de cada
//   publicación había que recargar para ver el cambio. Si la red no
//   contesta en ESPERA ms y hay copia, se sirve la copia y la red termina
//   de actualizarla por detrás: con señal mala en obra la página no se
//   queda en blanco esperando.
// - /_astro/: primero el caché. Astro les pone un hash en el nombre, así que
//   un archivo de ahí nunca cambia: si cambia el contenido, cambia el nombre.
// - Lo demás (imágenes, iconos): la copia guardada al instante y se
//   revalida por detrás. Casi nunca cambian.
//
// La versión del caché se sube a mano cuando cambia esta lógica: al activarse
// se borran los caches con otro nombre, que es lo que limpia una caché
// envenenada en los navegadores que ya visitaron el sitio. No hace falta
// subirla en cada publicación: las páginas y los datos ya llegan frescos.
const CACHE = 'nom001-v3';
const BASE = '/NOM-001-SEDE-2012';
const ESPERA = 3000;

// Con la barra final. GitHub Pages responde a "/glosario" con un 301 hacia
// "/glosario/", y una respuesta redirigida guardada en caché no se puede
// devolver a una navegación: el navegador la rechaza con ERR_FAILED y la
// página deja de abrir para siempre. Precargar la URL final evita el 301.
const PRECACHE = [`${BASE}/`, `${BASE}/glosario/`];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => guardar(c, u).catch(() => {}))))
      .catch(() => {})
  );
  self.skipWaiting();
});

// Se pide con redirect "follow" y se guarda bajo la URL final, nunca bajo la
// que redirige: así lo que hay en caché siempre es una respuesta directa.
async function guardar(cache, url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res || res.status !== 200) return;
  await cache.put(res.redirected ? res.url : url, res.clone());
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const utilizable = (r) => r && r.status === 200 && !r.redirected && r.type !== 'opaqueredirect';

// La copia guardada, si sirve. Una entrada redirigida (de un caché viejo, o
// de una URL sin barra final) no se puede devolver: se borra y cuenta como
// que no hay copia.
async function copiaDe(cache, request) {
  const hit = await cache.match(request);
  if (hit && !utilizable(hit)) {
    await cache.delete(request);
    return null;
  }
  return hit || null;
}

async function primeroRed(e, request) {
  const cache = await caches.open(CACHE);
  const hit = await copiaDe(cache, request);
  // "no-cache" obliga a preguntarle al servidor si hay versión nueva. Sin
  // eso el navegador reusaría su propia copia HTTP, que GitHub Pages deja
  // vigente 10 minutos. Si no cambió, el servidor contesta un 304 sin
  // cuerpo, así que la pregunta casi no gasta datos. "manual" porque una
  // navegación no acepta una respuesta ya redirigida: el 301 de una URL sin
  // barra final se le devuelve tal cual al navegador y él lo sigue.
  let guardado = Promise.resolve();
  const red = fetch(request.url, { cache: 'no-cache', redirect: 'manual', credentials: 'same-origin' })
    .then((res) => {
      if (utilizable(res)) guardado = cache.put(request, res.clone());
      return res;
    });
  // Lo que la red traiga tarde se guarda igual, aunque ya se haya servido la
  // copia: así la siguiente visita sin señal tiene la versión nueva.
  e.waitUntil(red.then(() => guardado).catch(() => {}));

  if (!hit) return red.catch(() => Response.error());
  const desdeRed = red
    .then((res) => (res.status >= 500 ? hit : res))
    .catch(() => hit);
  const tarde = new Promise((ok) => setTimeout(() => ok(hit), ESPERA));
  return Promise.race([desdeRed, tarde]);
}

async function primeroCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await copiaDe(cache, request);
  if (hit) return hit;
  const res = await fetch(request);
  if (utilizable(res)) await cache.put(request, res.clone());
  return res;
}

async function copiaYRevalida(e, request) {
  const cache = await caches.open(CACHE);
  const hit = await copiaDe(cache, request);
  const red = fetch(request).then(async (res) => {
    if (utilizable(res)) await cache.put(request, res.clone());
    return res;
  });
  e.waitUntil(red.catch(() => {}));
  return hit || red.catch(() => Response.error());
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // El video de fondo de la portada no se guarda: el navegador lo pide por
  // partes (Range) y servir esas partes desde caché lo rompe en Safari. Sin
  // red, la portada muestra su imagen fija.
  if (url.pathname.includes('/video/')) return;

  if (url.pathname.startsWith(`${BASE}/_astro/`)) {
    e.respondWith(primeroCache(request));
  } else if (request.mode === 'navigate' || url.pathname.endsWith('.json')) {
    e.respondWith(primeroRed(e, request));
  } else {
    e.respondWith(copiaYRevalida(e, request));
  }
});
