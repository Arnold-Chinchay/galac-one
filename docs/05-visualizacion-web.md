# 05 · Visualización web de los datos

> Investigado el 13-nov-2026. Lo marcado **[verificar]** hay que probarlo el día 1.

## 1. Dos capas visuales
| Capa | Qué muestra | Fuente | Tecnología |
|---|---|---|---|
| **Mapa del cielo (contexto)** | Todo el cielo navegable, para elegir dónde mirar | HiPS de SPHEREx DR1 (o 2MASS/DSS) | **Aladin Lite v3** |
| **Visor temporal (el corazón)** | Animación blink/flipbook de una región + diferencias + candidatos | Nuestros cuadros precalculados (doc 03 §9) | `<canvas>` propio en React |

## 2. HiPS de SPHEREx (verificado)
- URL de servicio: `https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`
- Propiedades leídas el 13-nov-2026 (`/properties`):
  - `hips_frame = equatorial`, `hips_order = 5` (máximo), `hips_tile_width = 512`, `hips_tile_format = png`
  - `hips_cube_depth = 102` (cubo: un cuadro por canal), `hips_cube_firstframe = 1`
  - `hips_pixel_cut = 0 40` (MJy/sr), `hips_pixel_function = asinh`
  - `data_cube_crval3_arr`: λ de cada cuadro (0.753, 0.771, ... µm)
  - Índice de cuadro = `17*(banda-1) + (canal-1)`. **Cuadros 50 y 51 vacíos** (dicroico).
- La petición desde **otro dominio funcionó** (status 200 desde un navegador en arxiv.org), así que el **CORS parece permitido** **[confirmar desde nuestro dominio]**.
- Es **solo para visualización** (rango dinámico fijo). Es una mezcla de los surveys 1-2, así que **no** muestra cambios temporales.
- Aladin Lite v3 carga HiPS personalizados con `aladin.newImageSurvey(url)` + `setImageLayer`. El soporte de **cubos HiPS** (elegir el cuadro/λ) en Aladin Lite **no está confirmado** en su documentación pública **[verificar]**. Alternativas:
  1. Si no soporta cubos, mostrar el cuadro por defecto o usar otro HiPS (2MASS, AllWISE) como fondo.
  2. El visor **Firefly** de IRSA sí soporta el cubo (lo usan los notebooks oficiales), pero es más pesado para embeber.

```html
<!-- Aladin Lite v3 (CDN oficial de CDS) [verificar URL y versión al instalar] -->
<script src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js" charset="utf-8"></script>
<div id="aladin" style="width:100%;height:400px"></div>
<script>
  A.init.then(() => {
    const aladin = A.aladin('#aladin', { fov: 5, target: '252.66 -17.49' });
    const spherex = aladin.newImageSurvey(
      'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube');
    aladin.setImageLayer(spherex);
    // clic en el mapa → elegir región → cargar caso precalculado o pedirlo al backend
  });
</script>
```
(Para producción, fijar una versión exacta en lugar de `latest`.)

## 3. Visor temporal (flipbook): buenas prácticas
Inspirado en WiseView (Backyard Worlds), adaptado a SPHEREx:
- **Precarga** de todos los cuadros del caso (`new Image()` + `decode()`) antes de reproducir. Así no hay parpadeos por carga.
- Dibujo en `<canvas>` con `imageSmoothingEnabled = false` y escala entera (×4, ×6, ×8). Los píxeles grandes se ven nítidos, no borrosos, y eso es honesto con los datos.
- **Controles mínimos:** play/pausa, velocidad (1-10 fps), cuadro anterior/siguiente, deslizador de tiempo, **modo blink** (alternar 2 épocas), **modo diferencia** y zoom.
- **Contraste:** el estiramiento viene fijo del pipeline. Opcionalmente un control de brillo/contraste en CSS (`filter`) que no altera los datos.
- **Superposiciones (overlays) en un segundo canvas:**
  - círculos en los candidatos detectados (color según conocido/desconocido);
  - trayectoria (tracklet) como línea punteada;
  - posición predicha (para 3I/ATLAS u objetos de MOST);
  - norte/este y barra de escala en arcmin.
- **Etiqueta por cuadro:** fecha UTC, detector y λ central. **Mostrar la λ** educa sobre el LVF y evita confusiones.
- **Accesibilidad:** controles con teclado (espacio = play, ←/→ = cuadro), contraste AA, textos en español con inglés opcional (la entrega va en inglés).
- **Móvil:** el canvas se ajusta al ancho y los controles grandes. Muchos usuarios (colegios) usarán el teléfono.

## 4. Interacción de ciencia ciudadana
- El usuario hace clic en algo que se mueve → se registra la marca (x, y, cuadro) → se compara con las detecciones del pipeline y con SkyBoT → feedback inmediato: "¡Encontraste al asteroide (1234) X!" o "Candidato no catalogado: guardado para revisión".
- Para el hackathon basta con guardar las marcas en `localStorage` o en un JSON. Un backend real (votos de varios usuarios, consenso tipo Zooniverse) va en "trabajo futuro".

## 5. Espectro (diferenciador)
- Gráfico simple (Recharts, Chart.js u Observable Plot) de flujo vs λ (0.75-5 µm) con bandas marcadas: H₂O ~3.0 µm, PAH 3.3 µm, CO₂ ~4.27 µm, CO ~4.67 µm.
- Fuente: fotometría *quick-look* del All-Sky Cube en el punto (notebook HiPS de IRSA, solo visualización) o el Spectrophotometry Tool de IRSA para fuentes puntuales. **No usar para cometas extendidos.**

## 6. Arquitectura recomendada del frontend
- **Vite + React + TypeScript**, sitio estático (Vercel, Netlify o GitHub Pages).
- `public/cases/<id>/...`: assets del pipeline (sin backend para la demo).
- Backend opcional (FastAPI) solo para el modo "explora cualquier punto del cielo" (consulta TAP + recortes bajo demanda, con cache).
- Créditos visibles: *"This publication makes use of data products from SPHEREx... funded by NASA"* (texto oficial de IRSA, obligatorio).

## Fuentes
- [HiPS All-Sky Cube notebook (IRSA)](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/)
- [Aladin Lite v3 API](https://aladin.cds.unistra.fr/AladinLite/doc/API)
- [Backyard Worlds / WiseView](https://en.wikipedia.org/wiki/Backyard_Worlds)
- [IRSA – SPHEREx (agradecimiento oficial)](https://irsa.ipac.caltech.edu/Missions/spherex.html)
