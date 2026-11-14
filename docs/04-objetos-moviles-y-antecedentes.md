# 04 · Objetos en movimiento, casos de demo y antecedentes

> Investigado el 13-nov-2026. Fuentes al final.

## 1. El antecedente directo del reto: *Backyard Worlds: Planet 9*
El nombre del reto ("**Planet X** and SPHEREx") remite a este proyecto de ciencia ciudadana (Zooniverse, desde 2017):
- Voluntarios buscan **enanas marrones** (y el hipotético Planeta 9) en datos infrarrojos de **WISE/NEOWISE**.
- Método: **"flipbooks"**, animaciones de recortes de *unWISE coadds* (3.4 y 4.6 µm) en distintas épocas, más **animaciones de imágenes de diferencia** para resaltar lo que se mueve.
- Un voluntario (Dan Caselden) creó **WiseView**, un visor web que junta recortes pequeños de terabytes de datos y los reproduce como película. Es exactamente el tipo de herramienta que pide el reto, ahora para SPHEREx.
- Resultados: la primera enana marrón se encontró **6 días** después del lanzamiento. En 2020 ya había ~1,700 descubrimientos, incluidas enanas Y muy frías.
- **Conexión con SPHEREx:** en abril 2026 se publicó un pipeline SPHEREx para enanas ultrafrías (Gagné et al., arXiv:2604.22012, librería **SPIFF**). Usa QR2 y presenta **6,003 enanas L0-Y1, 947 nuevas**, con **decenas de voluntarios de Backyard Worlds como coautores**.

**Qué aprendemos de esto:**
1. El formato flipbook + diferencia **funciona con público no experto**. Está probado.
2. Recortes pequeños precalculados = la clave para que sea rápido.
3. Los voluntarios **sí descubren cosas reales** y salen como coautores. Es un argumento de impacto muy fuerte para el pitch.
4. **Lo nuevo que aporta SPHEREx frente a WISE:** 102 colores (espectro), no solo 2 bandas. El usuario puede ver **de qué está hecho** el objeto que encontró (hielo de agua, CO₂, metano en enanas marrones). Este es nuestro diferenciador.

## 2. Herramientas de IRSA para objetos en movimiento
- **MOST** (Moving Object Search Tool), web y `astroquery.ipac.irsa.most.Most`:
  - Entrada: nombre (`name_input`), NAIF ID, elementos MPC de una línea o elementos orbitales manuales.
  - Usa **JPL Horizons** para las efemérides.
  - Catálogo `spherex` disponible (además de WISE/NEOWISE, ZTF, PTF, 2MASS, Spitzer...).
  - Salida "Regular": tabla con `mjd_obs`, `ra_obj`, `dec_obj` (posición predicha), `sun_dist`, `geo_dist`, `phase`, `vmag`, `image_url` y archivo de región DS9.
  - Sirve para **precovery**: ver si un objeto recién descubierto ya aparecía en imágenes antiguas.
  - Ejemplo (adaptado de la doc de astroquery; parámetros **[verificar]**):
    ```python
    from astroquery.ipac.irsa.most import Most
    res = Most.query_object(catalog="spherex", input_mode="name_input",
                            obj_name="Ceres", output_mode="Regular",
                            ephem_step=0.25,
                            obs_begin="2025-05-01", obs_end="2026-11-01")
    res["results"]   # imágenes con la posición predicha del objeto
    ```
- **SkyBoT** (IMCCE), vía `astroquery.imcce.Skybot`: todos los objetos conocidos del sistema solar en un campo y una época. Ideal para etiquetar "conocido / desconocido".
- **JPL Horizons** (`astroquery.jplhorizons`): efemérides precisas de un objeto.

## 3. Caso estrella: cometa interestelar **3I/ATLAS**
- SPHEREx lo observó en **agosto y diciembre de 2025**. IRSA tiene una página dedicada:
  <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html>
- **Tabla de observaciones (VOTable):** `https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/obscore_3I_Atlas.vot`
  - **259 filas** (imágenes), una por detector y exposición.
  - Columnas clave: `obs_id`, `spherex_detector`, `s_ra`/`s_dec` (centro de la imagen), **`comet_ra`/`comet_dec` (posición predicha del cometa en esa exposición)**, `t_min`/`t_max` (MJD), `t_exptime` (~113.6 s), `em_min`/`em_max`, `access_url` (enlace *datalink*), `target_moving=true`.
  - ⚠️ Las URLs apuntan a la colección **`spherex_qr2`**. QR2 sigue descargable **hasta feb-2027**, así que sirve para el hackathon. Para coherencia con DR1, se pueden buscar los mismos `obs_id` en DR1 vía TAP **[verificar]**.
- Hay **scripts de descarga** `wget`/`curl` con todas las imágenes completas (pesado; mejor usar recortes centrados en `comet_ra/comet_dec`).
- **Nota de calidad:** 3I/ATLAS tiene **baja señal/ruido en muchas λ** y está **extendido** (tiene coma), así que IRSA **no** recomienda su Spectrophotometry Tool (diseñada para fuentes puntuales).
- Ciencia publicada (para el pitch): SPHEREx detectó **absorción fuerte de hielo de agua** y una **coma extendida de CO₂**. En diciembre de 2025 vio mayor actividad post-perihelio y nuevas especies de gas (Lisse et al. 2025-2026).
- **Uso en la demo:**
  1. Recortes centrados en la posición predicha **o** en un campo fijo para ver al cometa cruzar.
  2. Superponer la posición predicha (círculo) para validar.
  3. Mostrar que el pipeline lo detecta solo.
  4. Cerrar con la historia de su composición.

