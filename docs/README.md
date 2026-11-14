# Investigación técnica: SPHEREx Motion Finder (Naylamp Space)

Reto: **Planet X and SPHEREx**, NASA Space Apps 2026. Sede: Piura, Perú.
Entrega: **domingo 15-nov-2026, 11:59 p.m. hora local**, en inglés (demo: máximo 7 diapositivas o video de 30 s con subtítulos en inglés).

## 👉 ¿Primera vez aquí? Lee [00-EMPEZAR-AQUI.md](00-EMPEZAR-AQUI.md): idea en 30 s, orden de lectura, plan de un día, roles y checklist de entrega.

## Índice
| Doc | Contenido |
|---|---|
| [00-EMPEZAR-AQUI.md](00-EMPEZAR-AQUI.md) | **Guía de entrega al equipo.** Plan de un solo día, alcance, experimentos, roles, reglas, decisiones abiertas y checklist |
| [01-datos-spherex-productos.md](01-datos-spherex-productos.md) | Qué es SPHEREx, versiones de datos (usar DR1 + QR3), estructura de los FITS, la trampa del filtro LVF, All-Sky Cube |
| [02-acceso-a-datos.md](02-acceso-a-datos.md) | SIA2, TAP, cutouts, código Python oficial, banderas (FLAGS), rendimiento |
| [03-pipeline-procesamiento.md](03-pipeline-procesamiento.md) | Pipeline de 9 etapas: consulta → recortes → calibración → alineación → normalización → diferencias → cruce con objetos conocidos → exportación web |
| [04-objetos-moviles-y-antecedentes.md](04-objetos-moviles-y-antecedentes.md) | Backyard Worlds/WiseView (antecedente directo), MOST, SkyBoT, caso 3I/ATLAS, casos de demo, diferenciadores |
| [05-visualizacion-web.md](05-visualizacion-web.md) | HiPS de SPHEREx + Aladin Lite, visor flipbook, ciencia ciudadana, espectro |
| [06-diferenciador.md](06-diferenciador.md) | **Propuesta de diferenciador:** la animación arma el espectro del objeto que se mueve ("Míralo moverse. Descubre de qué está hecho.") |
| [07-investigacion-internacional-y-nuevas-ideas.md](07-investigacion-internacional-y-nuevas-ideas.md) | Corea (KASI), Japón (COIAS), China e investigación SPHEREx 2026 → idea "máquina del tiempo de 16 años" (WISE + SPHEREx) y concepto unificado "cámara que sintoniza colores" |
| [09-plan-maestro.md](09-plan-maestro.md) | 🎯 **Plan maestro (14-nov):** concepto "FOCUS: Time · Distance · Color". Shift-and-stack por paralaje para buscar Planet X + espectro de objetos en movimiento + cumplimiento total del enunciado, prioridades, cronograma y pitch |
| [10-innovacion-problema-real.md](10-innovacion-problema-real.md) | 🧠 **Núcleo del proyecto (14-nov):** el problema real (el LVF rompe la diferencia de imágenes; dominio temporal subexplotado) y 3 innovaciones: **resta espectral**, **multitud como detector calibrado** (inyecciones, mapa de exclusión), **cómputo en el navegador** |
| [11-datos-e-infraestructura.md](11-datos-e-infraestructura.md) | 🛠️ **Guía para el equipo:** volumen de datos, todo en Cloudflare (Pages, Workers, D1, R2) + GitHub Actions para el Python pesado, flujo, formato de mosaicos, base de datos, estructura del repo, cuentas a crear |
| [08-competencia-y-enunciado-oficial.md](08-competencia-y-enunciado-oficial.md) | ⚠️ **LEER PRIMERO.** Enunciado oficial completo (5 objetivos de prueba, consideraciones extra) + 9 MVPs de otros equipos ya avanzados. La "máquina del tiempo" ya existe; el espectro de objetos en movimiento sigue libre |

