# Pendiente para la próxima sesión: notas al pie que sustituyen incisos reales (Artículo 922)

> Este archivo es una nota de trabajo, no un artefacto generado por el pipeline.
> Documenta una investigación ya hecha para no repetirla: **no arreglar nada de
> lo aquí listado todavía** — el usuario pidió medir el alcance del problema y
> guardarlo para la sesión siguiente, no corregirlo en esta.

## El patrón (ya conocido, ya arreglado en 922-33, 922-41, 922-54)

Cuando el `regions` de una tabla no llega hasta donde termina su lista de
notas al pie numeradas `(1) (2) (3)...`, esas notas no se recortan junto con
la tabla: siguen en el flujo de texto del artículo. Como usan el mismo
patrón `(N)` que los incisos anidados, `build_corpus.py` las lee como si
fueran incisos reales del inciso que esté "abierto" en ese punto del texto:

- La **nota (1)** normalmente queda pegada como cola de texto al final del
  inciso padre real (ej. `922-12(b)` termina con una `s` suelta, resto de
  "...las cuales **s**on a tierra").
- Las **notas (2), (3), (4)...** se convierten en hijos numéricos fantasma
  de ese mismo inciso padre, y casi siempre delatan la corrupción porque **la
  numeración no empieza en (1)** — arranca en (2) porque la (1) ya se comió
  como cola de texto del padre.

Esto no es garabato inofensivo: **sustituye contenido real**. Si el inciso
verdadero `922-12(b)(1)` existe en el PDF, su lugar en el árbol lo ocupa la
nota (2) de la tabla, y el texto genuino de esa sección queda perdido o hay
que ir a rescatarlo del PDF aparte.

## Cómo se detectaron (para repetir el barrido si hace falta)

1. Comparar `data/tablas.json` (auto, sin revisar) contra
   `data/tablas_revisadas.json`: tablas cuyo `title` termina en `(N)` — la
   marca de nota al pie sobre el propio título — pero que **no están en
   `tablas_revisadas.json`** y tienen `notes: []`.
2. En `data/corpus.json`, buscar incisos `kind: paren` cuyo **padre también
   sea `kind: paren`** (anidamiento número→número, poco común en el resto del
   documento) — casi siempre es la firma de una nota inyectada.
3. Para cada candidato, extraer del PDF el texto que cae justo debajo del
   recorte actual de la tabla (`regions[-1].y1` hacia abajo) y buscarlo
   textualmente en `corpus.json` para confirmar dónde aterrizó.

## Las 4 tablas encontradas, todavía sin arreglar

### 1. Tabla `922-12(a)(1)` — "Separación horizontal mínima entre conductores"
- Región actual: página 709, termina en `y1: 641.27` — la nota está en esa
  misma página, arrancando en `y≈640.5`, justo en el borde.
- Notas reales en el PDF (página 709, debajo de la tabla):
  - `(1)` "Todas las tensiones son entre fases, excepto para alimentadores de
    transporte eléctrico, las cuales son a tierra. Para determinar la
    separación entre conductores de la misma fase pero de diferentes
    circuitos, el conductor con menor tensión debe ser considerado como
    puesto a tierra."
  - `(2)` "Para conductores que tengan flecha aparente de 1.00 metro y
    tensiones máximas de 8.7 kilovolts, respectivamente, en los que se hayan
    utilizado normalmente separaciones de 250 a 300 milímetros, pueden
    continuarse aplicando dichas separaciones, siempre que se cumpla con lo…"
    (seguir leyendo en el PDF, la cita se corta en el barrido).
- Dónde quedó la corrupción en `data/corpus.json`:
  - `922-12(b)` termina con una `s` suelta pegada (cola de la nota 1).
  - `922-12(b)(2)` es en realidad la nota (2) completa — y por eso **no
    existe `922-12(b)(1)`**, la numeración salta directo a (2).

### 2. Tabla `922-19(e)` — "Separación horizontal mínima entre conductores que limitan el espacio para subir"
- Región actual: páginas 713→714, corta en `y1: 143.32` de la página 714 —
  las notas empiezan ahí mismo, `y≈141.9`, otra vez justo en el borde.
- 5 notas reales en el PDF (página 714, arriba):
  - `(1)` "Todas las tensiones son entre los dos conductores que limitan el
    espacio para subir, excepto para conductores de comunicación, en los que
    la tensión es a tierra. Cuando los conductores son de diferente
    circuito, la tensión entre ellos debe ser la suma aritmética de las
    tensiones de cada conductor de puesta a tierra, para un circuito
    conectado a tierra, o de fase a fase si se trata de un circuito no
    conectado a tierra."
  - `(2)` "Esta posición relativa de líneas no es recomendable y debe
    evitarse."
  - `(3)` "El espacio para subir debe ser el mismo que el requerido para los
    conductores eléctricos colocados inmediatamente arriba, con un máximo de
    75.00 centímetros."
  - `(4)` "Para la utilización de estas separaciones, los trabajadores deben
    tener presentes las normas de operación y seguridad para líneas de que
    se trate."
  - `(5)` "Para tensiones mayores agregar 1.00 centímetro por kilovolt en
    exceso de 73 kilovolts."
