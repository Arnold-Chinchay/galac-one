# 03 · Pipeline de procesamiento: buenas prácticas

> Síntesis propia basada en los docs 01 y 02, los notebooks oficiales de IRSA y las prácticas de surveys de dominio temporal (ZTF, Backyard Worlds/WiseView). Investigado el 13-nov-2026.
> Los puntos marcados **[verificar]** son decisiones nuestras que conviene probar con datos reales el primer día.

## 0. Principios
1. **Nunca procesar en el navegador.** El FITS se procesa en Python y el frontend recibe imágenes (PNG/WebP) + JSON.
2. **Precalcular lo que va en la demo.** TAP tarda ~20 s y fallan descargas (~5-20 % en paralelo). La demo no puede depender del wifi del evento.
3. **Trazabilidad total.** Cada cuadro que mostramos guarda: `obs_id`, detector, `t_min` (MJD), λ central, versión de procesamiento y `access_url`. Lo valoran los jueces (criterio *Validity*) y nos protege de errores.
4. **Cache por capas:** consulta → lista de URLs (JSON) → recortes FITS crudos → cuadros procesados → assets web. Cada capa se guarda en disco para no repetir trabajo.
5. **Datos vigentes solamente:** DR1 + QR3. Excepción documentada: 3I/ATLAS (la tabla oficial apunta a QR2; ver doc 04).

## 1. Etapas del pipeline

```
[1] Consulta TAP/SIA  →  [2] Selección de épocas  →  [3] Descarga de recortes (paralela + reintentos)
        ↓
[4] Calibración ligera  →  [5] Registro/alineación al mismo grid de cielo  →  [6] Normalización de brillo
        ↓
[7] Imágenes de diferencia / detección  →  [8] Cruce con objetos conocidos  →  [9] Exportación web
```

### [1] Consulta
- TAP sobre `spherex.artifact` ⨝ `spherex.plane` con `CONTAINS(POINT(...), p.poly)`; filtrar por `energy_bandpassname` y ordenar por `time_bounds_lower` (ver doc 02 §3.2).
- Guardar el resultado como `query_<ra>_<dec>_<banda>.ecsv` (formato con unidades).

### [2] Selección de épocas (el punto más delicado en SPHEREx)
Una posición tiene **cientos** de imágenes, pero cada una ve el punto en una **λ distinta** (filtro LVF). Por eso:
- **Para MOVIMIENTO** (asteroides, cometas, enanas marrones de alto movimiento propio): la λ importa poco porque comparamos **posiciones**. Se pueden usar todas las épocas, normalizando el brillo de cada cuadro (paso 6).
  - Escala de horas o días (asteroides): imágenes del **mismo survey** separadas por pocas horas o días.
  - Escala de meses o años (enanas marrones, movimiento propio): **una imagen por survey** (hay 4 surveys en DR1+QR3, separados ~6 meses).
- **Para VARIABILIDAD de brillo:** comparar solo imágenes cuya λ central en la posición del objeto esté dentro de **±½ ancho de banda**. Con 4 surveys suele haber ~1 coincidencia por survey y canal **[verificar]**.
  - Mejor sitio para variabilidad: los **campos profundos** (polos eclípticos), con **~200 mediciones por canal en 2 años** (colecciones `_deep`). Ahí casi no hay asteroides, porque se concentran en la eclíptica.
- Elegir el **mismo detector** en todas las épocas de una animación, para un PSF y un nivel de fondo similares.

### [3] Descarga
- `ThreadPoolExecutor(max_workers=8..10)` + reintentos con backoff (10 s, 20 s, 30 s) ante `TimeoutError`, `HTTPError`, `IncompleteRead` y `RemoteDisconnected`.
- `astropy.utils.data.conf.remote_timeout = 120`.
- Recorte de **0.05-0.1°** (≈30-60 px a 6.15″/px). Más grande, solo para ver contexto.
- Guardar el FITS crudo del recorte en `data/raw/<obs_id>_D<det>.fits`. **No volver a descargarlo.**
- Registrar los fallos en un log y no detener el lote.

### [4] Calibración ligera (por recorte)
```python
img  = hdul['IMAGE'].data.astype('f4')
zodi = hdul['ZODI'].data
var  = hdul['VARIANCE'].data
flags= hdul['FLAGS'].data

sci = img - zodi                          # quitar luz zodiacal (cambia con la fecha y la dirección)
bad = (flags & BAD_MASK) != 0             # máscara de bits (doc 02 §5)
sci[bad] = np.nan
snr = sci / np.sqrt(var)                  # señal/ruido por píxel
```
- **No** enmascarar el bit `SOURCE` (21), que marca fuentes conocidas y es información útil.
- Descartar recortes con más del X % de píxeles malos (ej. >30 %) **[verificar umbral]**.

