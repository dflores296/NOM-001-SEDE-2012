// Cache "stale-while-revalidate": la norma no cambia, así que se sirve desde
// caché al instante y se revalida en segundo plano. Permite consultarla en
// obra sin señal, que es donde más falta hace.
//
// La versión del caché se sube a mano cuando cambia esta lógica: al activarse
// se borran los caches con otro nombre, que es lo que limpia una caché
// envenenada en los navegadores que ya visitaron el sitio.
const CACHE = 'nom001-v2';
const BASE = '/NOM-001-SEDE-2012';

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

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(request).then((hit) => {
      // Una entrada redirigida (de un caché viejo, o de una URL sin barra
      // final) no se puede servir: se ignora y se va a la red.
      if (hit && !utilizable(hit)) {
        caches.open(CACHE).then((c) => c.delete(request));
        hit = null;
      }
      const net = fetch(request)
        .then((res) => {
          if (utilizable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    })
  );
});
