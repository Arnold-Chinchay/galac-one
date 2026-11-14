# 02 · Cómo acceder a los datos SPHEREx (buenas prácticas)

> Fuentes: [SPHEREx Data Access (IRSA User Guide)](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/), notebooks oficiales [Introduction to SPHEREx Spectral Images](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) y [Spectral Image Cutouts](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/) (actualizados al 5-mar-2026). Investigado el 13-nov-2026.

## 1. Las 4 capas de acceso que ofrece IRSA
| Capa | Para qué sirve | ¿La usamos? |
|---|---|---|
| **Directorios navegables** `https://irsa.ipac.caltech.edu/ibe/data/spherex/` (subcarpetas `dr1`, `qr3`, `qr2`) | Ver qué hay, descargas masivas con `wget`/`curl`, archivos de calibración | Solo para explorar o para calibraciones |
| **API SIA2** (IVOA Simple Image Access v2) | Buscar imágenes por posición, banda o tiempo; devuelve `access_url` y `cloud_access` | **Sí**, para buscar |
| **API TAP** (consultas SQL/ADQL a tablas de metadatos) | Igual que SIA pero más flexible y **sin el retraso de 1 día** | **Sí**, consulta principal |
| **Cutout Service** | Recortes espaciales del MEF | **Sí, el núcleo de la app** |
| **AWS S3** (nube) | Espejo de todo; acceso rápido desde la nube | Opcional, si procesamos en la nube |
| **SPHEREx Data Explorer** (GUI web) | Buscar y visualizar a mano | Para explorar y elegir casos de demo |

Las calibraciones **no** están en SIA2; se bajan de los directorios navegables.

## 2. Colecciones SIA2
Endpoint genérico: `https://irsa.ipac.caltech.edu/SIA?COLLECTION=...`

| Colección | Contenido |
|---|---|
| `spherex_dr1` | DR1, Wide Survey (cobertura uniforme) |
| `spherex_dr1_deep` | DR1, Deep Survey (campos profundos, polos eclípticos) |
| `spherex_dr1_cube` | DR1 All-Sky Cube |
| `spherex_qr3` | QR3, Wide Survey |
| `spherex_qr3_deep` | QR3, Deep Survey |

Para tener **todas** las imágenes vigentes hay que buscar en `spherex_dr1` + `spherex_qr3` (y en las `_deep` si interesan los campos profundos). QR2 ya no se puede buscar.

Ejemplo por línea de comandos:
```bash
curl -o ejemplo.html "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+127.69444+-39.17760+0.01&RESPONSEFORMAT=HTML"
```

### Columnas clave de la respuesta SIA (estándar IVOA ObsCore)
- `access_url`: URL del FITS (en IRSA).
- `cloud_access`: info para leerlo desde AWS S3.
- `t_min`, `t_max`: **tiempo de la observación (MJD)**. Esta es la fecha que importa para la serie temporal.
- `energy_bandpassname`: banda (ej. `SPHEREx-D2`).
- `em_min` / `em_max`: rango de λ.
- `obs_id`, `s_ra`, `s_dec`, `s_region` (polígono en el cielo), `access_estsize`.

⚠️ La cabecera `DATE` del FITS es la **fecha de procesamiento**, no la de observación. Para la serie temporal se usa `t_min` (SIA) o `time_bounds_lower` (TAP).

## 3. Python: librerías recomendadas
- **`astroquery.ipac.irsa`** (recomendado por IRSA para la mayoría): `Irsa.query_sia(...)` e `Irsa.query_tap(...)`.
- **`pyvo`**: acceso de más bajo nivel y multi-archivo.
- **`astropy`**: `fits`, `WCS`, `SkyCoord`, `Table`, unidades.
- **`firefly_client`**: visor de IRSA que **sí entiende el WCS espectral** de SPHEREx (útil para explorar).

```python
# pip install numpy matplotlib astropy astroquery pyvo firefly-client
from astropy.utils.data import conf
conf.remote_timeout = 120   # los FITS de SPHEREx tardan; subir el timeout por defecto
```

