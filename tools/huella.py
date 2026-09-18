#!/usr/bin/env python3
"""Huella de contenido de una tabla, para que la captura manual no se pueda
romper en silencio.

Las 225 tablas se contrastaron celda por celda contra el PDF a mano. Ese
trabajo vive en `data/tablas_revisadas.json` y se aplica ENCIMA de lo que
reconstruye `build_tables.py`. El riesgo es que un cambio en el reconstructor
—o en la versión de pymupdf, o un merge mal resuelto— mueva una celda de una
tabla ya verificada sin que nadie se entere: `data/tablas.json` se regenera en
cada publicación y la insignia «Verificada contra el PDF» seguiría ahí.

Contra eso, cada entrada revisada guarda la huella de su contenido publicado.
`build_tables.py` la recalcula al final y aborta si no coincide, y
`check_corpus.py` la vuelve a comprobar por su cuenta antes de publicar.

Cambiar una tabla a propósito es cuestión de correr `build_tables.py --sellar`:
la huella nueva aparece en el diff, que es justamente la señal de revisión que
se quiere. Lo que no puede pasar es que cambie sola.

La huella cubre lo que el lector ve —título, prosa de entrada, rejilla, celdas
con sus fusiones, notas— y no la metainformación posicional (página, regiones,
calidad estimada), que puede moverse sin que la tabla cambie.
"""
import hashlib
import json

CAMPOS = ('title', 'intro', 'cols', 'header_rows', 'informativa', 'notes')


def _celda(c):
    # `cs` y `rs` se omiten cuando valen 1, y hay que normalizarlos: una celda
    # guardada como {"t": "x"} y otra como {"t": "x", "cs": 1} son la misma.
    return [c.get('t') or '', int(c.get('cs', 1) or 1), int(c.get('rs', 1) or 1)]


def canonico(t):
    """Representación estable de una tabla, independiente del orden de claves."""
    d = {k: t.get(k) for k in CAMPOS}
    d['rows'] = [[_celda(c) for c in fila] for fila in (t.get('rows') or [])]
    return json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def huella(t):
    """Los primeros 16 hex de sha256 sobre la forma canónica.

    16 hex son 64 bits: de sobra para detectar un cambio accidental, y corto
    para que el diff de `tablas_revisadas.json` se lea.
    """
    return hashlib.sha256(canonico(t).encode('utf-8')).hexdigest()[:16]


def discrepancias(tablas, revisadas):
    """Tablas verificadas cuya huella no coincide con la sellada.

    Devuelve [(id, sellada, calculada)]. Una entrada sin `sha` se reporta con
    None en el segundo hueco: está sin sellar, que también hay que resolver.
    """
    out = []
    porid = {t['id']: t for t in tablas}
    for tid, rev in revisadas.items():
        t = porid.get(tid)
        if t is None:
            out.append((tid, rev.get('sha'), None))
            continue
        real = huella(t)
        if rev.get('sha') != real:
            out.append((tid, rev.get('sha'), real))
    return out


# Congelar = que la entrada traiga las celdas, no que las herede del
# reconstructor. Una tabla marcada `verificada` sin esto lleva la insignia del
# sitio pero publica lo que el algoritmo produzca ese día.
CAMPOS_CONGELADOS = ('cols', 'header_rows', 'rows')


def sin_congelar(revisadas):
    """Entradas verificadas a las que les falta algún campo congelado."""
    out = []
    for tid, rev in revisadas.items():
        if not rev.get('verificada'):
            continue
        falta = [c for c in CAMPOS_CONGELADOS if c not in rev]
        if falta:
            out.append((tid, falta))
    return out


# Campos que, si la entrada los trae, tienen que salir tal cual en lo publicado.
CAMPOS_APLICADOS = ('title', 'cols', 'header_rows', 'intro', 'rows', 'notes',
                    'informativa')


def desalineadas(tablas, revisadas):
    """Entradas cuya captura no coincide con lo que se publicó.

    La huella sola no basta: certifica `data/tablas.json`, que se regenera, así
    que una edición de `tablas_revisadas.json` sin reconstruir no la mueve. Esto
    compara los dos archivos campo por campo y delata esa desincronización —y
    también un `apply_revisiones` que dejara de aplicar algo.

    Devuelve [(id, [campos que no coinciden])].
    """
    out = []
    porid = {t['id']: t for t in tablas}
    for tid, rev in revisadas.items():
        t = porid.get(tid)
        if t is None:
            out.append((tid, ['la tabla no existe en tablas.json']))
            continue
        malos = []
        for campo in CAMPOS_APLICADOS:
            if campo not in rev:
                continue
            if campo == 'rows':
                a = [[_celda(c) for c in f] for f in (rev[campo] or [])]
                b = [[_celda(c) for c in f] for f in (t.get(campo) or [])]
            else:
                a, b = rev[campo], t.get(campo)
            if a != b:
                malos.append(campo)
        if malos:
            out.append((tid, malos))
    return out
