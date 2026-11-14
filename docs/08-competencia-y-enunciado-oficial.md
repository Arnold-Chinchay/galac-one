# 08 · Competencia (MVPs de otros equipos) y enunciado oficial del reto

> Investigado el 13-nov-2026, la víspera del hackathon. **Es el documento más importante para decidir la estrategia.**

## 1. Enunciado oficial completo (lo que piden los jueces)
Fuente: <https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/>

**Objetivo:** herramienta web pública. El usuario **ingresa coordenadas (RA, Dec)** de una región y la herramienta muestra **una serie de imágenes de esa región "como un pequeño video"** para detectar objetos en movimiento.

**Objetivos de prueba oficiales (la herramienta DEBE funcionar con estos):**
| Objetivo | Tipo | Qué debería verse |
|---|---|---|
| **Barnard's Star** | Estrella de altísimo movimiento propio (~10″/año) | Movimiento claro |
| **Epsilon Indi B** | Par de enanas marrones que orbitan una estrella | Movimiento |
| **WISE 0855** (RA 08h55m10.831s, Dec −7°14′42.53″) | Enana marrón rápida (la más fría conocida) | Movimiento; casi solo visible a 3.8-4.4 µm |
| **RW Aurigae** | Estrella variable | Cambio de brillo |
| **R Draconis** | Estrella variable | Cambio de brillo |

**"Consideraciones potenciales"** (lo que da puntos extra):
1. Fácil de **actualizar con nuevas versiones de datos**, que llegan rápido.
2. Usar las **102 bandas** de forma creativa. Ej.: **sumar todos los datos de cada uno de los 6 detectores** para mejorar la señal/ruido. **"Extra kudos si tu herramienta genera espectros al vuelo."**
3. Opción de **sumar o restar** imágenes de distintos momentos.
4. Que el usuario **elija el campo de visión** (más grande sirve para objetos rápidos, pero tarda más).
5. **Superponer datos de otros telescopios** (**Gaia**, **WISE**).
6. **Consultas por URL** (coordenadas en la URL) para poder embeber la herramienta.
7. Mostrar **metadatos**, como las banderas de contaminación.
8. Usar herramientas existentes: **Astropy**, **Aladin** (CDS).

**Recursos oficiales (pestaña Resources):** IRSA SPHEREx, notebooks de IRSA, **WiseView** (`http://byw.tools/wiseview`, "úsenlo como modelo o inspiración"), **Gaia DR3**, y de la agencia canadiense (CSA): NEOSSat (asteroides/basura espacial), CADC, tutorial y dataset de NEOSSat.

## 2. Panorama competitivo: ya hay MVPs muy avanzados
Encontré **al menos 9 repositorios públicos** de equipos para este reto, varios trabajando desde **septiembre-octubre de 2026**.