### 3.1 Búsqueda por SIA (simple)
```python
from astroquery.ipac.irsa import Irsa
from astropy.coordinates import SkyCoord
import astropy.units as u

coord = SkyCoord(304.6935, 42.4437, unit='deg')
results = Irsa.query_sia(pos=(coord, 1*u.arcsec),
                         collection=['spherex_dr1', 'spherex_qr3'])
len(results)   # ¡en el ejemplo oficial devolvió 443 imágenes para UN punto!
```
**Dato clave:** una sola posición del cielo tiene **cientos de imágenes** (todos los detectores, varias épocas y varios apuntados por época). Sobra material para series temporales.

### 3.2 Búsqueda por TAP (recomendada: sin retraso y ordenada por tiempo)
Devuelve directamente la **URL del recorte** y la **fecha de observación**, filtrada por detector:
```python
coord = SkyCoord(ra=210.80227*u.deg, dec=54.34895*u.deg)
size = 0.1 * u.deg          # tamaño del recorte
bandpass = 'SPHEREx-D2'     # detector/banda

query = f"""
SELECT
  'https://irsa.ipac.caltech.edu/' || a.uri ||
  '?center={coord.ra.deg},{coord.dec.deg}d&size={size.value}' AS uri,
  p.time_bounds_lower
FROM spherex.artifact a
JOIN spherex.plane p ON a.planeid = p.planeid
WHERE 1 = CONTAINS(POINT('ICRS', {coord.ra.deg}, {coord.dec.deg}), p.poly)
  AND p.energy_bandpassname = '{bandpass}'
ORDER BY p.time_bounds_lower
"""
results = Irsa.query_tap(query)   # ~20 s; en el ejemplo, 84 imágenes de D2 para M101
```
- Tablas: `spherex.artifact` (archivos) y `spherex.plane` (metadatos: polígono `poly`, tiempo y banda).
- Incluye DR1 + QR3.

### 3.3 Recortes (cutouts)
Se agrega `?center=RA,DEC&size=GRADOS` a la URL del MEF:
```bash
curl -o cutout.fits "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W21_2A/l2b-v27-2026-268/1/level2_2026W21_2A_0001_2D1_spx_l2b-v27-2026-268.fits?center=337.8783221,-5.1891588&size=0.1"
```
Parámetros documentados en <https://irsa.ipac.caltech.edu/ibe/cutouts.html>.

### 3.4 Leer un FITS con reintentos (patrón oficial)
```python
import time, http.client, urllib.error
from astropy.io import fits

for attempt in range(3):
    try:
        with fits.open(url, memmap=False) as hdul:
            for hdu in hdul:
                hdu.data          # forzar la carga en memoria
        break
    except (TimeoutError, urllib.error.HTTPError, http.client.IncompleteRead):
        if attempt == 2: raise
        time.sleep(10 * (attempt + 1))   # backoff
```

### 3.5 Descarga en paralelo (patrón oficial)
- En serie: unos 5-7 min para 700 recortes de 0.01°. En paralelo con `ThreadPoolExecutor(max_workers=10)`: **~10× más rápido** (0.22 min frente a 2.26 min en el ejemplo).
- IRSA recomienda **7-12 workers** en una máquina de 8 núcleos, **sin pasarse** (el servidor tiene que aguantar).
- **Siempre hay fallos transitorios**: en el ejemplo fallaron ~16 de 84 recortes en paralelo. **Hay que manejar errores y reintentar**, no asumir que todo baja.
- `fits.open(url, cache=True)` guarda en `~/.astropy/cache/`. Acelera las re-ejecuciones pero ocupa disco.

## 4. Coordenadas espectrales (λ de cada píxel)
```python
from astropy.wcs import WCS
spatial_wcs = WCS(hdul['IMAGE'].header)                       # RA/Dec (TAN-SIP)
x, y = spatial_wcs.world_to_pixel(coord)

spectral_wcs = WCS(hdul['IMAGE'].header, fobj=hdul, key='W')  # WCS alterno "W"
spectral_wcs.sip = None                                       # ¡OBLIGATORIO! la λ no lleva distorsión óptica
wl, bw = spectral_wcs.pixel_to_world(x, y)                    # λ central y ancho de banda
```
- La cabecera tiene **3 WCS**: el principal (cielo, píxeles desde 1), `A` (píxeles desde 0) y `W` (λ y ancho de banda vía la tabla `WCS-WAVE`).
- Las curvas de λ constante son **curvas** (no rectas), así que λ depende de x **y** de y.
- Astropy emite un INFO sobre SIP al cargar el WCS `W`; es esperado.