- Dónde quedó la corrupción en `data/corpus.json`:
  - `922-19(g)` termina con la cola de la nota 1 pegada ("...los que la
    tensión es a tierra. Cuando los conductores son de diferente circuito,
    la tensión…").
  - `922-19(g)(2)`, `922-19(g)(3)`, `922-19(g)(4)`, `922-19(g)(5)` son las
    notas 2 a 5 completas, haciéndose pasar por incisos reales de 922-19(g)
    (que en el PDF real probablemente no tiene incisos numéricos, o tiene
    otros distintos a estos).

### 3. Tabla `922-43` — "Altura sobre el suelo de partes vivas de equipo instalado en estructuras"
- Región actual: página 718, corta en `y1: 606.88`; las notas reales están
  MÁS ARRIBA en la misma página (`y≈550-591`), dentro de una franja que el
  recorte de otra tabla vecina probablemente se está comiendo — revisar con
  cuidado los límites de las tablas 922-41 y 922-43 en esa página, puede que
  se traslapen o dejen un hueco.
- 2 notas reales en el PDF:
  - `(1)` "Las tensiones son entre fases para circuitos no conectados
    efectivamente a tierra y de fase a tierra para circuitos efectivamente
    conectados a tierra y para otros circuitos donde las fallas a tierra
    sean aisladas con interruptor automático."
  - `(2)` "Esta altura puede reducirse a 3.00 metros para las partes vivas y
    puntas de cables aislados como los descritos en la Sección 922-4(b)(2) y
    922-4(b)(3), de hasta 150 V a tierra, localizadas a la entrada de
    edificios."
- Dónde quedó la corrupción:
  - La **cola de la nota (1)** ("…tierra para circuitos efectivamente
    conectados a tierra y para otros circuitos donde las fallas a tierra
    sean aisladas con interruptor automático.") quedó pegada al final de
    **`922-21(b)`** — un inciso de OTRA sección, ni siquiera vecina directa:
    "Las separaciones, deben ser las indicadas en la Tabla 922-21. tierra
    para circuitos efectivamente…". El principio de la nota 1 no se localizó
    todavía (no se buscó exhaustivamente).
  - La **nota (2) no aparece en ningún lado del corpus actual** — a
    diferencia de los otros casos, esta parece perderse sin más (no
    sustituye ningún inciso visible), pero sigue siendo contenido real de la
    norma que no se está publicando en ningún lado.
  - Este es más enredado que los otros tres: la corrupción no cae en el
    mismo artículo/sección vecina, así que conviene revisar con cuidado los
    límites exactos de `regions` de 922-41, 922-43 y 922-21 en esa zona del
    documento antes de tocar nada.

### 4. Tabla `922-55` — "Separación de conductores suministradores a puentes"
- Región actual: página 720, corta en `y1: 687.06`.
- El más grave de los cuatro: el inciso real `922-55(b)` queda **truncado a
  media frase** ("...haga contacto simultáneamente con el conductor
  alimentador y la estructura del puente. conectados") — se pierde el resto
  de su propio contenido real, no solo se le pega basura.
- Los incisos fantasma `922-55(b)(2)`, `922-55(b)(3)`, `922-55(b)(4)` son
  notas de esta misma tabla (numeración salta de b) directo a (2), sin (1),
  igual que en los otros tres casos):
  - `(2)` "Los cables aislados a que se refiere este renglón son los
    descritos en 922-4(b)(2) y (b)(3), y los conductores neutros son los
    descritos en (d) de la misma Sección."
  - `(3)` "Cuando la línea esté sobre lugares transitados, ya sea encima o
    cerca del puente, se aplican también los requisitos indicados en
    922-40."
  - `(4)` "Los apoyos de puentes de acero, hechos sobre pilares de ladrillo,
    concreto o mampostería, que requieran acceso frecuente para inspección,
    deben considerarse como partes fácilmente accesibles."
- Falta encontrar la nota (1) y el resto perdido de `922-55(b)` — revisar el
  PDF en la página 720 (y alrededores) directamente, con cuidado especial
  porque aquí SÍ hay pérdida de contenido real, no solo basura pegada.

## Qué hacer con cada una (la próxima sesión)

Mismo procedimiento que ya se usó en 922-33 / 922-41 / 922-54 / tablas 8 y 9:

1. Extender `regions` de la tabla en `data/tablas_revisadas.json` para que
   el recorte SÍ incluya las notas (ver README, sección "Cómo se corrige una
   tabla").
2. Escribir las notas completas en el campo `notes` de la tabla.
3. **Para 922-43 y 922-55 en particular**, además hay que reparar el
   `corpus.json` indirectamente: una vez que el recorte de la tabla ya no
   deje escapar el texto de la nota, `build_corpus.py` debería reconstruir
   `922-21(b)` y `922-55(b)` limpios automáticamente (sin la cola pegada) —
   pero conviene verificar contra el PDF que el contenido real de
   `922-55(b)` que se estaba perdiendo (después de "...conectados") se
   recupera completo, y que `922-12(b)` / `922-19(g)` no se quedan con algún
   inciso numérico real fuera de lugar una vez que las notas fantasma
   desaparezcan (ej. confirmar si el PDF real trae o no un `922-12(b)(1)`
   genuino, y si trae, transcribirlo).
4. Correr el pipeline completo y `check_corpus.py` como siempre.

## Estado al cerrar esta sesión

- 99 de 220 tablas verificadas contra el PDF (incluye las 4 grandes del
  Capítulo 10, más 1, 2, 8, 9, 10, 5, 5A — ver `REVISION-TABLAS.md`).
- Las tablas `1` y `2` se marcaron como verificadas por revisión visual del
  usuario contra el PDF, sin tocar su reconstrucción automática.
- Estas 4 tablas de artículo 922 (`922-12(a)(1)`, `922-19(e)`, `922-43`,
  `922-55`) quedan pendientes, con la investigación ya hecha arriba.
- No se ha hecho un barrido exhaustivo de las 220 tablas para este patrón
  específico — solo de las que tienen `(N)` al final del título. Podría
  haber más tablas con nota al pie marcada de otra forma (letras, "Nota:"
  sin número, etc.) que este barrido no cubre.