### [5] Registro (alinear todas las épocas al mismo grid)
- Cada recorte tiene su propio WCS (TAN-SIP) y la nave apunta distinto cada vez, así que hay rotación y desplazamiento.
- **Reproyectar** todas las épocas a un **WCS común** centrado en el objetivo (ej. TAN, norte arriba, 6.15″/px).
  - Librería: [`reproject`](https://reproject.readthedocs.io/) (`reproject_interp` para rapidez, `reproject_exact` para conservar flujo).
  - Reproyectar también la máscara (NaN) y la varianza.
- Validar la alineación: las estrellas fijas no deben "temblar" en la animación. Si tiemblan, revisar la SIP o usar `reproject_exact`.

### [6] Normalización de brillo (para que el blink sea legible)
- Fondo: restar la **mediana sigma-clipped** de cada cuadro (`astropy.stats.sigma_clipped_stats`).
- Escala entre épocas: λ distinta implica un brillo distinto de las estrellas. Opciones:
  1. **Simple (MVP):** normalizar cada cuadro por un percentil alto de las fuentes (ej. p99) o por la mediana de flujo de las estrellas de campo.
  2. **Mejor:** fotometría de apertura de N estrellas de campo en cada época y ajuste de un factor de escala (mínimos cuadrados) contra una época de referencia.
- Estiramiento visual **fijo para toda la animación** (no por cuadro, o el ojo verá "parpadeos" falsos):
  - `astropy.visualization`: `ZScaleInterval` o `PercentileInterval(99.5)` + `AsinhStretch()`.
  - Calcular los límites sobre la **pila mediana** de todas las épocas y aplicarlos a todos los cuadros.

### [7] Imágenes de diferencia y detección
**MVP (robusto y suficiente para un hackathon):**
- **Plantilla = mediana** de todas las épocas alineadas. Lo fijo sobrevive; lo que se mueve desaparece de la mediana.
- **Diferencia_i = época_i − plantilla.** Un objeto en movimiento aparece como mancha **positiva** en su posición de esa época.
- Detección sobre `diferencia / σ`, con un umbral de 5σ, usando `photutils.detection.DAOStarFinder` o `photutils.segmentation.detect_sources` **[verificar umbral]**.
- **Enlazar** detecciones entre épocas (tracklets): una secuencia de 3 o más detecciones casi en línea recta y con velocidad constante = **candidato a objeto en movimiento**. Esto descarta la mayoría de artefactos aislados (rayos cósmicos, fantasmas).
- Idea del proyecto NEOFIT (Space Apps 2016): una imagen base con PCA o mediana más mapa de **varianza** por píxel. Los píxeles con alta varianza temporal son candidatos (movimiento o variabilidad).

**Avanzado (solo si sobra tiempo):**
- Igualar PSF (los PSF cambian con la λ y la zona del detector) con kernels Alard-Lupton o ZOGY. Referencias: pipeline de ZTF (ZOGY), LSST `ip.diffim`, **TRANSLIENT** (extensión de ZOGY para fuentes en movimiento, con código Python; arXiv:2403.09771).
- Para objetos rápidos que dejan **traza** (streak) en una exposición de ~114 s, la detección lineal de trazas (tipo FindStreaks de ZTF).

**Fuentes de falsos positivos (lista de control):**
| Artefacto | Cómo filtrarlo |
|---|---|
| Rayos cósmicos / transitorios | Bit TRANSIENT; exigir aparición en ≥3 épocas |
| Persistencia (fantasma de una fuente brillante anterior) | Bit PERSIST |
| Crosstalk / ghosts / halos | Bits 20, 22-24, 26-28 |
| Píxeles calientes o muertos | Bits HOT/COLD/NONFUNC |
| Emisión atmosférica (aurora, He 1.083 µm, shuttle glow) | Templates oficiales; precaución en bandas 1, 2 y 5 |
| "Variabilidad" falsa por cambio de λ (LVF) | Comparar solo λ similares |
| Mala alineación | Revisar residuos de estrellas fijas en la diferencia |

### [8] Cruce con objetos conocidos ("¿lo conocemos o es nuevo?")
- **SkyBoT (IMCCE)** vía `astroquery.imcce.Skybot.cone_search(coord, radio, Time(mjd, format='mjd'))`: lista todos los asteroides, cometas y planetas conocidos en el campo en esa época. Radio máximo de 10° en astroquery. Hay que considerar el **observador**: SPHEREx está en órbita terrestre, así que geocéntrico (código 500) es una aproximación razonable para asteroides lejanos. Para NEOs cercanos puede haber desfase de arcsec.
- **JPL Horizons** (`astroquery.jplhorizons`): efemérides precisas de un objeto concreto.
- **MOST** (`astroquery.ipac.irsa.most`): dado un objeto (nombre, NAIF ID, elementos MPC u orbitales) devuelve **qué imágenes SPHEREx lo contienen** y su posición predicha (`ra_obj`, `dec_obj`, `mjd_obs`, `vmag`, `image_url`). Catálogo `spherex`.
- Regla de etiquetado:
  - candidato a ≤ ~2 px (≈12″) de un objeto de SkyBoT → **"Objeto conocido: <nombre>"**;
  - si no → **"Candidato sin identificar"** (comunicarlo con prudencia: necesita confirmación).

### [9] Exportación para la web
Por cada "caso" (región u objeto):
```
web/public/cases/<case_id>/
  manifest.json        # metadatos del caso y lista de cuadros
  frame_000.webp ...   # cuadros procesados y alineados, mismo estiramiento
  diff_000.webp  ...   # diferencias (opcional)
  median.webp          # plantilla
  detections.json      # candidatos y tracklets, con etiqueta conocido/desconocido
  spectrum.json        # (opcional) espectro del objeto marcado
```
`manifest.json` (ejemplo):
```json
{
  "case_id": "3i-atlas-2025-08",
  "title": "Cometa interestelar 3I/ATLAS",
  "center": {"ra": 252.66, "dec": -17.49},
  "pixel_scale_arcsec": 6.15,
  "wcs": { "...": "WCS común en formato FITS header (para pintar coordenadas)" },
  "frames": [
    {"file": "frame_000.webp", "mjd": 60888.3334, "iso": "2025-08-01T08:00:00Z",
     "detector": "D3", "wavelength_um": 1.98, "obs_id": "2025W31_2A_0156_1",
     "source_url": "https://irsa.ipac.caltech.edu/...", "release": "QR2"}
  ],
  "stretch": {"interval": "zscale", "stretch": "asinh"},
  "credits": "SPHEREx data: NASA/JPL-Caltech/IPAC-IRSA"
}
```
- **WebP** pesa ~30 % menos que PNG con buena calidad. PNG de 8 bits es aceptable. Para enviar datos crudos al navegador (ej. para que el usuario ajuste el contraste): Float32 en binario o PNG de 16 bits **[opcional]**.
- Exportar también un **GIF o MP4** por caso para compartir en redes y para el video de 30 s de la entrega.

## 2. Stack de Python recomendado
| Paquete | Uso |
|---|---|
| `astropy` | FITS, WCS, unidades, tiempo, tablas, `visualization` (estiramientos) |
| `astroquery` | `Irsa` (SIA/TAP), `Most`, `Skybot`, `Horizons` |
| `pyvo` | Acceso VO de bajo nivel (alternativa) |
| `reproject` | Alinear épocas a un WCS común |
| `photutils` | Fondo, detección de fuentes, fotometría de apertura |
| `numpy`, `scipy` | Arreglos, filtros, ajuste |
| `hpgeom` o `healpy` | Índice HEALPix para los mosaicos del All-Sky Cube |
| `Pillow` / `imageio` | Exportar WebP/PNG/GIF/MP4 |
| `fastapi` + `uvicorn` | API opcional "en vivo" |
| `firefly-client` | Explorar datos con el visor de IRSA (no producción) |

Fijar versiones en `requirements.txt` (`pip freeze`) desde el primer día.

## 3. Organización del código
```
pipeline/
  query.py        # [1]-[2] consultas y selección de épocas
  fetch.py        # [3] descarga paralela con cache y reintentos
  calibrate.py    # [4] zodi, flags, varianza
  align.py        # [5] reproyección
  normalize.py    # [6] fondo, escala, estiramiento
  detect.py       # [7] diferencias, detección, tracklets
  crossmatch.py   # [8] SkyBoT/Horizons/MOST
  export.py       # [9] WebP + JSON
  run_case.py     # orquesta todo para un caso: python run_case.py --ra .. --dec .. --band D2
data/raw/  data/interim/  web/public/cases/
```
- Cada etapa es una **función pura** (entrada → salida en disco) para poder reejecutarlas por separado.
- Logs con `logging` (no `print`), y un `README` con el comando exacto para regenerar cada caso.
- Semillas y parámetros (umbrales, tamaño de recorte, bits de máscara) en un solo `config.yaml`.

## 4. Validación (cómo demostramos que funciona)
1. **Prueba con objeto conocido:** con MOST, elegir un asteroide brillante que SPHEREx observó. El pipeline debe **encontrarlo solo** y SkyBoT etiquetarlo correctamente.
2. **Prueba negativa:** un campo sin objetos conocidos no debe producir tracklets. Contar los falsos positivos.
3. **Cometa 3I/ATLAS:** mostrar el movimiento con la posición predicha superpuesta.
4. Reportar en el README la **tasa de recuperación** (encontrados / conocidos en el campo) y los **falsos positivos por campo**. Son números simples que dan mucha credibilidad.