## 4. Otros casos de demo (a preparar)
| Caso | Tipo | Cómo conseguirlo | Por qué |
|---|---|---|---|
| Asteroide brillante (ej. Ceres, Vesta, Pallas u otro del cinturón) | Movimiento rápido (horas-días) | MOST con `catalog="spherex"` | Movimiento obvio, valida el pipeline |
| Asteroide cercano a la Tierra (NEO) conocido | Movimiento muy rápido | MOST + Horizons | Narrativa de defensa planetaria |
| Enana marrón de alto movimiento propio (ej. de la lista SPIFF/Backyard Worlds) | Movimiento lento (meses-años) | Coordenadas del catálogo + 4 surveys | Conecta con "Planet X" y Backyard Worlds |
| Estrella variable en campo profundo (polo eclíptico) | Variabilidad | Colección `_deep`, misma λ | Muestra la otra cara del reto |
| Campo vacío (control) | Negativo | Cualquiera lejos de la eclíptica | Demuestra pocos falsos positivos |

> Movimiento propio típico de enanas marrones cercanas: de décimas de arcsec a varios arcsec por año. Con píxeles de 6.15″ y ~2 años de datos, **solo las más rápidas** se moverán ≥1 px. Hay que elegir con cuidado (las de mayor movimiento propio de la literatura). **[verificar valores concretos al elegir el caso]**

## 5. Retos técnicos específicos de objetos móviles en SPHEREx
- **Cada exposición ve al objeto en otra λ** (el objeto cae en otra parte del detector LVF). Su brillo "salta" entre cuadros aunque no varíe. Para movimiento no importa; para la curva de luz sí.
- **Exposición de ~114 s:** un NEO muy rápido puede verse **alargado**.
- **Píxel grande (6.15″) y PSF de ~7.5″ FWHM:** se pueden mezclar fuentes cercanas. Un asteroide que pasa junto a una estrella puede "fundirse" con ella.
- El equipo de SPHEREx (SSOC, *Solar System Object Catalog*) reconoce que extraer espectros de objetos móviles en un survey de escaneo es **un desafío de reducción de datos**. Mencionarlo en el pitch muestra que entendemos el problema.
- **Curvas de luz rotacionales** de asteroides (forma irregular) también cambian el brillo. Hay trabajos (ej. SOLO, arXiv:2602.08037) que corrigen esto con telescopios en tierra.

## 6. Ideas de "valor agregado" (diferenciadores)
1. **Etiquetado automático conocido/desconocido** (SkyBoT) en cada candidato.
2. **"Ver de qué está hecho":** al hacer clic en un objeto, mostrar su espectro (102 canales) con marcadores de bandas de hielo de agua (~3.0 µm), CO₂ (~4.27 µm), CO (~4.67 µm), PAH (3.3 µm) y metano (enanas T/Y). Útil incluso como espectro *quick-look* desde el All-Sky Cube (solo visualización).
3. **Modo "precovery":** el usuario escribe el nombre de un asteroide y la app lo encuentra en las imágenes de SPHEREx (MOST por detrás).
4. **Exportar GIF** del hallazgo para compartir. Difusión = impacto.
5. **Ciencia ciudadana local:** guía en español para colegios de Piura.

## Fuentes
- [Comet 3I/ATLAS – IRSA](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html)
- [MOST – IRSA](https://irsa.ipac.caltech.edu/applications/MOST/) y [astroquery MOST](https://astroquery.readthedocs.io/en/stable/ipac/irsa/most.html)
- [SkyBoT – IMCCE](https://ssp.imcce.fr/webservices/skybot/) y [astroquery.imcce](https://astroquery.readthedocs.io/en/stable/imcce/imcce.html)
- [Gagné et al. 2026 – SPHEREx pipeline for ultracool dwarfs (arXiv:2604.22012)](https://arxiv.org/abs/2604.22012v1)
- [Backyard Worlds (Wikipedia)](https://en.wikipedia.org/wiki/Backyard_Worlds), [Kuchner et al. 2017 – primera enana marrón](https://arxiv.org/abs/1705.02919), [WiseView en ASCL](https://ascl.net/1806.004)
- [Planetary Defense Use of the SPHEREx Solar System Object Catalog (arXiv:2402.08705)](https://web3.arxiv.org/pdf/2402.08705)
- [EPSC 2026 – SPHEREx SSOC abstract](https://meetingorganizer.copernicus.org/EPSC2026/EPSC2026-797.html)
- [SOLO – curvas de luz para SPHEREx (arXiv:2602.08037)](https://arxiv.org/abs/2602.08037)
- [NEOFIT – Space Apps 2016](https://2016.spaceappschallenge.org/challenges/solar-system/near-earth-objects-machine-learning/projects/neofit-near-earth-object-finding-and-inspection-tool)
- [TRANSLIENT (arXiv:2403.09771)](https://arxiv.org/pdf/2403.09771), [ZTF Data Processing (arXiv:1902.01872)](https://arxiv.org/pdf/1902.01872)
