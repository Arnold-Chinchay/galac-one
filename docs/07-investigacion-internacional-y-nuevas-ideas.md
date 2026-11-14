# 07 · Qué hacen otros países (Asia) y la investigación reciente → nuevas ideas

> Investigado el 13-nov-2026. Fuentes al final. **[verificar]** = falta confirmar con datos o docs.

## 1. Asia en SPHEREx
- **Corea (KASI):** socio oficial de la misión (aporta financiamiento, vía KASA) y tiene 2 instituciones en el equipo científico. **Hallazgo clave:** un equipo coreano (Minjin Kim, Woong-Seob Jeong y otros; arXiv:2604.05332, abr-2026) construyó un **catálogo de variables infrarrojas con NEOWISE** (3.4 y 4.6 µm) en los **polos eclípticos**, justo los campos profundos de SPHEREx:
  - 2,764 variables (polo norte) y 27,581 (polo sur); en el norte dominan los AGN y en el sur las estrellas (cerca de la Nube de Magallanes).
  - 3 transitorios infrarrojos, todos en cuásares oscurecidos.
  - **Lo dicen explícitamente:** con el esquema espectral de SPHEREx **es difícil identificar variables usando solo SPHEREx**, y por eso combinan con NEOWISE. **Eso es un hueco reconocido por investigadores.**
  - Otro trabajo con autores coreanos combina SPHEREx con el survey **7DS** (7-Dimensional Sky Survey) para mejorar redshifts de galaxias. Tendencia: **combinar SPHEREx con otros datos**.
- **Taiwán (ASIAA):** 1 institución en el equipo científico. Participa en el paper de calibración del instrumento (arXiv:2603.29835). No encontré resultados científicos públicos propios en 2026.

## 2. Japón: **COIAS**, el precedente asiático más relevante
- *Come On! Impacting ASteroids*: aplicación web de ciencia ciudadana (Univ. de Aizu + Telescopio Subaru) para **descubrir asteroides** en imágenes de archivo de Hyper Suprime-Cam.
- El usuario compara imágenes de distintos momentos, marca lo que se mueve, y la app hace **astrometría, fotometría y genera el reporte en formato del Minor Planet Center (MPC)**.
- Resultados: más de 1,000 ciudadanos, asteroides nuevos con crédito para COIAS (ej. **697402 Ao**) y un cometa (nov-2024). **Los participantes pueden proponer el nombre** de los asteroides que descubren.
- **Lección:** el gancho no es "ver la animación", es que **tu hallazgo entra al registro oficial y puede llevar tu nombre**.

## 3. China
- El National Astronomical Data Center (China-VO) tiene una **plataforma de ciencia ciudadana** con 6 proyectos que mezcla educación, descubrimiento e IA. En jul-2025 se celebró la 1.ª Cumbre de Ciencia Ciudadana en Astronomía (Dalian).
- Fuerte tradición amateur en descubrimiento de objetos (Observatorio Xingming). Hay trabajo estatal en alerta temprana de asteroides. No encontré uso de SPHEREx.

## 4. Investigación SPHEREx reciente (2026) relevante
| Tema | Trabajo | Relevancia para nosotros |
|---|---|---|
| Enanas marrones en movimiento | Gagné et al. (arXiv:2604.22012): 6,003 enanas, 947 nuevas, coautores de Backyard Worlds | El método ya es ciencia real; el público participa |
| Variables IR | Kim et al. (arXiv:2604.05332): SPHEREx solo no basta; NEOWISE sí | **Hueco que podemos llenar** |
| Hielos interestelares | Melnick et al. (arXiv:2603.22135); mapas de hielo de H₂O/CO₂ en Cygnus X (arXiv:2603.12390) | Espectros "de qué está hecho" |
| Cuásares ocultos | "Hidden Monsters with SPHEREx" (arXiv:2605.06791); 87 cuásares nuevos a z 4-5.7 | Fuera de nuestro alcance |
| Cometa 3I/ATLAS | Lisse et al. 2025-2026 | Caso de demo |
| Sistema solar | Catálogo SSOC (EPSC 2026): los espectros de objetos móviles son "un desafío" | Nuestro diferenciador del doc 06 |

## 5. Nuevas ideas que salen de esto