| Repo | Origen | Qué hace | Nivel |
|---|---|---|---|
| [minhaz-42/spherex-explorer](https://github.com/minhaz-42/spherex-explorer) ([demo](https://spherex-explorer.vercel.app)) | Probablemente Bangladesh (interfaz en inglés y bangla) | Búsqueda por nombre o coordenadas; **línea de tiempo** QR2+QR3 con la **λ de cada cuadro**; blink, lado a lado y diferencia **solo si la λ coincide** (entiende el LVF); **espectro en el objetivo** y **curva de luz a λ fija**; posiciones de asteroides y cometas de JPL; búsqueda propia de objetos móviles; casos curados (ej. asteroide (7) Iris); **"a través de las décadas"** (placas Palomar 1950/1990 + 2MASS + AllWISE + SPHEREx); globo con la posición de SPHEREx; exporta GIF/video; juego "Spot the mover"; **tour de 90 s para jueces**; asistente IA con fuentes citadas; película de 4 min | **Muy alto**. El rival a vencer |
| [hd189b/SPHEREx-Open-Sky-Observatory](https://github.com/hd189b/SPHEREx-Open-Sky-Observatory) ([demo](http://hd189b.space/SPHEREx-Open-Sky-Observatory/)) | **Dhaka, Bangladesh** | "SPHEREx Time Machine": **2MASS (2000) → WISE (2010) → SPHEREx (2025-26)**; **mide** el movimiento propio y lo valida (Barnard: 272″ medido vs 273″ esperado; WISE 0855: 8.2-8.7″/año vs 8.2″/año); los 5 objetivos oficiales listos; 3I/ATLAS; blink, swipe y diferencia; links compartibles. **No soporta objetos del sistema solar.** Apache-2.0 | **Muy alto**, riguroso |
| [englszz/novax-space-data-lab](https://github.com/englszz/novax-space-data-lab) ([demo](https://novax-space-data-lab.vercel.app)) | Hispanohablante | Pipeline reproducible: ZODI, realineación, **compatibilidad de λ con WCS-WAVE**, DAOStarFinder a 8σ, **SkyBoT**, ePSF; 218 detecciones; recupera el asteroide 1994 WZ3; "no hay candidato a Planeta X" (honesto) | Alto en ciencia, interfaz simple |
| [lautaromoreyraa/spherex-blink](https://github.com/lautaromoreyraa/spherex-blink) | Hispanohablante (probablemente Argentina) | Visor WebGL (parpadeo, diferencia, apilado, rastro), Barnard y Makemake, objetos conocidos, procedencia, página "qué puede y qué no", ES/EN, contrato de datos con JSON Schema | Alto en ingeniería |
| [gitmahin/planetx-spherex](https://github.com/gitmahin/planetx-spherex) | — | Aladin Lite → TAP → comparar 2 fechas, detectar lo que se movió, trazar la ruta. MIT | Medio |
| [Razor573/spectralx](https://github.com/Razor573/spectralx) | — | Visor con blink y time-slider, diseño cuidado ("Liquid Glass") | Medio, más diseño que ciencia |
| [chowdhury-shovon/SPHEREx-Sky-Explorer](https://github.com/chowdhury-shovon/SPHEREx-Sky-Explorer) | — | Solo concepto | Bajo |
| its1paradox/SPHERExView, mekbuk/spaceapps | — | Aparecieron en la búsqueda (blink SPHEREx+WISE, espectros) pero hoy dan 404 | — |

### Lo que esto significa
1. **El blink/flipbook es un commodity:** todos lo tienen.
2. **Nuestra "máquina del tiempo de 16 años" (doc 07, Idea A) YA EXISTE:** hd189b (2000→2026) y minhaz (1950→2026). **Deja de ser diferenciador.**
3. **Entender el LVF** (comparar solo λ iguales) ya lo hacen minhaz y novax. Es lo mínimo esperado, no un diferenciador.
4. **Espectro en un punto fijo:** minhaz ya lo tiene.
5. **Lo que NO encontré en nadie:**
   - **espectro de un objeto EN MOVIMIENTO armado siguiendo su trayectoria** + **veredicto de composición** (rocoso / hidratado / cometa / enana marrón). hd189b excluye el sistema solar; minhaz muestra posiciones de JPL y espectros en puntos fijos, pero su README no menciona espectros a lo largo de la trayectoria **[verificar en su demo]**;
   - uso de **DR1** (publicado en nov-2026) y su **All-Sky Cube**: minhaz y hd189b usan QR2/QR3. "Fácil de actualizar a nuevas versiones" es una consideración oficial;
   - **sumar por detector** (coadd) para mejorar la S/N, sugerido explícitamente en el enunciado: nadie lo destaca **[verificar]**;
   - **superposición de Gaia** (sugerida): hd189b usa SIMBAD; minhaz usa SIMBAD/AllWISE. Gaia DR3 con **posiciones propagadas a la fecha** de cada cuadro no aparece **[verificar]**;
   - **ciencia ciudadana en español / Latinoamérica** con enfoque escolar: hay equipos hispanohablantes, pero sin enfoque educativo explícito.

## 3. Reglas: ¿se puede trabajar antes del hackathon?
- No encontré una regla explícita. La entrega exige marcar que el trabajo es **original** y declarar en *References* **todo** recurso externo (código, texto, imágenes).
- El espíritu del evento es construir durante el fin de semana (FAQ histórica de 2015).
- **Acción:** preguntar al Local Lead de Piura si se permite código previo. Si usamos librerías o código abierto de otros (ej. el Apache-2.0 de hd189b), **declararlo** en References.

## 4. Consecuencia estratégica (para decidir con el equipo)
Competir en "el mejor visor" contra minhaz o hd189b en 2 días es **muy difícil**: llevan semanas. Opciones:
- **(A) Especialista:** hacer **una cosa que nadie hace**, impecable: *"sigue al objeto que se mueve y descubre de qué está hecho"* (espectro a lo largo de la trayectoria + composición), cubriendo además lo mínimo del enunciado (coordenadas → video, los 5 objetivos de prueba, URL con coordenadas, banderas). Es la idea del doc 06, que **sigue libre**.
- **(B) Generalista mejor ejecutado:** competir en completitud. Riesgo alto de quedar por detrás.
- **(C) Ángulo de impacto local:** herramienta para colegios en español con misiones guiadas. Fuerte en Impact y Presentation, más débil en Creativity y Validity si va sola.

**Recomendación:** **(A) como núcleo + (C) como envoltura** (narrativa y público), cumpliendo el mínimo del enunciado. Usar **DR1** y **sumar por detector**, que son pedidos explícitos que los rivales no destacan.

## Fuentes
- [Página oficial del reto (Details y Resources)](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)
- [WiseView](http://byw.tools/wiseview), [Gaia (MAST)](https://archive.stsci.edu/missions-and-data/gaia)
- Repos listados en la tabla (consultados vía API de GitHub el 13-nov-2026)
- [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [FAQ 2015](https://2015.spaceappschallenge.org/about/faq), [Términos legales 2026](https://www.spaceappschallenge.org/legal/)
