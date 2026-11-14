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

## 1b. ✅ Solución: SPHEREx está completo en AWS S3, y armamos **nuestro propio índice**
- **Comprobado que no eran links viejos:** el código **exacto** del tutorial oficial (`Irsa.query_sia(..., collection=['spherex_dr1','spherex_qr3'])`, actualizado el 5-mar-2026) también falla con 502 en `SIA/capabilities`. Es una caída del lado de IRSA.
- **AWS Open Data:** bucket público **`s3://nasa-irsa-spherex`** (región `us-east-1`, acceso **anónimo**, sin cuenta AWS). Prefijos `dr1/`, `qr3/`, `qr2/`. Dentro de `dr1/`: `level2/` (imágenes), `hips5_cube/` (cubo del cielo completo), `spectral_wcs/`, calibraciones, etc.
- **Estructura:** `dr1/level2/<semana>/l2b-v27-2026-196/<detector>/level2_<obsid>D<det>_spx_l2b-v27-2026-196.fits`. Hay **110 semanas**, ~9,400 archivos y ~613 GB por semana, unos **~1 millón de imágenes** en DR1. Cada archivo pesa ~65 MB. También hay carpetas `l2b_retry-...` (reprocesos).
- **La clave del bucket es la misma ruta que usa IRSA:** `https://irsa.ipac.caltech.edu/ibe/data/spherex/` + clave S3. El Cutout Service funciona con esas URLs.
- **No hay índice espacial en el bucket.** Por eso escribimos `pipeline/s3index.py`: lee **solo los primeros 31 KB** de cada FITS con una petición de rango HTTP (0.22 s). Ahí está el header de `IMAGE` con WCS, tiempo y detector. De eso calcula la huella (4 esquinas) de cada imagen.
  - Probado: 1 semana = 9,416 imágenes en 176 s desde una laptop; el CSV comprimido pesa 533 KB.
  - **Validado:** para la posición del tutorial oficial, nuestra primera imagen coincide **exactamente** con la que devuelve el tutorial (`level2_2025W18_1B_0074_2D1`).
  - `pipeline/frames_index.py` responde "qué imágenes cubren (RA, Dec)" con prueba exacta de punto en polígono.
  - `fetch_tile.py --source auto` usa TAP si está vivo y, si no, nuestro índice.
- **Índice completo de DR1:** lo construye el workflow `.github/workflows/build-index.yml` (22 trabajos en paralelo) y lo publica como **GitHub Release `index-dr1`** (`dr1_index.csv.gz`, ~60 MB estimados). Para usarlo: descargarlo y pasar `--index dr1_index.csv.gz`.
- **Bonus:** esto también hace posible "pedir un campo nuevo" sin depender de IRSA, y repetirlo para QR3 (`-f release=qr3`).

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

## 7. Primera prueba con cielo real: WISE 0855 (14-nov-2026, tarde) — **resultado: NO validado todavía**
Descargamos y procesamos el campo real (`python -m pipeline.fetch_tile --name wise0855 ... --source index`): **256/256 cuadros en 6 min, 0 fallos** (IRSA devuelve 503 con 8 descargas en paralelo; los reintentos lo resuelven). Alineado: 254/256 cuadros, λ de 0.745 a 4.98 µm, los 6 detectores.

**Qué se aprendió:**
1. **La resta espectral no demostró nada en este campo.** Es un campo vacío (mediana 0.02 MJy/sr, ruido ~0.015 por píxel y cuadro): la variación entre cuadros es solo ruido, así que "reducción ×1.007" no significa que falle ni que funcione. La métrica sintética (×55) no se puede comparar. **Hace falta un campo con estrellas brillantes** (p. ej. R Draconis o el campo de Barnard) para validarla de verdad.
2. **5 de 254 cuadros están rotos:** 4 de D1 y 1 de D2 (λ ≈ 1.06–1.10 µm) tienen 78–90 % de los píxeles a más de 5σ. Hay que **detectarlos y descartarlos** (fracción de píxeles a >5σ del cuadro) antes de ajustar el modelo.
3. **Los detectores D1 y D6 tienen colas pesadas** (11 % y 6 % de píxeles a >5σ vs 0.1-0.2 % en D3/D4), más allá de los cuadros rotos. Posible causa: fondo zodiacal residual que cambia con el tiempo y la λ en los extremos de banda. **Hipótesis a probar:** restar la mediana espacial de cada cuadro antes de ajustar.
4. **Las coordenadas oficiales de WISE 0855 son de 2010.** Con 8″/año de movimiento propio, en 2026 está ~20 píxeles al oeste del centro. Con la cuadrícula de 40×40 (±20 px) **queda justo en el borde o fuera**: hay que **centrar los mosaicos de objetos con movimiento propio en su posición a la época de observación**, no en la del catálogo.
5. **No encontramos a WISE 0855.** En la posición esperada hay una **estrella azul brillante** (~50σ en D1-D4, flujo que baja con λ), que no puede ser WISE 0855 (invisible por debajo de ~3.5 µm). Prueba que falta hacer: buscar una fuente **muy roja** (cociente D6/D1 enorme) cerca de esa posición. La posición predicha usa un movimiento propio de la literatura que **no verificamos** [verificar].

