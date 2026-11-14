# Guía de front

Sitio y API: https://naylamp-space.spacenaylamp.workers.dev (CORS abierto, se puede llamar desde `localhost`).

## Qué construir
| Prioridad | Pantalla | Listo cuando |
|---|---|---|
| P0 | **Clasificar** `/classify`: un candidato como animación del recorte y 4 botones (Moving, Variable, Artifact, Not sure; teclas 1-4) | Se clasifican todos los candidatos del mosaico y sube el contador |
| P0 | **Visor** `/tile/:id`: flipbook con play, deslizador, alternar Residual/Imagen, λ por cuadro, candidatos marcados | Se ve moverse el objeto y desaparecer las estrellas en Residual |
| P0 | **Inicio** `/`: lista de mosaicos y contadores, agradecimiento NASA (ya está en `index.html`) | Funciona en celular |
| P1 | URL con parámetros (`/tile/rdra?frame=120&mode=residual`) y `/stats` | Enlace compartible |

Diseño simple, celular primero, en inglés.

## Mosaicos
- `mock`: cielo falso con respuestas conocidas (`/mock-tile/`). Aquí `kind_hint` y `score` tienen valores.
- `rdra`: R Draconis real (`/tiles/rdra/`), 289 cuadros de 40×40 px y 27 candidatos. Aquí `kind_hint` y `score` son `null` a propósito.

## API
| Ruta | Devuelve |
|---|---|
| `GET /api/tiles` | `{tiles:[{id, ra, dec, fov_deg, release, n_frames, label, files_url}]}`; `files_url` es la carpeta de los archivos |
| `GET /api/next?tile=rdra&user=<uuid>&n=5` | Candidatos que ese usuario no votó, en orden aleatorio (máx. 20). **Usar este para clasificar** |
| `GET /api/tiles/:id/candidates` | Todos con conteo de votos: `{id, x, y, t_ref, kind_hint, score, track, n_votes, n_moving, n_variable, n_artifact, n_unsure}` |
| `POST /api/votes` | Ver abajo |
| `GET /api/me?user=<uuid>` | `{alias, n_votes, reliability}` |
| `GET /api/stats` | Totales y top 10 |
| `GET /api/health` | Estado de D1 y R2 |

```js
await fetch(`${API}/api/votes`, {
  method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
  body: JSON.stringify({
    user_id: userId,                  // UUID v4 guardado en localStorage
    alias: "Rosa",                    // opcional, máx. 24
    votes: [{ candidate_id: "rdra-0ad1619f", label: "moving", ms: 1200 }],  // máx. 50, mejor lotes de 10
  }),
});
// { ok, accepted, ignored, n_votes, reliability }
```
- `label`: `moving`, `variable`, `artifact` o `unsure`. Un usuario no vota dos veces el mismo candidato.
- `reliability` es la precisión contra objetos de prueba ocultos. **El servidor nunca dice cuáles son de prueba: no mostrar "acertaste/fallaste" por voto**, solo el número agregado.
- Límites gratuitos: 100 000 peticiones/día y 100 000 escrituras/día. Votos en lotes, sin polling; si falla un envío, guardar en `localStorage` y reintentar.

## Formato de un mosaico (`files_url`)
| Archivo | Contenido |
|---|---|
| `manifest.json` | `shape:{n_frames, height, width}`, `ra`, `dec`, `fov_deg`, `pix_arcsec`, rangos de tiempo y λ |
| `frames.json` | Por cuadro, ordenado por tiempo: `{i, mjd, det, lam_um, bad_frac}` |
| `residuals.f16.bin` | float16 little-endian `(N,H,W)`: z-score del residuo. `NaN` = enmascarado |
| `science.f16.bin` | Igual, pero la imagen en MJy/sr sin fondo zodiacal |
| `candidates.json` | Candidatos (sin votos) |

- Índice: `arr[(frame*H + y)*W + x]`. `y=0` es el sur: **voltear verticalmente** para norte arriba. `x=0` es el este.
- `track` = `[[frame, x, y], ...]`. En `rdra` las posiciones son enteras y la pista tiene huecos (solo cuadros con detección).
- Escala: residual con z limitado a ±5; imagen entre percentiles 1 y 99 iguales para todos los cuadros.

```js
function f16(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + m / 1024);
  }
  return out;
}
async function loadTile(base) {
  const [manifest, frames, cands, buf] = await Promise.all([
    fetch(base + "manifest.json").then(r => r.json()), fetch(base + "frames.json").then(r => r.json()),
    fetch(base + "candidates.json").then(r => r.json()), fetch(base + "residuals.f16.bin").then(r => r.arrayBuffer()),
  ]);
  return { manifest, frames, cands, z: f16(new Uint16Array(buf)) };
}
function drawFrame(canvas, tile, k, zmax = 5) {
  const { height: H, width: W } = tile.manifest.shape;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = tile.z[(k * H + y) * W + x], o = ((H - 1 - y) * W + x) * 4;
    if (Number.isNaN(v)) { img.data.set([60, 0, 60, 255], o); continue; }
    const g = Math.max(0, Math.min(255, 128 + (v / zmax) * 127));
    img.data.set([g, g, g, 255], o);
  }
  ctx.putImageData(img, 0, 0);   // escalar con CSS: image-rendering: pixelated
}
```

## Local y despliegue
Se puede trabajar en HTML/JS dentro de `web/public/` o con Vite en `web/app` (`npm create vite@latest app -- --template react`) llamando a la API en línea. Para publicar con Vite: en `wrangler.toml` cambiar `directory` a `./web/app/dist`, mover `web/public/mock-tile` a `web/app/public/mock-tile`, `npm run build` y `npx wrangler deploy` (requiere `npx wrangler login`).

Sin claves en el código; el front no necesita ninguna. Mantener el agradecimiento a NASA/SPHEREx visible. Si la API no alcanza, el Worker es `api/src/index.js`.
