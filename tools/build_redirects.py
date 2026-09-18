#!/usr/bin/env python3
"""Mapa de identificadores retirados -> dónde vive hoy ese contenido.

Al destapar estructura mal anidada, incisos que colgaban un nivel más abajo de
lo que les tocaba cambiaron de identificador: `800-113(d)(3)c.a.` pasó a ser
`800-113(d)(3)c.(3)a.`, y los peores del Artículo 800 tenían nombres como
`800-113(f)(3)e.e.(3)c.(3)e.(7)(7)(4)a.`, que nunca describieron la estructura
real de la norma. Un enlace profundo anterior a ese arreglo apunta a un ancla
que ya no existe, y el navegador se queda arriba de la página sin decir nada.

Esto no es parte del build: se corre a mano cuando una ronda de cambios mueve
identificadores, pasándole el corpus ANTERIOR. La salida se commitea.

    git show <commit>:data/corpus.json > /tmp/antes.json
    python3 tools/build_redirects.py /tmp/antes.json data/corpus.json \
            site/public/ids-retirados.json

La salida va a `site/public/`, junto a las figuras, y NO a `site/public/data/`:
ese directorio está en .gitignore porque lo regenera `build_search.py` en cada
publicación, así que un archivo puesto ahí desaparecería en CI. Este mapa es un
registro histórico —qué identificadores existieron antes—, no algo derivado del
corpus de hoy, y por eso se versiona ya construido.

Cada identificador retirado se resuelve en dos pasos:

1. Por contenido: si su título y su texto aparecen idénticos en un único nodo
   del corpus nuevo, ese nodo es su destino. Es el caso limpio —el inciso se
   movió de sitio pero dice lo mismo— y cubre la mayoría.
2. Por ancestro: si no, el prefijo más largo que sí existe. Los identificadores
   monstruosos del 800 caen aquí, y llevar al lector al inciso que los contiene
   es lo correcto: el nodo exacto al que apuntaban no existía en la norma.
"""
import json
import re
import sys
import unicodedata


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', s).strip().lower()


def indexar(path):
    d = json.load(open(path, encoding='utf-8'))
    out = {}

    def walk(n):
        out[n['id']] = {'title': n.get('title') or '', 'text': n.get('text') or ''}
        for c in n.get('children', []) or []:
            walk(c)

    for a in d['articles']:
        for s in a['sections']:
            walk(s)
    return out


# Un identificador se corta por sus marcadores: "800-113(d)(3)c.a." da
# "800-113(d)(3)c.", "800-113(d)(3)", "800-113(d)" y "800-113".
RE_TROZO = re.compile(r'\([0-9a-zA-Z]+\)|[a-z]\.')


def ancestros(nid):
    m = list(RE_TROZO.finditer(nid))
    for corte in reversed(m):
        yield nid[:corte.start()]


def construir(antes, ahora):
    porfirma = {}
    for k, v in ahora.items():
        f = norm(v['title'] + ' ' + v['text'])
        if len(f) > 25:
            porfirma.setdefault(f, []).append(k)

    mapa, motivo = {}, {'contenido': 0, 'ancestro': 0, 'sin destino': 0}
    for nid in sorted(set(antes) - set(ahora)):
        v = antes[nid]
        f = norm(v['title'] + ' ' + v['text'])
        destino = None
        if len(f) > 25 and len(porfirma.get(f, [])) == 1:
            destino = porfirma[f][0]
            motivo['contenido'] += 1
        else:
            for anc in ancestros(nid):
                if anc in ahora:
                    destino = anc
                    motivo['ancestro'] += 1
                    break
        if destino is None:
            motivo['sin destino'] += 1
            continue
        mapa[nid] = destino
    return mapa, motivo


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    antes = indexar(sys.argv[1])
    ahora = indexar(sys.argv[2])
    mapa, motivo = construir(antes, ahora)

    with open(sys.argv[3], 'w', encoding='utf-8') as fh:
        json.dump(mapa, fh, ensure_ascii=False, indent=0, sort_keys=True)
        fh.write('\n')

    print('identificadores retirados : %d' % len(set(antes) - set(ahora)))
    for k in ('contenido', 'ancestro', 'sin destino'):
        print('  por %-12s: %d' % (k, motivo[k]))
    print('escrito                   : %s (%d entradas)' % (sys.argv[3], len(mapa)))


if __name__ == '__main__':
    main()
