// El service worker guarda el sitio para consultarlo sin señal. Ver
// public/sw.js.
import { base } from './base.js';

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {}));
}
