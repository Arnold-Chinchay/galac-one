# 13 · Guía para el equipo de Front

> Todo lo que necesitan para trabajar **hoy**, sin esperar al pipeline real. Diseño **simple**: lo que importa es que funcione y se entienda.
> Leer antes: [00-EMPEZAR-AQUI.md](00-EMPEZAR-AQUI.md) §1 (la idea en 30 s) y [10-innovacion-problema-real.md](10-innovacion-problema-real.md) §2.2 (la multitud calibrada).

## 1. Lo que ya está en línea
| Qué | Dónde |
|---|---|
| **Sitio + API** | https://naylamp-space.spacenaylamp.workers.dev |
| **Código** | https://github.com/spacenaylamp-blip/naylam_space (rama `main`) |
| **Mosaico de prueba** (cielo falso, pipeline real) | `/mock-tile/` en el sitio (240 cuadros de 40×40 px, 1.6 MB) |
| **API con datos de prueba** | `/api/tiles`, `/api/next`, `/api/votes`… (sección 3) |

**El mosaico "mock" es falso a propósito:** 25 estrellas estáticas de distintos colores, 2 objetos que se mueven, 1 estrella variable y 1 artefacto de un solo cuadro. Pasó por la resta espectral real. Sirve para construir toda la interfaz. Los mosaicos reales se agregan luego a `/api/tiles` **sin que cambie nada en su código** (mismo formato).

## 2. Qué construir (simple, en este orden)
| # | Pantalla | Qué hace | Listo cuando… |
|---|---|---|---|
| **P0-1** | **Clasificar** (`/classify`) | Muestra un candidato como animación del recorte y 4 botones: **Moving / Variable / Artifact / Not sure** (teclas 1-4). Guarda los votos en lotes | Un usuario clasifica los 4 candidatos del mock y ve su contador subir |
| **P0-2** | **Visor del mosaico** (`/tile/:id`) | Flipbook de los cuadros: play/pausa, deslizador de cuadro, alternar **Residual** (z-score) / **Imagen**, ver la λ de cada cuadro, marcar los candidatos | Se ve moverse el objeto `mock-m1` y desaparecer las estrellas en la vista Residual |
| **P0-3** | **Inicio / estado** (`/`) | Lista de mosaicos, contadores, acuerdo de NASA (ya está en `index.html`) | Funciona en celular |
| **P1** | URL con parámetros | `/tile/mock?frame=120&mode=residual` (el reto pide consultas por URL embebibles) | Se puede compartir un enlace a un cuadro |
| **P1** | **Estadísticas** (`/stats`) | Totales y tabla de los 10 que más votaron | Lee `/api/stats` |
| **P2** | Curva del candidato | Gráfico del brillo en el tiempo / vs λ del candidato (los datos están en `science.f16.bin`) | — |

**Reglas de diseño:** una sola columna, fuente del sistema, contraste alto, botones grandes (se usa en celular), modo oscuro opcional. Nada de librerías de UI pesadas. **Pensar en celular primero.**

## 3. API (todo con CORS abierto: pueden llamarla desde `localhost`)
Base: `https://naylamp-space.spacenaylamp.workers.dev`

| Método y ruta | Qué devuelve |
|---|---|
| `GET /api/health` | `{ok, tiles, ...}`: comprueba D1 y R2 |
| `GET /api/tiles` | `{tiles:[{id, ra, dec, fov_deg, release, n_frames, label, files_url}]}`. **`files_url`** es la carpeta de los archivos del mosaico (`/mock-tile/` o `/tiles/<id>/`) |
| `GET /api/tiles/:id/candidates` | Candidatos con conteo **público** de votos: `{id, x, y, t_ref, kind_hint, score, track, n_votes, n_moving, n_variable, n_artifact, n_unsure}` |
| `GET /api/next?tile=mock&user=<uuid>&n=5` | Hasta `n` (máx. 20) candidatos que **ese usuario aún no votó**, en orden aleatorio. **Usen este para la pantalla de clasificar** |
| `POST /api/votes` | Guarda votos (ver abajo) |
| `GET /api/me?user=<uuid>` | `{alias, n_votes, reliability}` |
| `GET /api/stats` | `{tiles, candidates, votes, users, leaderboard:[{alias, n_votes, reliability}]}` |

