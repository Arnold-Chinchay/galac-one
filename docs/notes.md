# Notas técnicas

Estado a 14-nov-2026. Lo marcado **[sin probar]** no está verificado.

## Datos
- **Índice propio.** El TAP, SIA y datalink de IRSA devolvieron 502 el 14-nov (incluso con el código exacto de su tutorial). Las imágenes están completas en el bucket público `s3://nasa-irsa-spherex` (acceso anónimo, `dr1/`, `qr3/`, `qr2/`), sin índice espacial. `pipeline/s3index.py` lee solo los primeros 31 KB de cada FITS y guarda huella, tiempo y detector. El workflow `build-index` lo publica como releases `index-dr1` (1.18 M imágenes) e `index-qr3` (0.45 M), y corre cada lunes para sumar semanas nuevas de QR3. Validado: para la posición del tutorial oficial devuelve las mismas 443 imágenes.
- Las URL de cutout son `https://irsa.ipac.caltech.edu/ibe/data/spherex/` + la clave S3, con `?center=RA,DEC deg&size=… deg`.
- **Cutouts:** 4 MB cada uno (la tabla EPSF son 3.8 MB y no se puede excluir), 7-12 s, sin CORS (descargar solo desde servidor o Actions), siempre 503 ocasionales con 8 descargas en paralelo (se reintenta). Tras reducir quedan ~48 KB por cuadro.
- Cada cuadro trae `IMAGE` (MJy/sr, incluye zodi), `FLAGS`, `VARIANCE`, `ZODI`, `WCS-WAVE` (rejilla 9×9 de λ por píxel). El tiempo es `MJD-AVG`. `DATE` es la fecha de procesamiento.
- **FLAGS** a enmascarar (bits 0,1,2,6,7,9,10,11,14,15,17,19,20,22-28), validados contra las definiciones `MSKN/MSKD` del archivo. No se enmascara `SOURCE` (21).
- Las coordenadas oficiales de WISE 0855 y Barnard son de 2000-2010: hay que centrar en la posición a la época de observación (Barnard ~44 px, WISE 0855 ~20 px).

## Resta espectral (`pipeline/spectral_sub.py`)
Para cada píxel se ajusta un espectro estático (base lineal por tramos en log λ, 24 nodos, penalización de suavidad) con todos los cuadros, con recorte robusto a 4σ y ruido separado en píxel × cuadro. Se resta en la λ de cada cuadro.
- **Ganancia por cuadro** (`fit_with_gain`): cuadros del mismo detector y casi la misma λ diferían 24 % en las estrellas brillantes (9 % a menos de 15 días, 46 % a más de 60), con el mismo factor en todas las estrellas: escala global por cuadro. Se estima con las estrellas brillantes y se ajusta junto al modelo (la media de cada detector no se ajusta). Sintético con ganancias 0.6-1.6: ×3.4 → ×52. R Draconis real: diferencia entre cuadros de igual λ 46 % → 10 %.
- **Cuadros rotos** (ruido 6-25× el de su detector, λ ≈ 1.1 µm en D1/D2): se descartan solos. Se resta el fondo mediano de cada cuadro.
- **Inyección de variables en datos reales** (R Draconis): con ganancia se recupera 57-71 % de la amplitud (sin ganancia 78-97 %). La amplitud queda subestimada 30-40 %, así que se calibra con inyecciones. En la estrella más brillante, una variación del ±20 % pasa de invisible (S/N 0.46) a visible (S/N > 100).
- **Resultado en estrellas** (rms entre cuadros, solo píxeles de estrellas): ×4.5 de 1 a 8 MJy/sr, ×2.1 sobre 8 MJy/sr; el residuo queda en 12-14 % del flujo (27 % en las más brillantes). Sintético: ×55. La suma en 3×3 (`--box 3`) no ayudó.
- **[sin probar]** Una variable que domine todo el campo podría ser absorbida por la ganancia. El origen físico de la ganancia (calibración, apuntado o variabilidad) no está claro: no sigue limpiamente DR1 contra QR3.

## Resultados con los objetivos oficiales
Datos leídos directo desde S3 en GitHub Actions (`build-tile`, ~2 min por campo; desde IRSA eran ~40 min). `s3cutout.py` es idéntico píxel a píxel al cutout de IRSA (FLAGS viene comprimida con RICE por filas).
| Objetivo | Resultado solo con SPHEREx | Referencia |
|---|---|---|
| Barnard (saturada; centroide en las alas, `--box 6`) | 10.10 ± 0.12 ″/año | Gaia 10.39 (−2.9 %, dirección 0.3°) |
| Epsilon Indi B (> 2.4 µm) | 4.70 ± 0.06 ″/año | Gaia 4.68 (+0.4 %, dirección 0.6°) |
| R Draconis (saturada 6 px; halo 7-10 px) | periodo 238 d, ~1.1 mag, 260 cuadros | ~245 d en GCVS **[sin verificar: CDS caído]** |
| RW Aurigae (anillo 2-5 px) | ~1 mag de variación, 316 cuadros; sin periodo claro | T Tauri, irregular |
| WISE 0855 (`redsearch.py`, campo de 0.2°) | **detectada a ciegas**: la única de 19 fuentes rojas con espectro tipo Y (0 en 2.5-3.5 µm, 11.6σ a 4.0-4.7 µm) y la única que se mueve: (−10.4, +1.3) ± 1.3 ″/año, p = 0.024 contra divisiones al azar. Tiene una estrella azul de fondo encima | ~(−8.1, +0.7) ″/año **[de memoria, sin verificar; paralaje 0.45″ sin corregir]** |