## Las 10 conclusiones clave
1. **Usar solo DR1 + QR3.** QR1 ya no existe y QR2 está reemplazado (no mezclar calibraciones). Excepción: 3I/ATLAS, cuya tabla oficial apunta a QR2.
2. **Nunca bajar FITS completos** (~70 MB × 6 detectores). Usar el **Cutout Service** (`?center=RA,DEC&size=GRADOS`).
3. **TAP es la mejor vía de consulta:** sin el retraso de 1 día de SIA, ordenada por tiempo y con la URL del recorte lista.
4. **Una posición tiene cientos de imágenes**, así que sobra material para series temporales.
5. **La trampa del LVF:** cada imagen ve el mismo punto en **otra λ**. Para **movimiento** no importa; para **variabilidad** solo se comparan λ iguales. Detectar movimiento es más robusto y lo priorizamos.
6. **Antes de comparar épocas:** restar `ZODI`, enmascarar con `FLAGS` (sin quitar `SOURCE`), alinear con `reproject` y aplicar **un mismo estiramiento** a todos los cuadros.
7. **Detección MVP:** plantilla mediana → diferencias → detección a 5σ → tracklets de 3 o más épocas.
8. **Etiquetar conocido vs. desconocido** con SkyBoT/MOST. Eso convierte el visor en una herramienta de ciencia ciudadana real.
9. **Precalcular los casos de la demo** (TAP tarda ~20 s y hay 5-20 % de descargas fallidas) y servirlos como WebP + JSON estáticos.
10. **Diferenciador frente a WiseView/Backyard Worlds:** SPHEREx tiene **102 colores**, así que podemos mostrar **de qué está hecho** lo que encontraste (hielo de agua, CO₂...).

## Preguntas abiertas (verificar el día 1, con datos reales)
- [ ] ¿Cuántas épocas con λ similar hay realmente por canal en un campo de la eclíptica? (doc 03 §2)
- [ ] Umbrales: % de píxeles malos para descartar un recorte, nivel σ de detección.
- [ ] ¿La lista de bits de máscara es correcta? Validarla contra la Tabla 16 del Explanatory Supplement.
- [ ] ¿Los `obs_id` de 3I/ATLAS (QR2) existen en DR1 vía TAP?
- [ ] ¿Aladin Lite v3 permite elegir el cuadro (λ) de un cubo HiPS? ¿El CORS funciona desde nuestro dominio?
- [ ] Parámetros exactos de `Most.query_object` para `catalog="spherex"`.
- [ ] Elegir el asteroide y la enana marrón de demo (que SPHEREx haya observado y que se muevan ≥1 px).

## Documentación oficial (leer si hay dudas)
- **SPHEREx Explanatory Supplement** (PDF): <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf>. Es la referencia definitiva: tabla de FLAGS (Tabla 16), mosaicos y calibración. *No lo leímos completo.*
- IRSA User Guide: <https://caltech-ipac.github.io/spherex-archive-documentation/>
- Notebooks oficiales: <https://caltech-ipac.github.io/irsa-tutorials/spherex>
- SPHEREx Data Explorer (GUI): <https://irsa.ipac.caltech.edu/applications/spherex>
- IRSA Helpdesk (preguntas): enlazado desde las páginas de IRSA.

## Agradecimiento obligatorio (copiar en la app y en la entrega)
> "This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration."

## Bitácora de investigación
| Fecha | Qué se hizo |
|---|---|
| 13-nov-2026 | Leídas las secciones Releases, Data Products y Data Access de la IRSA User Guide. Leídos los notebooks oficiales Intro, Cutouts y HiPS cube. Revisadas las páginas de 3I/ATLAS (y su tabla VOTable de 259 observaciones) y de MOST, y la doc de astroquery MOST. Verificadas las propiedades del HiPS de SPHEREx y su acceso entre dominios. Búsquedas sobre Backyard Worlds, SkyBoT, difference imaging (ZTF/ZOGY/TRANSLIENT), papers SPHEREx de sistema solar y enanas marrones. |
