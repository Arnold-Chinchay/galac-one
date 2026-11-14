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

## Detección y mosaicos (`detect.py`, `make_tile.py`)
- Picos del filtro 3×3 sobre el z-score (umbral 6, se ignoran píxeles con σ > 2× la mediana). Móviles: líneas rectas ajustadas por mínimos cuadrados (≥ 5 cuadros). Estáticos: grupos en el mismo píxel (≥ 4 cuadros, máx. 15).
- `make_tile` inyecta objetos móviles sintéticos antes del ajuste. En R Draconis recuperó **6 de 6** (solo un campo y 6 objetos: no es una curva de completitud).
- **No filtrar la verdad de las inyecciones:** sin `score` ni `kind_hint`, ids aleatorios, lista ordenada por id, trayectorias con posiciones enteras como las del detector. El SQL con la verdad (`tools/real_*.sql`) está en `.gitignore` y nunca se sube.
- Publicar un mosaico: `python -m pipeline.make_tile --name X`, subir los 5 archivos de `cache/tiles/X/export/` a `naylamp-tiles/tiles/X/` con `npx wrangler r2 object put … --remote`, y `npx wrangler d1 execute naylamp-db --remote --yes --file tools/real_X_seed.sql`.

## Infraestructura (todo gratis, Cloudflare + GitHub Actions)
- Worker con web estática, API, D1 y R2. Límites del plan gratis: 100 000 peticiones/día y 10 ms de CPU por petición, D1 5 M lecturas y 100 000 escrituras/día (500 MB por base), R2 10 GB y salida gratis. Por eso los votos van en lotes y el cálculo pesado corre en GitHub Actions o en la laptop.
- Hugging Face Docker Spaces ya no es gratis; Render free se duerme a los 15 min y tiene 0.1 CPU.
- D1 `naylamp-db` (tablas en `migrations/`), R2 `naylamp-tiles`.

## Pendiente
- WISE 0855 sin encontrar (campo casi vacío; probar buscar una fuente muy roja, D6/D1 alto, cerca de la posición con movimiento propio **[sin verificar]**).
- Mosaicos de Barnard, Epsilon Indi y RW Aur; curva de luz de R Draconis.
- Medir completitud con más inyecciones y más campos; interfaz de front.
