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
});
