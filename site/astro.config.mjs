import { defineConfig } from 'astro/config';

// El sitio se publica en GitHub Pages bajo el nombre del repositorio, así que
// todas las rutas cuelgan de /NOM-001-SEDE-2012. Para servirlo desde otro
// lugar (un dominio propio, un servidor local, una carpeta en USB) basta con
// cambiar `site` y `base`.
export default defineConfig({
  site: 'https://dflores296.github.io',
  base: '/NOM-001-SEDE-2012',
  trailingSlash: 'ignore',
  build: { format: 'directory' },

  // El Artículo 100 son las 185 definiciones y se consultan en el glosario.
  // Su página de artículo no existe, pero la ruta sí tiene que seguir
  // llevando a alguna parte: la cita el propio PDF y la usan los enlaces
  // publicados antes de mover el contenido.
  // Astro le pone el `base` a la clave, pero no al destino: ese hay que
  // escribirlo entero o el desvío sale del sitio publicado.
  redirects: { '/art/100': '/NOM-001-SEDE-2012/glosario/' },
});