**Pendiente inmediato:** validar la resta espectral en R Draconis/Barnard; añadir rechazo de cuadros rotos y resta de fondo por cuadro; centrado por movimiento propio.

## 8. Segunda prueba con cielo real: R Draconis (campo denso)
Descarga: 297/297 cuadros (1 de cada 8), 0 fallos, 10 min. Alineado: 294. La resta espectral descartó 12 cuadros rotos y dejó **282**.

**Bien:** las colas bajaron a 0.1–0.4 % en todos los detectores y el ruido normalizado quedó en 1.01. Gracias a eso, un píxel ruidoso no genera falsos candidatos.

**Mal:** en las estrellas brillantes la resta **no las elimina**. Reducción de la variación en píxeles brillantes: **×1.3** (en el cielo sintético fue ×55).
- El residuo en las 4 fuentes más brillantes es 30–70 veces el ruido formal y ~50 % de su flujo.
- No es ruido: es un error multiplicativo. Causa más probable: la PSF está **mal muestreada** (píxeles de 6.15″ con FWHM similar), así que cada cuadro ve la estrella con una fase de subpíxel distinta, más el remuestreo bilineal del alineado y la PSF distinta por detector.
- Hay píxeles de estrellas **enmascarados en todos los cuadros** de algunas bandas (saturación), por eso aparecen NaN.

**Consecuencia:** el método sirve en zonas de cielo débil (donde está el 70 % de los píxeles de este campo) y **pierde sensibilidad cerca de estrellas brillantes**. Para objetos que se mueven es aceptable; para variables brillantes (R Draconis) no.

**Opciones a probar (en este orden):**
1. Ajustar el modelo sobre el **flujo sumado en 3×3 píxeles** (insensible a la fase de subpíxel).
2. Alinear con un remuestreo que conserve mejor el flujo, o no remuestrear y comparar en el plano de cada detector.
3. Marcar como "no fiables" los píxeles con residuo muy mayor que el ruido, y descartar ahí los candidatos.

## 9. Ganancia por cuadro (R Draconis): la causa principal del mal resultado
**Prueba:** cuadros del **mismo detector y casi la misma λ** (diferencia < 0.02 µm) deberían dar el mismo flujo en las estrellas brillantes. No lo daban: **24 % de diferencia mediana**, creciendo con el tiempo entre cuadros (9 % a menos de 15 días, 27 % a 15-60 días, 46 % a más de 60). Entre DR1 y QR3, hasta ~100 %. La dispersión entre píxeles dentro de un mismo cuadro era solo ~12 %, así que el cambio es **una escala global por cuadro**, no ruido de PSF. La suma en 3×3 píxeles (`--box 3`) no cambió nada, lo que descarta la fase de subpíxel como causa principal.

**Corrección:** `fit_with_gain` estima una ganancia por cuadro con las estrellas brillantes estáticas del campo y la ajusta junto con el espectro de cada píxel. La ganancia media de cada detector no se ajusta (la absorbe el espectro).
- Cielo sintético con ganancias aleatorias de 0.6 a 1.6: reducción **×3.4 sin ganancia → ×53 con ganancia**, error de la ganancia 5.5 % dentro de cada detector.
- R Draconis real: diferencia entre cuadros de igual λ **27 %/46 % → 9 %/10 %** y reducción en píxeles brillantes **×1.3 → ×2.6**. Recupera además 7 cuadros que se descartaban por error (282 → 289).
- Ganancias ajustadas: p5-p95 = 0.51-1.55; los extremos (0.15 y 6.3) son cuadros rotos.

**Lo que NO sabemos:**
1. **No está probado el origen físico.** La ganancia no sigue la versión de datos (D1: QR3/DR1 = 2.1; D4: 0.86; D5: 0.83). Puede ser calibración, apuntado o variabilidad real de las estrellas más brillantes del campo.
2. **Riesgo:** como la ganancia sale de las fuentes brillantes, una variable muy dominante podría ser absorbida. Con ~8 fuentes brillantes la mediana lo reduce, pero **hay que probarlo inyectando una variable sintética**.
3. **El suelo restante es ~6-10 % del flujo** en estrellas brillantes (todavía ×2.6 y no ×50). En cielo débil esto no importa; cerca de estrellas brillantes sí.
4. Sin resolver: **WISE 0855 sigue sin encontrarse** y R Draconis (la variable oficial) no se ha extraído todavía.
