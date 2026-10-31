# Midterms EE.UU. 2026

Seguimiento del **martes 3 de noviembre de 2026**: probabilidad en Polymarket y escrutinio en vivo del Senado, la Cámara de Representantes y las gobernaciones.

Sitio: <https://alejandrowalter.github.io/USA-midterms/>

La página es HTML y JavaScript estáticos, el mismo tipo de sitio que [Brasil 2026](https://alejandrowalter.github.io/Brasil-elecciones/). Se ve en el iPhone y en el Mac. La hora que muestra es **America/Bogotá**.

Polymarket es un mercado de apuestas, no una encuesta ni un resultado. Un llamado del escrutinio no es la certificación oficial del estado.

## Qué se ve

Arriba, un botón **Senado | Cámara | Gobernadores | Batallas** (uno a la vez). **Batallas clave** ordena las carreras más cerradas y las que cambiarían de partido: cercanía del precio de Polymarket por el efecto en la mayoría. El texto de cada una usa el titular de `holders.js`, los candidatos del mercado y, si ya hay votos, el feed del NYT. No es una selección editorial. En cada vista: el control de esa cámara en números grandes, un mapa de estados y, al tocarlo, la carrera con la probabilidad y el escrutinio.

- **Senado y gobernadores.** Color firme, inclinado o reñido según quién va adelante (Polymarket ahora; votos o llamado cuando existan). El borde punteado es un cambio de partido frente a quien ocupa el cargo. Si el estado no vota ese cargo en 2026, el mapa usa un tramado del partido que lo tiene hoy (delegación dividida en el Senado: azul y rojo). Leyenda: «Dem. sin elección», «Rep. sin elección».
- **Cámara.** Cada estado va del color de la mayoría de su delegación (proyección de los distritos; si aún no hay votos, la mayoría actual). El borde negro marca distritos reñidos. No hay estados grises: los 50 eligen Cámara.

Quién ocupa el cargo hoy está en `holders.js`, no se inventa: senadores al 26 oct 2026 ([congresscountdown.com](https://www.congresscountdown.com/info/us-senators)); gobernadores y escaños de la Cámara según [The Green Papers](https://www.thegreenpapers.com/G26/composition.phtml) (24 D / 26 R; Cámara 214 D, 1 independiente, 218 R, 2 vacantes). En un distrito sin titular en la boleta no se marca cambio de partido.

En cada carrera, el precio de Polymarket va al lado del escrutinio: porción del voto esperado, votos y, cuando el feed trae un ganador, la marca **Llamado**. Si el feed está en línea pero el conteo sigue en cero, la página dice **Sin votos todavía**. No hay números de relleno.

## Fuentes

| Dato | De dónde sale |
| --- | --- |
| Probabilidades | [Gamma](https://gamma-api.polymarket.com) (qué mercados hay, volumen) y [CLOB](https://clob.polymarket.com) (`POST /midpoints`, el punto medio del libro). |
| Escrutinio y clasificación | JSON público del New York Times, sin clave, armado con The Associated Press. Responde con `Access-Control-Allow-Origin: *`. |
| Senado | `https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-senate.json` |
| Cámara | `https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-house.json` |
| Gobernaciones | `https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-governor.json` |

Esas tres direcciones están en `sources.json` (el script de actualización) y repetidas en `app.js` (la lectura directa del navegador). Hay que cambiar las dos si el NYT mueve los archivos.

El feed ya existe antes de la elección. Hasta que hay votos, `total_votes` es 0, `eevp` es 0 y `race_call_status` es `too_early`. La página lo trata como “sin votos”, no como un resultado 0–0.

`partyControlData` del mismo JSON es el conteo de escaños: `seats` (no se renuevan + llamados), `no_election` y `num_races_called`. En la Cámara, `current_control` es la cámara saliente y solo se muestra si suma como máximo el total de escaños. En el Senado ese campo no suma 100, así que no se publica como cifra.

La clasificación (empate, inclina, probable, sólido) es `general_rating` de ese feed, no una tabla copiada a mano.

## Cómo se actualiza

La página no depende de que el navegador llegue a Polymarket. En Colombia hay redes que bloquean ese dominio; el libro de órdenes responde bien desde el servidor de GitHub, así que la copia del sitio es la fuente.

- **Precios.** Al abrir, y otra vez cada minuto, el navegador lee `data/page.json` (mismo dominio). Arriba dice «Precios de Polymarket de las HH:MM (hora Bogotá)», la hora de esa copia. Si el navegador sí llega a `clob.polymarket.com`, pide el punto medio una vez y, si responde, lo sigue actualizando en silencio. Si no responde, no hay aviso.
- **Escrutinio.** Siempre parte de `data/results.json`, con «Escrutinio de las HH:MM (hora Bogotá)». En la noche electoral (3 nov 16:00 a 6 nov 12:00, hora de Bogotá) el navegador también intenta el NYT cada 2 minutos. Si no llega, se queda la copia, sin aviso, y no reintenta el NYT por 10 minutos. Antes de esa noche no baja los ~7 MB de la Cámara al teléfono. `?live=1` fuerza la lectura directa; `?live=0` no la intenta.
- **Aviso** solo si la copia no carga, o si la que está en pantalla tiene más de 30 minutos.
- **GitHub Action** `.github/workflows/refresh.yml`. El cron de GitHub es de mínimo 5 minutos, pero no cumple la hora: en este repo un `*/5` arrancaba cerca de cada 30 minutos, y se atrasa más en el cambio de hora. Por eso el schedule dispara a los minutos 7 y 37, y **el job, una vez en marcha, vuelve a bajar Polymarket (con el punto medio del libro) y el NYT cada 8 minutos**. Cada copia nueva es un commit en `main` y Pages la publica. Ocho minutos, y no cinco, porque Pages tiene un tope blando de 10 builds por hora: cada 5 minutos serían 12 y el sitio puede quedarse atrás. Fuera de la noche electoral el bucle dura ~75 minutos, así un arranque tardío igual se solapa con el siguiente. Del 3 nov 16:00 al 6 nov 12:00 (Bogotá) el mismo bucle sigue **4 horas**, para que el escrutinio no dependa de que GitHub dispare el cron a tiempo.

`scripts/refresh.py` reescribe `data/page.json` solo si el libro devolvió el punto medio de al menos el 80% de los tokens. Si Polymarket no devuelve los mercados de control, o si faltan esos precios, no toca el archivo. Si el NYT falla, actualiza los mercados y **deja la copia anterior del escrutinio**.

## Cambiar la fuente del escrutinio

Hoy está cableado el NYT. No hay una segunda fuente conectada.

1. Edita las URLs en `sources.json` → `nyt` y las mismas en `SOURCES.nyt` dentro de `app.js`.
2. Si el JSON nuevo no tiene la forma del NYT (`races`, `candidate_metadata`, `top_reporting_unit.eevp`, `top_reporting_unit.candidates[].votes.total`, `outcome.won`, `partyControlData`), adapta `scripts/nyt_results.py` y las funciones `slimRace` / `slimControl` de `app.js`. Las dos tienen que devolver el mismo objeto: `status` (`sin_votos`, `contando`, `llamado`, `proyectado`, `segunda_vuelta`), `eevp`, `total_votes`, `winner`, `candidates[]` con `name`, `party` (`D`/`R`/`O`), `votes`.
3. Corre `python3 scripts/test_normalize.py` y `python3 scripts/refresh.py`.
4. Si la copia del escrutinio no carga, la página dice «No se pudo leer el escrutinio guardado en este sitio» y no inventa un conteo.

Decision Desk HQ pide credenciales. Esta página no las usa.

## Cómo verlo en local

```bash
python3 scripts/test_normalize.py
python3 scripts/refresh.py
python3 -m http.server 8765
```

Abre `http://127.0.0.1:8765/`. Hace falta un servidor: `file://` no puede leer los JSON.

## GitHub Pages

El sitio se publica desde la rama `main`, carpeta raíz (`/`), igual que Brasil: `index.html` en la raíz y un archivo `.nojekyll`. No hay build.

En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)`**.

La Action de datos empuja a `main`; Pages vuelve a publicar solo con ese push. El cron solo funciona en la rama por defecto.
