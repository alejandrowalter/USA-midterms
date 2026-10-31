# Midterms EE.UU. 2026

Seguimiento del **martes 3 de noviembre de 2026**: probabilidad en Polymarket y escrutinio en vivo del Senado, la Cámara de Representantes y las gobernaciones.

Sitio: <https://alejandrowalter.github.io/USA-midterms/>

La página es HTML y JavaScript estáticos, el mismo tipo de sitio que [Brasil 2026](https://alejandrowalter.github.io/Brasil-elecciones/). Se ve en el iPhone y en el Mac. La hora que muestra es **America/Bogotá**.

Polymarket es un mercado de apuestas, no una encuesta ni un resultado. Un llamado del escrutinio no es la certificación oficial del estado.

## Qué se ve

Arriba, un botón **Senado | Cámara | Gobernadores** (uno a la vez). En cada vista: el control de esa cámara en números grandes, un mapa de estados y, al tocarlo, la carrera con la probabilidad y el escrutinio.

- **Senado y gobernadores.** El estado se pinta con quien va adelante en Polymarket (color suave si está reñida). Cuando hay votos, con quien va adelante; si el NYT trae un llamado, el color es fuerte. Los estados que no eligen ese cargo en 2026 quedan grises.
- **Cámara.** El mapa es por estado, según sus distritos reñidos (no un mapa de los 435 distritos). Al tocar un estado se ven esos distritos. Gris = ninguno reñido.

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

Dos caminos, como en el sitio de Brasil. El navegador intenta la fuente en vivo y, si no llega (por ejemplo un operador que bloquea el dominio), usa la copia del propio sitio.

- **Al abrir la página**, y otra vez cada pocos minutos: lee el NYT en el navegador y arma el escrutinio ahí mismo. En la noche electoral (3 nov 16:00 a 6 nov 12:00, hora de Bogotá) repite esa lectura **cada 2 minutos**. Antes de eso repite la copia `data/results.json` cada 3 minutos, para no bajar 7 MB de Cámara en el teléfono cuando todavía no hay votos. `?live=1` fuerza la lectura directa; `?live=0` no la intenta.
- **Cada 60 segundos** pide el punto medio del libro de Polymarket para el control, el Senado, las gobernaciones y los distritos competitivos. Si falla, se quedan los precios de `data/page.json`.
- **GitHub Action** `.github/workflows/refresh.yml` corre cada 5 minutos (GitHub a veces la atrasa a 10–15) y al empujar cambios de `scripts/` o `sources.json`. `scripts/refresh.py` reescribe `data/page.json` y `data/results.json` y hace commit solo si cambiaron. Si Polymarket no devuelve los mercados de control, no toca los archivos. Si el NYT falla, actualiza los mercados y **deja la copia anterior del escrutinio**.

La copia es la red de seguridad: el navegador la lee de `data/page.json` y `data/results.json` en el mismo dominio, así que no depende de CORS.

## Cambiar la fuente del escrutinio

Hoy está cableado el NYT. No hay una segunda fuente conectada.

1. Edita las URLs en `sources.json` → `nyt` y las mismas en `SOURCES.nyt` dentro de `app.js`.
2. Si el JSON nuevo no tiene la forma del NYT (`races`, `candidate_metadata`, `top_reporting_unit.eevp`, `top_reporting_unit.candidates[].votes.total`, `outcome.won`, `partyControlData`), adapta `scripts/nyt_results.py` y las funciones `slimRace` / `slimControl` de `app.js`. Las dos tienen que devolver el mismo objeto: `status` (`sin_votos`, `contando`, `llamado`, `proyectado`, `segunda_vuelta`), `eevp`, `total_votes`, `winner`, `candidates[]` con `name`, `party` (`D`/`R`/`O`), `votes`.
3. Corre `python3 scripts/test_normalize.py` y `python3 scripts/refresh.py`.
4. Si ninguna URL responde, la página muestra «Resultados no disponibles todavía» y no inventa un conteo.

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
