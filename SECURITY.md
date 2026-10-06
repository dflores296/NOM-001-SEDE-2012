# Seguridad

## Cómo reportar una vulnerabilidad

**En privado, no en un issue público.** Desde la pestaña
[Security](https://github.com/dflores296/NOM-001-SEDE-2012/security) del
repositorio, con el botón **Report a vulnerability**, o directo en
[este enlace](https://github.com/dflores296/NOM-001-SEDE-2012/security/advisories/new).
Solo lo ve quien mantiene el proyecto.

Sirve que incluyas:

- qué encontraste y dónde (página, archivo o paso del proceso);
- cómo reproducirlo;
- qué podría hacer alguien que lo aprovechara.

Es un proyecto que mantiene una sola persona: la respuesta llega en cuanto
se pueda revisar. Si el reporte se confirma, se corrige y se publica el
aviso correspondiente, con crédito para quien lo reportó si así lo quiere.

## Qué no es un reporte de seguridad

**Un error en el contenido de la norma** —un valor, una palabra o una tabla
que no coincide con el DOF— no va por aquí: va por
[/observaciones](https://dflores296.github.io/NOM-001-SEDE-2012/observaciones/),
que es más rápido y lo deja registrado. Tampoco las erratas que el propio DOF
trae impresas: se reproducen a propósito, ver el README.

## Qué cubre

Solo lo que está en este repositorio y su versión publicada: la rama `main` y
el sitio en `dflores296.github.io/NOM-001-SEDE-2012`. No hay versiones
anteriores con soporte.

| Parte | Qué hay |
|---|---|
| El sitio | Estático, en GitHub Pages: sin servidor, base de datos ni cuentas. Cada página lleva una Content-Security-Policy que solo deja correr el JavaScript del propio sitio. |
| El formulario de `/observaciones` | Envía a Formspree, que reenvía al correo del proyecto. Lo que sale de la página va sin HTML, sin caracteres invisibles y con los enlaces desarmados. |
| La publicación | GitHub Actions, con las acciones fijadas por SHA y dependencias revisadas por Dependabot. |

El detalle de cada medida, y lo que a propósito no cubren, está en
[docs/arquitectura.md](docs/arquitectura.md#seguridad).

**Fuera de alcance:** los servicios de terceros en sí (GitHub, GitHub Pages,
Formspree), la denegación de servicio y lo que requiera tener ya acceso a la
cuenta del mantenedor. Un envío directo a la dirección de Formspree, sin pasar
por la página, es una limitación conocida y documentada, no una vulnerabilidad
nueva.
