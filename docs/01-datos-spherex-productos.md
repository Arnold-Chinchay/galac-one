# 01 · Datos SPHEREx: lanzamientos y productos

> Investigación hecha el 13-nov-2026 para el reto **"Planet X and SPHEREx"** (NASA Space Apps 2026, equipo Naylamp Space, Piura).
> Fuente principal: [SPHEREx Archive at IRSA – User Guide](https://caltech-ipac.github.io/spherex-archive-documentation/) (actualizada el 12-nov-2026).

## 1. Qué es SPHEREx (lo mínimo que hay que saber)
- Misión NASA (Medium Explorer) lanzada en **marzo 2025**, misión nominal de 25 meses.
- Hace espectroscopía de **0.75 a 5 µm** (infrarrojo cercano) de **todo el cielo** y cubre el cielo completo cada ~6 meses ("survey").
- Política de datos: **publicación inmediata**. IRSA (NASA/IPAC Infrared Science Archive, Caltech) publica imágenes **cada semana**.
- Píxel de la imagen: **6.15 arcsec** (resolución espacial baja; los objetos se ven como puntos de pocos píxeles).

## 2. Qué versión de datos usar (MUY IMPORTANTE)
| Release | Contenido | Estado (nov-2026) |
|---|---|---|
| QR1 | primeras imágenes (jul-2025) | **Retirado** feb-2026, ya no existe |
| QR2 | reprocesado con mejor calibración (oct-2025) | **Reemplazado**. Ya no se busca; descarga directa hasta feb-2027 |
| **QR3** | Surveys 3 y 4, semanal desde sep-2026 | **Usar** |
| **DR1** | Surveys 1 y 2 reprocesados (calibración de QR3) + **All-Sky Cube** | **Usar**, publicado nov-2026 |

**Buena práctica:** usar solo **DR1 + QR3** para trabajo nuevo. **No mezclar QR2 con DR1/QR3**: las calibraciones cambiaron, y el brillo podría "cambiar" por la calibración y no por el objeto. Si fuera necesario combinarlos, existe el producto *Flux Corrections*.

**Para nuestro proyecto (cambio temporal):** DR1 (surveys 1-2) + QR3 (surveys 3-4) nos dan hasta **4 pasadas del cielo** (~2 años) con calibración consistente. Es la base ideal para ver movimiento y variabilidad.

## 3. Producto principal: Spectral Image MEF (Level 2)
Es un FITS multi-extensión (MEF). Hay **6 archivos por apuntado (uno por detector)**, de **~70 MB cada uno** y **2040 × 2040 px**.

| HDU | Nombre | Contenido | Uso para nosotros |
|---|---|---|---|
| 1 | `IMAGE` | Brillo superficial calibrado en **MJy/sr**. **Sin** restar luz zodiacal | La imagen a mostrar |
| 2 | `FLAGS` | Bitmap de banderas por píxel (Tabla 16 del Explanatory Supplement) | **Enmascarar** píxeles malos antes de comparar |
| 3 | `VARIANCE` | Varianza en (MJy/sr)² | Señal/ruido, saber si un cambio es real |
| 4 | `ZODI` | Modelo de luz zodiacal (no restado) | **Restar** para comparar fechas distintas |
| 5 | `EPSF` (DR1/QR3) / `PSF` (QR2) | Función de dispersión de punto por zona | Fotometría precisa (opcional) |
| 6 | `WCS-WAVE` | Tabla: píxel → longitud de onda central y ancho de banda | Saber **en qué longitud de onda** se ve cada píxel |

Nombre de archivo:
```
level2_[ObservationID]D[Detector]_spx_l2b-v[Version]-[FechaProceso].fits
ej.: level2_2025W18_2B_0001_1D1_spx_l2b-v12-2025-164.fits
```
- **Planning Period** (ej. `2025W18_2B`): plan de ~3.5 días.
- **Observation ID** = planning period + contador de slew grande + contador de slew pequeño (1-4).
- **Detector**: 1 a 6.

### Los 6 detectores / bandas
| Detector/Banda | λ (µm) | Resolución espectral R |
|---|---|---|
| 1 | 0.75 – 1.09 | 39 |
| 2 | 1.10 – 1.62 | 41 |
| 3 | 1.63 – 2.41 | 41 |
| 4 | 2.42 – 3.82 | 35 |
| 5 | 3.83 – 4.41 | 112 |
| 6 | 4.42 – 5.00 | 128 |

Un divisor dicroico separa la luz en dos planos focales de 3 detectores cada uno: detectores 1-3 (onda corta) y 4-6 (onda larga). Los 6 detectores observan **a la vez**.

### ⚠️ La trampa del filtro LVF (clave para la validez científica)
Cada detector está detrás de un **filtro lineal variable (LVF)**: **la longitud de onda cambia a lo largo de un eje del detector**. Consecuencias:
- Una estrella en el borde izquierdo de la imagen se ve en otra longitud de onda que en el borde derecho.
- SPHEREx arma los espectros **re-apuntando**: la misma fuente cae en distintas posiciones del detector y por eso se mide en distintas λ.
- **Para nuestra herramienta:** si comparamos dos imágenes de fechas distintas, la misma estrella puede estar en distinta posición del detector y por lo tanto en **distinta λ**. Su brillo cambia aunque la estrella no varíe. **Comparar el brillo sin corregir la λ puede producir falsos "variables".**
- **Movimiento (asteroides):** la posición en el cielo no depende de la λ, así que detectar movimiento es más robusto que detectar variabilidad de brillo.
- **Para variabilidad:** solo comparar mediciones de la **misma λ (mismo canal espectral)**, o usar el *All-Sky Cube*, que ya separa por canal.

`WCS-WAVE` sirve para visualización (precisión de ~1 nm con interpolación bilineal entre 4 puntos de control). Para análisis científico se usan las capas `CWAVE`/`CBAND` del producto *Spectral WCS*. Muchos lectores FITS no reconocen `WCS-WAVE` automáticamente.

## 4. Cutouts (recortes) – lo que más usaremos
El **Cutout Service** de IRSA devuelve un subconjunto espacial del MEF con las **mismas HDUs**:
- `IMAGE`, `FLAGS`, `VARIANCE` y `ZODI` vienen recortadas.
- `WCS-WAVE` viene corregida para el recorte.
- `PSF` viene sin modificar (completa).

**Ventaja enorme:** en lugar de bajar 70 MB × 6 detectores por fecha, bajamos unos pocos KB por recorte alrededor del objeto. Es la **práctica recomendada** para nuestra app.

Convención de píxeles: el FITS usa índices desde 1 y Astropy desde 0. Para pasar del recorte a la imagen original:
```
xpix_orig = 1 + xpix_cutout - CRPIX1A
ypix_orig = 1 + ypix_cutout - CRPIX2A
```

## 5. All-Sky Cube (solo DR1) – nuevo y muy útil
- El cielo se divide en **12,288 mosaicos HEALPix** (orden 5, numeración NESTED) de ~1.8° × 1.8°.
- Cada mosaico es un cubo FITS de **512 × 512 px (12.9″/px) × 102 canales espectrales** (17 canales × 6 detectores).
- **Ya tiene restada la luz zodiacal.**
- Se ofrece también como **árbol HiPS de PNG** (un cuadro por canal), **solo para visualización**.
- Extensiones: `IMAGE`, `NHITS` (cuántos píxeles de entrada contribuyeron), `FLAGS`, `SPECTRAL_CHANNELS` (tabla de λ), `WCS-WAVE`.
- Nombre: `Npix[índice HEALPix]_cube.fits` (ej. `Npix4659_cube.fits`).

Problemas conocidos:
- Los canales **51 y 52 están vacíos** (junto al dicroico). Están listados en la cabecera `BLANKCH`.
- Las líneas de emisión atmosférica (sobre todo **He 1.083 µm** en la banda 1) crean **franjas**.
- Los PNG HiPS tienen estiramiento fijo de 0 a 40 MJy/sr, con poco rango dinámico. Para análisis se usan los FITS.
- La proyección HEALPix (HPX) se muestra mal en muchos visores, y los objetos pueden verse deformados.

**Atención:** el cubo **combina** las observaciones de los surveys 1-2. Sirve para **contexto espectral y para la imagen de fondo ("cielo estático")**. **No** sirve para ver cambios en el tiempo; para eso hacen falta las **Spectral Images individuales** con su fecha.

## 6. Productos de calibración / adicionales (referencia)
Solo hacen falta si queremos ir muy a fondo:
- **ePSF** (DR1/QR3): PSF efectiva por zona del detector (21×21 zonas; 11×41 en el detector 3), sobremuestreada ×5. **Reemplaza** a la PSF de QR2.
- **Spectral WCS**: `CWAVE` (λ central por píxel) y `CBAND` (ancho de banda), para ciencia.
- **Spectral Channels**: índice de canal (0-18) por píxel, usado para mosaicos.
- **Nonfunctional Pixels**: píxeles muertos (1 = malo).
- **Templates** de aurora (banda 1), He (bandas 1-2) y shuttle glow (banda 5): emisiones atmosféricas que **no** son astronómicas.
- **Crosstalk Parameters**: fantasmas y artefactos tipo raya. Importa porque **un fantasma puede parecer un objeto que "aparece"**.
- **Zodi Scaling**, **Absolute Gain**, **Dark**, **Read Noise**, **Nonlinearity**, **Solid Angle Pixel Map**, **SIP** (distorsión), **Dichroic**.

## 7. Conclusiones para el diseño de la app
1. **Fuente de datos para el cambio temporal:** Spectral Images individuales (DR1 + QR3) vía **cutouts** alrededor de la región o el objeto.
2. **Fondo estático y espectro de contexto:** All-Sky Cube (DR1) o su HiPS.
3. **Preprocesamiento obligatorio antes de comparar fechas:**
   - restar `ZODI`;
   - enmascarar con `FLAGS`;
   - tener en cuenta la λ de cada píxel (`WCS-WAVE`), sin comparar brillos de λ distintas.
4. **Movimiento antes que variabilidad:** es más robusto y más fácil de demostrar.
5. **Fuentes de falsos positivos a filtrar:** píxeles malos, rayos cósmicos, crosstalk/fantasmas, emisión atmosférica, cambio de λ por el LVF.
