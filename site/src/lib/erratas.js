// Las erratas del DOF en las tablas (README, «Erratas del PDF de origen»; el
// sustento, en REVISION-TABLAS.md). La norma no se corrige: las tablas dicen
// lo que imprime el DOF. El asistente las lee con esta nota al
// pie (tabla-texto.js), para que dé el valor impreso y avise.
//
// `impreso` son pedazos de la tabla como la lee el asistente, tal cual: si
// un día la captura cambia y dejan de estar, la prueba lo dice
// (site/pruebas/preguntar.mjs) y la nota se revisa.
export const ERRATAS = {
  '430-250': {
    impreso: ['7.5 | 10 | - | 32.3 | 30.8 | 28 | 14 | 44 |'],
    nota: 'en el renglón de 10 hp (7.5 kW), la columna de 575 volts dice 44 amperes; debería decir 11 amperes. Con el 44 salen un conductor y una protección cuatro veces más grandes de lo que toca.',
  },
  '505-9(d)(1)': {
    impreso: ['T1 | ≤4\nT2 | ≤3\nT3 | ≤2\nT4 | ≤1\nT5 | ≤1\nT6 | ≤85'],
    nota: 'la temperatura de las clases T1 a T6 dice ≤4, ≤3, ≤2, ≤1, ≤1 y ≤85; debería decir 450, 300, 200, 135, 100 y 85 °C.',
  },
  '922-12(a)(2)': {
    impreso: ['6 600 | 450 | 660 | 810 | 96 | 1 050', '23 000 | 580 | 780 | 930 | 105 | 1 160'],
    nota: 'en la flecha de 2.5 m de la primera ecuación, los renglones de 6 600 y 23 000 volts dicen 96 y 105; deberían decir 960 y 1 050 milímetros.',
  },
  '220-42': {
    impreso: ['A partir de 1 00000'],
    nota: 'en «Hoteles y moteles», el último tramo dice «A partir de 1 00000»; debería decir «A partir de 100 000» voltamperes.',
  },
};

/** El renglón que va al pie de una tabla con errata, o null. */
export const notaErrata = (id) =>
  ERRATAS[id]
    ? `Nota de la guía (no es texto de la norma): errata del DOF en esta tabla: ${ERRATAS[id].nota}`
    : null;
