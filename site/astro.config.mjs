import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { ASISTENTE } from './src/lib/asistente.js';

// Las librerías del mapa 3D crean un <style> con su CSS al cargarse. La CSP
// (abajo) no admite estilos en línea sin hash, así que se calcula aquí el de
// cada uno, leyéndolo de la propia librería: si una versión nueva lo cambia,
// el hash cambia con ella. Si deja de encontrarse, la compilación se detiene
// en vez de publicar un mapa sin estilos.
const CON_ESTILO_PROPIO = [
  '3d-force-graph/dist/3d-force-graph.mjs',
  'float-tooltip/dist/float-tooltip.mjs',
  'three-render-objects/dist/three-render-objects.mjs',
];
function hashesDeEstilos() {
  return CON_ESTILO_PROPIO.map((f) => {
    const js = readFileSync(new URL(`./node_modules/${f}`, import.meta.url), 'utf8');
    const m = js.match(/var css_248z = ("(?:[^"\\]|\\.)*");/);
    if (!m) throw new Error(`CSP: no encontré el CSS que inyecta ${f}`);
    const css = JSON.parse(m[1]);
    return `sha256-${createHash('sha256').update(css).digest('base64')}`;
  });
}

// El sitio se publica en GitHub Pages bajo el nombre del repositorio, así que
// todas las rutas cuelgan de /NOM-001-SEDE-2012. Para servirlo desde otro
// lugar (un dominio propio, un servidor local, una carpeta en USB) basta con
// cambiar `site` y `base`.
export default defineConfig({
  site: 'https://dflores296.github.io',
  base: '/NOM-001-SEDE-2012',
  trailingSlash: 'ignore',
  build: { format: 'directory' },

  // La librería del mapa 3D (/mapa) pesa ~1.4 MB sin comprimir. Va en su
  // propio archivo y solo la descarga /mapa en una computadora, así que el
  // aviso de Vite por tamaño de archivo no aplica.
  vite: { build: { chunkSizeWarningLimit: 1600 } },

  // Content-Security-Policy en cada página. GitHub Pages no deja poner
  // encabezados, así que va como <meta http-equiv>; Astro la escribe y le
  // agrega el hash de cada script en línea (el del tema, el de la 404), de
  // modo que solo corre el JavaScript que se compiló aquí: un script
  // inyectado en un texto, una URL o un formulario no se ejecuta.
  //
  // A dónde puede hablar el sitio, y nada más:
  // - api.github.com: el número de estrellas de la cabecera.
  // - formspree.io: el formulario de /observaciones. form-action también
  //   lo cierra ahí, para que un formulario inyectado no pueda mandar los
  //   datos a otro lado.
  // - el Worker del asistente (/preguntar), solo si está conectado: su
  //   dirección vive en src/lib/asistente.js.
  //
  // Los <style> solo valen con hash: los de Astro y los que crean las
  // librerías del mapa (ver hashesDeEstilos arriba). Los atributos style sí
  // se admiten ('unsafe-inline' en style-src-attr), porque dos plantillas
  // pasan colores y la imagen de fondo de la portada por ahí; un atributo
  // style no ejecuta código.
  // frame-ancestors no funciona desde una <meta>, por eso no va.
  //
  // Ojo con los scripts en línea: Astro solo calcula el hash de los que él
  // compila. Uno con is:inline o define:vars queda BLOQUEADO; por eso la 404
  // pasa sus datos por un atributo data-. La excepción es el del tema en
  // Base.astro, que corre porque está antes de la <meta> de la CSP: la
  // política solo rige lo que viene después.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self'",
        `connect-src 'self' https://api.github.com https://formspree.io${ASISTENTE ? ` ${new URL(ASISTENTE).origin}` : ''}`,
        "form-action 'self' https://formspree.io",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
      ],
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
        hashes: hashesDeEstilos(),
      },
    },
  },

  // El Artículo 100 son las 185 definiciones y se consultan en el glosario.
  // Su página de artículo no existe, pero la ruta sí tiene que seguir
  // llevando a alguna parte: la cita el propio PDF y la usan los enlaces
  // publicados antes de mover el contenido.
  // Astro le pone el `base` a la clave, pero no al destino: ese hay que
  // escribirlo entero o el desvío sale del sitio publicado.
  // /revision era la lista de trabajo de la revisión de tablas y se retiró al
  // terminarse. La ruta sigue publicada en REVISION-TABLAS.md y en enlaces
  // viejos, así que lleva a donde hoy se reporta.
  redirects: {
    '/art/100': '/NOM-001-SEDE-2012/glosario/',
    '/revision': '/NOM-001-SEDE-2012/observaciones/',
  },
});