### Idea A · "Máquina del tiempo infrarroja de 16 años" (WISE 2010 → SPHEREx 2026)
> ⚠️ **Actualización 13-nov-2026:** esta idea **ya la implementaron** otros equipos (hd189b, Dhaka: 2MASS→WISE→SPHEREx; minhaz-42: 1950→2026). Ya no es diferenciador. Ver doc 08.
- **Problema real:** SPHEREx solo tiene ~2 años de datos. Una enana marrón típica se mueve menos de 1 píxel (6.15″) en ese tiempo, así que **en SPHEREx solo casi no se ve moverse**. Y para variables, el paper coreano dice que SPHEREx solo no basta.
- **La jugada:** WISE/NEOWISE observó el mismo cielo infrarrojo de **2010 a 2024**, a **3.4 µm (W1) y 4.6 µm (W2)**. Gracias al filtro LVF, **podemos elegir los cuadros de SPHEREx que vieron el objeto exactamente a 3.4 µm y a 4.6 µm** (dentro de las bandas 4 y 6). Así unimos ambas misiones **en el mismo color**.
- **Resultado:** un flipbook de **~16 años** (2010 → 2026). Las enanas marrones y los candidatos a "Planet X" que no se mueven en SPHEREx solo **sí se mueven varios píxeles** en 16 años.
- **Conexión directa** con Backyard Worlds/WiseView (que usa unWISE 2010-2020+): **extendemos WiseView con SPHEREx**. Para variables, añadimos los años SPHEREx a las curvas de luz de NEOWISE, justo lo que propone el paper coreano.
- **Riesgos [verificar]:** acceso a recortes de unWISE por época (WiseView los usa; servicio exacto por confirmar) o a imágenes NEOWISE individuales vía IRSA (MOST ya lista `wise_neowiser`); distinta resolución (WISE ~6″ PSF, parecida a SPHEREx: ventaja); calibraciones distintas (normalizar por estrellas de campo).

### Idea B · "Del clic al registro oficial" (estilo COIAS)
- El usuario marca un objeto móvil → la app genera su **astrometría** (RA/Dec por época) y un **borrador en formato MPC** → si no está en SkyBoT, el candidato pasa a revisión.
- Gancho de impacto: *"un estudiante de Piura puede descubrir un asteroide y proponer su nombre"*.
- **Riesgos [verificar]:** precisión astrométrica con píxeles de 6.15″ (el MPC exige buena precisión); si SPHEREx tiene código de observatorio del MPC; reglas de reportar desde datos de archivo de otra misión. **Para el hackathon:** generar el borrador y presentarlo como "trabajo futuro con validación profesional", sin prometer descubrimientos.

### Idea C · "Espectro desde la animación" (doc 06)
Sigue vigente: es lo único de SPHEREx para objetos móviles.

## 6. Síntesis propuesta: un solo concepto que une A + C
**"SPHEREx es una cámara que puede sintonizar cualquier color."** Gracias al LVF, cada píxel ve un color distinto. Nuestra herramienta **sintoniza** ese color de dos formas:
1. **Sintonizar el color de WISE → viajar 16 años en el tiempo** (Idea A): ver moverse lo que en 2 años no se mueve. Responde al reto "Planet X" con más fuerza que nadie.
2. **Barrer todos los colores → saber de qué está hecho** (Idea C): el espectro sale de la propia animación.

La Idea B queda como gancho de impacto y trabajo futuro en el pitch (con COIAS como precedente que demuestra que funciona).

**Por qué este concepto es más fuerte que el del doc 06 solo:**
- Ataca un **hueco documentado por investigadores** (paper coreano), no solo una idea nuestra.
- El "Planet X" del título del reto queda cubierto de lleno (enanas marrones lentas → 16 años).
- La narrativa es simple y memorable: *"sintonizamos SPHEREx para viajar en el tiempo y para ver de qué están hechas las cosas"*.

**Riesgo de alcance:** son dos modos. Prioridad sugerida: el modo que funcione primero con datos reales el día 1 es el núcleo; el otro queda como segundo acto de la demo.

## Fuentes
- [Kim et al. 2026 – MIR variables in the Ecliptic Poles (arXiv:2604.05332)](https://arxiv.org/abs/2604.05332)
- [SPHEREx + 7DS redshifts (A&A 2026)](https://www.aanda.org/articles/aa/full_html/2026/02/aa56999-25/aa56999-25.html)
- [The SPHEREx Satellite Mission (arXiv:2511.02985)](https://arxiv.org/pdf/2511.02985)
- [SPHEREx instrument calibration (arXiv:2603.29835)](https://arxiv.org/pdf/2603.29835)
- [COIAS – SciStarter](https://scistarter.org/coias-come-on-impacting-asteroids), [Subaru – noticias 2024](https://subarutelescope.org/en/news/topics/2024/05/09/3400.html), [697402 Ao](https://en.wikipedia.org/wiki/697402_Ao)
- [China citizen science summit 2025](https://www.chinaservicesinfo.com/s/202508/01/WS68a68dd4498e44f81033841f/1st-edition-of-citizen-science-summit-in-astronomy-held-in-dalian-ne-china_5.html), [NADC citizen science (EDULEARN 2025)](https://library.iated.org/view/LI2025AST)
- [SPHEREx Ices Investigation (arXiv:2603.22135)](https://arxiv.org/pdf/2603.22135), [mapas de hielo Cygnus X (arXiv:2603.12390)](https://arxiv.org/abs/2603.12390)
- [Hidden Monsters with SPHEREx I (arXiv:2605.06791)](https://arxiv.org/pdf/2605.06791)
- [Time-resolved WISE/NEOWISE coadds (arXiv:1710.02526)](https://arxiv.org/pdf/1710.02526), [unTimely catalog (arXiv:2209.14327)](https://arxiv.org/pdf/2209.14327), [WiseView (ASCL)](https://ui.adsabs.harvard.edu/abs/2018ascl.soft06004C)
