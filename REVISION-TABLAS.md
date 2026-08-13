# Revisión de tablas — NOM-001-SEDE-2012

Registro de la revisión de las tablas contra el PDF del DOF. **No queda ninguna
pendiente**: las tablas se reconstruyen automáticamente desde el PDF y ese proceso no
es exacto, así que se contrastaron todas celda por celda contra el documento original.

La versión navegable, con enlaces a cada tabla, está en
[/revision](https://dflores296.github.io/NOM-001-SEDE-2012/revision/).

> Este archivo se genera con `python3 tools/build_revision.py data/
> REVISION-TABLAS.md`. No editar a mano: los cambios se pierden en la próxima
> regeneración.

**220 de 220 tablas ya se contrastaron celda por celda contra el PDF**; quedan registradas en `data/tablas_revisadas.json`, que se aplica encima de la reconstrucción automática.

## Cómo se corrige una tabla

La reconstrucción automática llegó hasta donde llega y el PDF no va a cambiar, así
que a partir de aquí las tablas se corrigen **a mano** sobre el PDF, no tocando el
algoritmo. El procedimiento:

1. Renderizar la zona de la tabla desde el PDF (los campos `regions` de
   `data/tablas.json` dan página y coordenadas) y compararla con lo publicado.
2. Escribir la versión corregida en `data/tablas_revisadas.json`, con la fecha en
   `verificada`. Se aplica ENCIMA de lo reconstruido, así que sobrevive a que
   `build_tables.py` regenere todo en cada publicación —editar `data/tablas.json`
   directamente NO sirve: se sobrescribe—.
3. Correr el proceso completo en el orden del README y `check_corpus.py`, que valida
   las filas corregidas igual que las automáticas: si las columnas no cuadran,
   detiene el despliegue.

Dos cosas que conviene saber antes de empezar:

- **La calidad estimada da falsas alarmas.** Penaliza las celdas con varios números,
  y un rango («De 50 001 a 100 000», «127 – 507», «0 – 3.14») es un valor legítimo.
  Varias tablas señaladas resultaron estar perfectas; se marcan verificadas sin
  tocarles un dato.
- **Y también se queda corta.** Hay tablas peores de lo que dice su nota. Las que el
  PDF no separa con líneas horizontales colapsan todas sus filas en una sola. Y sobre
  todo: cuando el reparto se inventa una columna, los valores quedan perfectos y la
  calidad da 1.00, pero el encabezado se corre y cada título de grupo cubre una
  columna de menos. Es el fallo que tenía la 310-15(b)(16), donde COBRE cubría dos de
  las tres columnas de cobre, y la firma que delata la columna fantasma es una celda
  vacía en el encabezado junto a un título de grupo.

## Qué mirar en cada tabla

- **Número de columnas.** Si el PDF tiene 8 y aquí ves 5, se fusionaron.
- **Celdas combinadas del encabezado.** Que cada título cubra las columnas que cubre
  en el PDF, ni más ni menos.
- **Celdas con varios valores.** Un `55 65 75` junto en una celda significa que la
  separación falló en esa fila.
- **Encabezados de dos y tres niveles.** Las de COBRE / ALUMINIO arriba y 60/75/90 °C
  abajo son las más frágiles: revisa que cada número quede bajo su material y su
  temperatura.
- **Primera y última fila.** Es donde se cuela el título de la tabla siguiente o una
  nota al pie convertida en fila.
- **Tablas que cruzan páginas.** Que no falten filas en la costura ni se repita el
  encabezado a media tabla.
- **Dónde acaba el encabezado.** El fallo más repetido de toda la revisión: las
  primeras filas de datos contadas como parte del título, con su mismo estilo.
- **Notas al pie.** Que estén y que terminen donde termina la tabla. Se recogen de
  debajo de la rejilla, y ahí el recorte se pasaba de largo con frecuencia: la nota
  arrastraba el artículo siguiente completo, o hasta el pie de página del PDF.

Cada tabla del sitio trae un enlace «¿Ves un error? Repórtalo» que abre un issue con
el número y la página ya rellenados.

## Lo que la revisión dejó anotado

Dos tablas traen valores truncados **en el PDF de origen**, no en la reconstrucción.
Se comprobó con las coordenadas del texto y con el render de la página, y se dejaron
tal como los imprime el DOF: corregirlos sería editar la norma, no transcribirla.

- **505-9(d)(1)** — la columna de temperatura superficial máxima dice `≤4`, `≤3`,
  `≤2`, `≤1`, `≤1`, `≤85`. Por las clases T1–T6 deberían ser 450, 300, 200, 135,
  100 y 85 °C.
- **922-12(a)(2)** — en la columna de flecha 2.5 m, las filas de 6 600 y 23 000 volts
  dicen `96` y `105` donde el patrón pide `960` y `1 050` milímetros.

El PDF tampoco es un documento nativo: es una impresión de Chrome de
`dof.gob.mx/normasOficiales/4951/SENER/SENER.html` hecha el 19/11/2019. De ese HTML
las tablas saldrían como `<table><tr><td>` sin inferir nada, y sería la forma de
verificar de raíz lo que aquí se contrastó a ojo.