Las estrellas brillantes saturan: hay que usar alas o halo. La astrometría de Gaia está en `pipeline/targets.py` (WISE 0855 no está en Gaia; su movimiento propio es aproximado).

## Imágenes profundas y más cielo (`deep.py`, workflow `build-deep`)
- Campos de 0.4° (24′, 33× el área del mosaico de 4′) leídos de S3 en GitHub Actions. Cada exposición se alinea, se escala con una ganancia por cuadro contra la mediana del campo y se combina por banda (azul 0.7-1.6, verde 1.6-3, rojo 3-5 µm) con recorte a 3σ. Ruido medido con dos mitades independientes.
- Ruido frente a una sola exposición: ×6-10 en Barnard, Epsilon Indi B, RW Aurigae y WISE 0855 (75-154 cuadros por banda); ×16-28 en R Draconis (2 080 cuadros).
- **Drizzle 2×** (paquete `drizzle`, pixfrac 0.6, píxeles de 3.08″): en Barnard, 127-174 estrellas por banda pasan de ~12″ a ~7.6″ de FWHM (32-36 % más finas) frente a nuestra versión nativa; el ruido por píxel fino queda ×2-5 bajo una exposición. Es la imagen que muestra la web.
- Núcleos saturados se rellenan con el borde más brillante solo para el PNG; el FITS (`deep_lum.fits`, suma de bandas en unidades de σ) y los `deep_*.f16.bin` no se tocan.
- **Mapa de todo el cielo:** HiPS DR1 de IRSA (`irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`, PNG 512 px, CORS abierto, ~12.9″/píxel) mostrado con Aladin Lite 3.9.2 (npm, carga diferida). No usar su capa por defecto: viene de CDS.

## Detección y mosaicos (`detect.py`, `make_tile.py`)
- Picos del filtro 3×3 sobre el z-score (umbral 6, se ignoran píxeles con σ > 2× la mediana). Móviles: líneas rectas ajustadas por mínimos cuadrados (≥ 5 cuadros). Estáticos: grupos en el mismo píxel (≥ 4 cuadros, máx. 15).
- `make_tile` inyecta 6 móviles sintéticos y agrega 4 **controles en cielo vacío** (sin nada inyectado). Recuperó 27 de 30 inyecciones en los 5 campos.
- **Completitud** (`completeness.py`, R Draconis, 48 inyecciones): 43 % a S/N 5-7 por cuadro, 82-90 % por encima de 7. Hay ~7 móviles falsos por campo.
- **Confiabilidad del usuario** = aciertos en inyecciones (`moving`) y en controles (no `moving`), suavizada (+1/+2). Probado en vivo: quien marca todo `moving` saca 0.58; quien acierta, 0.92.
- **No filtrar la verdad de las inyecciones:** sin `score` ni `kind_hint`, ids aleatorios, lista ordenada por id, trayectorias con posiciones enteras como las del detector. El SQL con la verdad (`tools/real_*.sql`) está en `.gitignore` y nunca se sube.
- Publicar un mosaico: `python -m pipeline.make_tile --name X`, subir los 5 archivos de `cache/tiles/X/export/` a `naylamp-tiles/tiles/X/` con `npx wrangler r2 object put … --remote`, y `npx wrangler d1 execute naylamp-db --remote --yes --file tools/real_X_seed.sql`.

## Infraestructura (todo gratis, Cloudflare + GitHub Actions)
- Worker con web estática, API, D1 y R2. Límites del plan gratis: 100 000 peticiones/día y 10 ms de CPU por petición, D1 5 M lecturas y 100 000 escrituras/día (500 MB por base), R2 10 GB y salida gratis. Por eso los votos van en lotes y el cálculo pesado corre en GitHub Actions o en la laptop.
- Hugging Face Docker Spaces ya no es gratis; Render free se duerme a los 15 min y tiene 0.1 CPU.
- D1 `naylamp-db` (tablas en `migrations/`), R2 `naylamp-tiles`.

## Pendiente
- Verificar el movimiento propio de WISE 0855 con CatWISE cuando IRSA TAP funcione; corregir su paralaje.
- Medir completitud con más inyecciones y más campos; interfaz de front.