### Enviar votos
```js
await fetch(`${API}/api/votes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  keepalive: true,                       // sobrevive si el usuario cierra la pestaña
  body: JSON.stringify({
    user_id: userId,                     // UUID v4 generado UNA vez y guardado en localStorage
    alias: "Rosa",                       // opcional, máx. 24 caracteres
    votes: [                             // máx. 50 por llamada; recomendado: lotes de 10
      { candidate_id: "mock-m1", label: "moving", ms: 1200 }   // ms = tiempo que tardó en decidir
    ],
  }),
});
// -> { ok: true, accepted: 1, ignored: 0, n_votes: 1, reliability: 0.67 }
```
- `label` solo puede ser `moving`, `variable`, `artifact` o `unsure`.
- Un usuario no puede votar dos veces el mismo candidato (el segundo se ignora).
- **`reliability`** (0 a 1) es la precisión del usuario contra objetos de prueba ocultos. **El servidor nunca dice cuáles candidatos son de prueba.** No intenten adivinarlo ni mostrar "acertaste/fallaste" por voto: arruinaría el método (doc 10 §2.2). Mostrar solo el número agregado.
- **Límites gratuitos de Cloudflare:** 100 000 peticiones/día y 100 000 escrituras/día. **Por eso: votos en lotes, no hacer polling, no llamar a la API en cada movimiento del mouse.** Si falla un envío, guardar en `localStorage` y reintentar después.
- **Identidad:** `const userId = localStorage.getItem("uid") ?? (localStorage.setItem("uid", crypto.randomUUID()), localStorage.getItem("uid"))`.

## 4. Formato de los datos de un mosaico
Carpeta `files_url` (ej. `/mock-tile/`):

| Archivo | Contenido |
|---|---|
| `manifest.json` | Metadatos: `shape:{n_frames, height, width}`, `ra`, `dec`, `fov_deg`, `pix_arcsec`, rango de tiempo y de λ |
| `frames.json` | Un objeto por cuadro, **ordenado por tiempo**: `{i, mjd, det, lam_um, bad_frac, obsid}` |
| `residuals.f16.bin` | **float16** little-endian, forma `(N, H, W)`: el **z-score** del residual. Cerca de 0 = sin cambio. `NaN` = píxel enmascarado |
| `science.f16.bin` | Igual, pero la imagen (MJy/sr, sin fondo zodiacal). Para la vista "Imagen" y las curvas |
| `candidates.json` | Lo mismo que `/api/tiles/:id/candidates` pero sin votos |

- **Índice:** `valor[frame][y][x] = arr[(frame*H + y)*W + x]`.
- **Orientación:** `y=0` es el **sur**. Para mostrar con el norte arriba hay que **voltear verticalmente** al dibujar. `x=0` es el **este** (el RA crece hacia `x=0`).
- **`track`** de un candidato: `[[frame, x, y], ...]` posición por cuadro (para dibujar el círculo que sigue al objeto).
- **Escala visual recomendada:** residual con `z` limitado a ±5 (gris medio = 0, claro = positivo). Imagen: estirar entre percentiles 1 y 99 **iguales para todos los cuadros**, o el parpadeo del brillo engaña.

### Cargar y dibujar (código listo)
```js
// float16 -> float32 (los navegadores aún no tienen Float16Array en todos lados)
function f16(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (m / 1024)
           : e === 31 ? (m ? NaN : s * Infinity)
           : s * 2 ** (e - 15) * (1 + m / 1024);
  }
  return out;
}
async function loadTile(base) {                      // base = files_url, ej. "/mock-tile/"
  const [manifest, frames, cands, buf] = await Promise.all([
    fetch(base + "manifest.json").then(r => r.json()),
    fetch(base + "frames.json").then(r => r.json()),
    fetch(base + "candidates.json").then(r => r.json()),
    fetch(base + "residuals.f16.bin").then(r => r.arrayBuffer()),
  ]);
  return { manifest, frames, cands, z: f16(new Uint16Array(buf)) };
}
function drawFrame(canvas, tile, k, zmax = 5) {       // k = índice de cuadro
  const { height: H, width: W } = tile.manifest.shape;
  canvas.width = W; canvas.height = H;                // luego escalar con CSS (image-rendering: pixelated)
  const ctx = canvas.getContext("2d"), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = tile.z[(k * H + y) * W + x], row = H - 1 - y;      // voltear: norte arriba
    const o = (row * W + x) * 4;
    if (Number.isNaN(v)) { img.data.set([60, 0, 60, 255], o); continue; }   // enmascarado
    const g = Math.max(0, Math.min(255, 128 + (v / zmax) * 127));
    img.data.set([g, g, g, 255], o);
  }
  ctx.putImageData(img, 0, 0);
}
```
Tamaño: 240×40×40 float16 = 0.77 MB por archivo. Los mosaicos reales serán de 40-60 px y ~250 cuadros: **1-2 MB**. Se descarga **una vez** y todo el flipbook corre en el navegador (sin llamadas a la API).

## 5. Cómo trabajar en local
**Opción más simple (recomendada para empezar):** HTML + JS sin compilar, dentro de `web/public/`. Prueban abriendo el archivo con cualquier servidor estático y llamando a la API en línea (tiene CORS abierto).

**Opción React + Vite:**
```bash
cd web
npm create vite@latest app -- --template react
cd app && npm install
# en el código: const API = import.meta.env.VITE_API ?? "https://naylamp-space.spacenaylamp.workers.dev"
npm run dev
```
Para publicar, cambiar en `wrangler.toml` `directory = "./web/public"` por `"./web/app/dist"`, y **mover `web/public/mock-tile/` a `web/app/public/mock-tile/`** (Vite lo copia al compilar). Luego `npm run build` y `npx wrangler deploy` (requiere `npx wrangler login` con una cuenta que tenga acceso al proyecto: pídanselo al responsable de la infraestructura).

## 6. Reglas
- **Cero claves en el código.** El front no necesita ninguna: la API es pública.
- Commits chicos en ramas cortas; `main` siempre debe funcionar.
- Mantener el **agradecimiento a NASA/SPHEREx** visible (está en `web/public/index.html`).
- Todo el texto de la interfaz en **inglés** (la entrega lo exige); opcionalmente un selector ES/EN después.
- Si algo de la API no alcanza, **pídanlo**: el Worker es [api/src/index.js](../api/src/index.js) y se amplía en minutos.

## 7. Lo que NO está listo todavía (no esperen por esto)
- **Mosaicos reales** (WISE 0855, Barnard, etc.): se agregan al mismo `/api/tiles` cuando el pipeline los termine.
- **Detección automática de candidatos** reales: hoy los candidatos son del mosaico de prueba.
- **Consulta en vivo por coordenadas arbitrarias:** la primera versión muestra solo mosaicos precalculados.
- **Gaia/FLAGS como capas:** el contrato de datos las incorporará después; dejen espacio en el visor.
