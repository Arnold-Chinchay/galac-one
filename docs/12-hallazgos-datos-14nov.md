# 12 · Hallazgos verificados con datos reales (14-nov-2026)

> Probado desde el código en `pipeline/`, no leído en documentación. Esto **corrige** algunas estimaciones de los docs 02, 03 y 11.

## 1. 🔴 El TAP de IRSA estaba caído
- Hacia las 11:40 hora Perú (16:40 UTC), `TAP/sync`, `TAP/availability`, **SIA2** y **datalink** respondieron **502 Proxy Error**, incluso en `/availability`. Reintentos inmediatos fallaron igual.
- **Siguen funcionando:** la página principal, la documentación y los archivos estáticos (la tabla VOTable de 3I/ATLAS) y el **Cutout Service** (`/ibe/data/...`).
- **Por qué importa:** TAP es la única forma de saber **qué imágenes cubren un punto del cielo**. Sin él no se puede armar la lista de cuadros de un campo nuevo. `/ibe/search/spherex/...` **no existe** (404) y `/ibe/data/spherex/` **no lista directorios**.
- **Qué hacer:**
  1. Comprobar `python -c "from pipeline.irsa import tap_is_up; print(tap_is_up())"` cada cierto tiempo. El código ya reintenta con espera creciente.
  2. **En cuanto vuelva, guardar las listas de cuadros de todos los campos de la demo** (`cache/frames/*.json`) y **subirlas al repo** (pesan pocos KB). Así la demo no vuelve a depender de TAP.
  3. Mientras tanto, `fetch_tile` acepta `--frames-json` con una lista hecha a mano (`[{"uri": "...", "mjd": 0}]`).
  4. Si sigue caído mucho tiempo, escribir al **IRSA Helpdesk**.
- **Abierto:** la tabla de 3I/ATLAS (259 filas) trae `access_url` de datalink, que también está caído. Hay que ver si se puede construir la URL del recorte QR2 a partir de `obs_id` (la versión del archivo, `l2b-vXX-...`, no la conocemos) **[verificar]**.

## 2. Cada recorte pesa 4 MB (no 86 KB)
Probado con `?center=337.8783221,-5.1891588deg&size=0.1deg`:
| Dato | Valor |
|---|---|
| Tamaño de la descarga | **4.0 MB** |
| Tiempo | **7-12 s** por recorte |
| Imagen | 58 × 59 px (0.1°, ~6.15″/px) |
| Extensiones | `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `EPSF` (tabla de 441 PSF de 33×33 doubles ≈ 3.8 MB), `WCS-WAVE` |
| Compresión | Ninguna (los recortes de SPHEREx nunca se comprimen) |
| **CORS** | **No hay** cabecera `Access-Control-Allow-Origin` |
| Selección de extensiones | **No se puede** (la doc solo admite `center`, `size`, `gzip`) |

**Consecuencias:**
- **El navegador no puede pedir recortes directo.** Todo se descarga en GitHub Actions.
- **Presupuesto de descarga:** ~150 cuadros × 4 MB ≈ **600 MB por mosaico**. Con 4 descargas en paralelo son ~8 min por mosaico. 50 mosaicos ≈ 30 GB: aceptable en Actions, pero hay que ser **amables con IRSA** (máximo 4-8 en paralelo, caché, nunca bajar dos veces lo mismo).
- **Después de reducir** (`pipeline/reduce.py` tira `EPSF`): **~48 KB por cuadro** (float32 comprimido). ~7 MB por mosaico antes de float16, en línea con lo estimado en el doc 11.

## 3. Qué trae cada cuadro (confirmado)
- **Tiempo:** `MJD-AVG` (mitad de la exposición). `DATE` es la fecha de procesamiento, **no** la de observación.
- **Unidades:** `MJy/sr`. **WCS:** `RA---TAN-SIP` (con distorsión SIP; usar `astropy.wcs.WCS`).
- **Longitud de onda por píxel:** la tabla `WCS-WAVE` es una **cuadrícula de 9×9 sobre todo el detector**, en coordenadas de píxel activo 0-based (WCS "A" del header). `pipeline/reduce.py` la interpola al recorte.
  - Ejemplo (detector 1): centro **0.869 µm**, y solo varía **0.0106 µm** en todo el recorte de 0.1°. Dentro de un recorte pequeño la λ es casi constante; entre cuadros sí cambia.
- **FLAGS:** bits vistos en este recorte: 0, 2, 6, 11, 17, 19, 21, 28. **Falta validar su significado** contra la Tabla 16 del Explanatory Supplement antes de enmascarar.
- Imagen: mediana 0.40 MJy/sr, ZODI mediana 0.36 MJy/sr (el fondo zodiacal domina el valor de la imagen, como se esperaba).

## 4. Qué quedó construido (probado)
| Archivo | Qué hace | Estado |
|---|---|---|
| `pipeline/irsa.py` | Consulta TAP con reintentos y caché · URL de recorte · descarga con reintentos y archivo temporal | Descarga probada. **Consulta TAP sin probar** (caída) |
| `pipeline/reduce.py` | Recorte → arrays pequeños + λ por píxel + WCS | Probado |
| `pipeline/fetch_tile.py` | Descarga paralela de todos los cuadros de un campo | Probado de punta a punta con `--frames-json` |
| `migrations/0001_init.sql` | Esquema de D1 | **Aplicado** en la base `naylamp-db` |
| Cloudflare | Bucket R2 `naylamp-tiles` y base D1 `naylamp-db` | **Creados** (R2 no pidió tarjeta) |

## 5. Cómo correrlo (para el equipo)
```bash
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install -r pipeline\requirements.txt
.venv\Scripts\python -m pipeline.fetch_tile --name wise0855 --ra 133.79513 --dec -7.24515 --fov 0.1
```
Salida en `cache/tiles/<name>/` (no se sube a Git): `frames.json` ordenado por tiempo y un `frame_XXXX.npz` por cuadro.

## 6. Lo que sigue en el backend
1. Cuando TAP vuelva: listas de cuadros de los 5 objetivos + 3I/ATLAS + Plutón, y contar cuadros por campo (experimento 3 del doc 00).
2. `align.py`: `reproject` de todos los cuadros a un WCS común; máscara de `FLAGS` validada.
3. `spectral_sub.py`: la resta espectral (experimento 1).
4. `export_tile.py` + subida a R2 (necesita las claves S3 de R2, que se crean en el panel de Cloudflare).
5. Worker de la API (votos y estadísticas) sobre la base D1 ya creada.