## 5. Banderas (FLAGS): qué enmascarar
Las definiciones vienen en la cabecera de la extensión FLAGS: `MSKNnnnn` (nombre) y `MSKDnnnn` (descripción).

| Bit | Nombre | Significado | ¿Enmascarar para detectar cambios? |
|---|---|---|---|
| 0 | TRANSIENT | Transitorio detectado (rayo cósmico) | **Sí** |
| 1 | OVERFLOW | Saturación | **Sí** |
| 2 | SUR_ERROR | Error de procesamiento a bordo | **Sí** |
| 6 | NONFUNC | Píxel inservible | **Sí** |
| 7 | DICHROIC | Baja eficiencia por el dicroico | Sí |
| 9 | MISSING_DATA | Dato perdido | **Sí** |
| 10 | HOT | Píxel caliente | **Sí** |
| 11 | COLD | Señal anómalamente baja | Sí |
| 12 | FULLSAMPLE | Historial completo disponible | No (informativo) |
| 14 | PHANMISS | Corrección phantom no aplicada | Sí (precaución) |
| 15 | NONLINEAR | No linealidad no corregible | Sí |
| 17 | PERSIST | Carga persistente (imagen fantasma de una fuente brillante anterior) | **Sí**: puede parecer un objeto que "aparece" |
| 19 | OUTLIER | Valor atípico | **Sí** |
| 20 | CROSSTALK | Diafonía | **Sí** |
| 21 | SOURCE | Píxel asociado a **una fuente conocida** | **No** enmascarar: es información útil. Un objeto nuevo en un píxel **sin** SOURCE es candidato |
| 22-24 | GHOST / GHOST_FPA / GHOST_EXT | Fantasmas de fuentes brillantes | **Sí** |
| 25 | STREAK | Raya (satélite u otra) | **Sí** |
| 26-28 | BLOOM / SNOWBALL / HALO | Artefactos | **Sí** |

En la cabecera de IMAGE, las keywords `L2 N_*` cuentan cuántos píxeles tienen cada bandera. Sirven para **descartar imágenes muy contaminadas**.

```python
BAD_BITS = [0,1,2,6,7,9,10,11,14,15,17,19,20,22,23,24,25,26,27,28]
bad_mask = 0
for b in BAD_BITS: bad_mask |= (1 << b)
flags = hdul['FLAGS'].data
bad = (flags & bad_mask) != 0          # True = píxel no confiable
img = hdul['IMAGE'].data - hdul['ZODI'].data
img[bad] = np.nan
```
(La lista de bits es nuestra propuesta; validarla contra la Tabla 16 del Explanatory Supplement.)

## 6. Rendimiento y escala (para dimensionar)
- MEF completo: ~70 MB; 6 por apuntado. **Nunca bajar MEFs completos para la app**, solo recortes.
- Un recorte de 0.1° ≈ 58 px de lado (6.15″/px). Pesa poco: KB, no MB.
- TAP tarda ~20 s por consulta, demasiado para hacerlo en vivo frente al usuario. **Hay que precalcular o cachear.**
- SIA tiene **~1 día de retraso** respecto a la ingesta semanal; TAP, el Data Explorer y los directorios no.

## 7. Recomendación de arquitectura de acceso
1. **Backend o script Python (offline):** TAP → lista de recortes ordenada por tiempo → descarga paralela con reintentos → preprocesamiento (restar ZODI, enmascarar FLAGS, calcular λ) → exportar **PNG o WebP por época + JSON de metadatos** (fecha, λ, banda, URL de origen).
2. **Frontend:** solo consume esos PNG/JSON estáticos, sin tocar FITS en el navegador.
3. **Modo "en vivo" opcional:** un pequeño servidor (FastAPI) que hace el mismo pipeline bajo demanda y cachea los resultados por (RA, Dec, tamaño, banda).
4. **Siempre** guardar `access_url` y la versión de procesamiento de cada recorte, por trazabilidad (los jueces valoran que los datos sean verificables).
