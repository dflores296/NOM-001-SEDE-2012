# Notas del parser

Dónde la NOM-001-SEDE-2012 se rompe consigo misma. El documento no es uniforme y
cada inconsistencia rompía el parser en silencio. Quedan anotadas porque
cualquiera que vuelva a procesar este PDF se las va a encontrar.

- **Acentos en los encabezados.** `ARTICULO` sin acento 151 veces y `ARTÍCULO`
  con acento 2 veces, en los artículos **250** y **555**. Buscar solo la forma
  acentuada devuelve 2 artículos de 151; buscar solo la otra pierde el 250, que
  es Puesta a Tierra. La detección normaliza acentos pero conserva mayúsculas:
  eso es lo que separa el encabezado `ARTICULO 250` de las 1 406 menciones en
  prosa `el Artículo 250`.
- **Separador de sección en tres formas.** `210-8. Título` lo normal,
  `384-1 Título` sin punto (arts. 384, 506 y 522) y `701-1.Título` sin espacio
  (art. 701). Con el patrón estricto, esos artículos salían vacíos.
- **Títulos de parte que empiezan con dígito.** `B. 600 volts o menos` en el
  artículo 110; exigir letra inicial hacía desaparecer la parte completa.
- **Referencias cruzadas al inicio de línea.** En `220-14(j)` la frase «…de
  alumbrado general del **220-12**. No se deben exigir…» parte justo antes de la
  cita, que entonces se lee como encabezado. Se descarta exigiendo que las
  secciones de un artículo sean estrictamente crecientes, cosa que se cumple en
  todo el documento.
- **La profundidad no se deduce del marcador.** En `110-14(c)` el anidamiento es
  `c) → a. → (1)(2)`, mientras que en otros artículos es `c) → (1) → a.`. Con
  niveles fijos por tipo de marcador, los `(1)` de 110-14 se colgaban del padre
  equivocado y chocaban entre sí: 273 identificadores duplicados. El nivel se
  infiere de la secuencia de rótulos.
