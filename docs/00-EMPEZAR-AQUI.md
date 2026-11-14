# 00 · EMPEZAR AQUÍ (léelo primero, 10 minutos)

> Guía de entrega al equipo **Naylamp Space**. Escrita el 14-nov-2026.
> **Entrega: domingo 15-nov-2026, 23:59 (hora Perú), todo en inglés.** Hay que entregar: demo de **máximo 7 diapositivas o un video de 30 s con subtítulos en inglés** + el proyecto desplegado.
> **[verificar]** = hay que confirmarlo con datos reales antes de depender de ello.

---

## 1. La idea en 30 segundos
**Reto:** *Planet X and SPHEREx* (NASA Space Apps 2026). Hacer una herramienta web pública que muestre imágenes del telescopio SPHEREx a lo largo del tiempo, para detectar objetos que se mueven o cambian.

**El problema real:** SPHEREx ve el cielo en 102 colores, pero **cada imagen ve cada punto en un color distinto**. Por eso la técnica normal (restar dos imágenes) deja residuos enormes de todas las estrellas. Los demás equipos lo esquivan comparando solo imágenes del mismo color, y así descartan casi todo. Investigadores coreanos (Kim et al. 2026) lo reconocen como un hueco.

**Nuestra solución, en tres piezas** (detalle en el doc 10):
1. **Resta espectral:** restamos lo que cada píxel *debería* verse en el color exacto de cada cuadro (según una curva de su propio espectro). Queda solo lo que cambió, usando **todos** los cuadros.
2. **La multitud como detector calibrado:** los usuarios clasifican candidatos (se mueve / varía / artefacto). El sistema mete **objetos falsos ocultos** para medir qué tan confiable es cada persona y qué tan completa es la búsqueda. El resultado incluye un **mapa de dónde NO está el Planeta X**.
3. **Cómputo en el navegador:** lo pesado de cada usuario corre en su navegador. El servidor casi no calcula, así que cuesta $0.

**Además** (obligatorio por el enunciado): una vista experta con flipbook, FOV, URL con coordenadas, banderas, Gaia, etc. (doc 09 §4). Las "perillas" de Distancia y Color (doc 09) caracterizan a los candidatos si da tiempo.

---

## 2. Orden de lectura (30-40 min en total)
| # | Documento | Qué sacan de él | Tiempo |
|---|---|---|---|
| 1 | **Este** | Qué hacer y cuándo | 10 min |
| 2 | [10-innovacion-problema-real.md](10-innovacion-problema-real.md) | La idea completa y los experimentos del arranque | 10 min |
| 3 | [11-datos-e-infraestructura.md](11-datos-e-infraestructura.md) | Cloudflare, formato de datos, base de datos, repo | 10 min |
| 4 | [08-competencia-y-enunciado-oficial.md](08-competencia-y-enunciado-oficial.md) §1-2 | Qué piden los jueces y qué tienen los rivales | 5 min |
| Después, según rol | 01-03 (Python), 05 (Web), 09 §3-4 y §10 (diseño/pitch) | Detalle técnico | — |

Los docs 06 y 07 son historia de cómo llegamos aquí. Si algo choca con el 10 o el 11, **manda el 10 y el 11**.

---

## 3. ⏰ Plan de UN solo día (empezamos el domingo, entregamos a las 23:59)
> El cronograma del doc 09 §9 contaba sábado y domingo. **Está reemplazado por este.** Son 6 bloques; adapten las horas al momento en que arranquen, pero **respeten el orden y los dos "congelar"**.

| Bloque | Duración | Objetivo | Congelar |
|---|---|---|---|
| **A. Arranque** | 1 h | Cuentas, repo, esqueleto desplegado, experimentos go/no-go lanzados | |
| **B. Experimentos** | 2 h | Resultados de los experimentos §5 → decidir el alcance (§4) | |
| **C. Construcción P0** | 4-5 h | Vista experta + resta espectral en los campos de la demo + clasificación con votos | |
| **D. Pulido y validación** | 2 h | Números reales de validación, móvil, textos en inglés | 🔒 **Congelar funciones 5 h antes de la entrega** |
| **E. Entrega** | 3 h | Diapositivas/video, README, agradecimientos, referencias, **enviar con 2 h de margen** | 🚀 **Enviar a las 21:30, no a las 23:50** |

**Regla de oro:** algo desplegado y simple a las 21:30 vale más que algo ambicioso a medio hacer.

---

## 4. Alcance realista en un día (decidir en el bloque B)
| Prioridad | Qué entra | Si falla |
|---|---|---|
| **P0 (imprescindible)** | Vista experta: coordenadas → flipbook, **los 5 objetivos oficiales**, FOV, URL con parámetros, FLAGS, Gaia · **resta espectral** en 3-5 campos precalculados · pantalla de clasificación que **guarda votos** en D1 | Sin esto no hay proyecto |
| **P1 (lo que gana)** | **Inyecciones** + confiabilidad por usuario + curva de completitud · validación con R Draconis vs. AAVSO | Se presenta como diseño ("next step") |
| **P2 (si sobra)** | Distancia por paralaje (Plutón) · espectro del objeto · mapa de exclusión en vivo · "pedir campo nuevo" | Solo en el pitch |
| **P3 (no tocar hoy)** | Sonificación · borrador MPC · NEATM · redundancia entre navegadores | Diapositiva final de trabajo futuro |

**Plan B si la resta espectral no funciona** (experimento 1): usamos la comparación "solo λ iguales" como base. Las innovaciones 2 y 3 (multitud calibrada + cómputo en el navegador) **siguen en pie** y siguen siendo diferenciales.

---

## 5. Experimentos del arranque (go/no-go)
| # | Experimento | Quién | Criterio de éxito | Si falla |
|---|---|---|---|---|
| 1 | **Resta espectral** en un campo de ~0.25° con ~100 cuadros: ¿desaparecen las estrellas? | Python | Residuos ≈ ruido, sin estructura de estrellas | Plan B de arriba |
| 2 | ¿Un asteroide o enana marrón conocidos aparecen limpios en los residuos? | Python | Aparecen a ≤1 px de la efeméride | Validar con 3I/ATLAS o los 5 objetivos |
| 3 | **Cuántos cuadros hay por campo en DR1** (TAP) y si el Cutout Service tiene CORS | Python/API | ≥ 50 cuadros; CORS sí o no | Ajustar tamaño de mosaico; pasar por Worker |
| 4 | Esqueleto: Pages + Worker + D1 + R2 con 1 mosaico de prueba servido y 1 voto guardado | Web + API | Todo en una URL pública | Plan B de R2 (doc 11 §11) |

Los 4 son independientes: **se lanzan a la vez** en el bloque A.

---

## 6. Roles y primeras tareas
| Rol | Responsable | Primeras tareas | Lee |
|---|---|---|---|
| **Python / datos** | _(nombre)_ | Experimentos 1-3 · `pipeline/` (query, cutouts, align, spectral_sub, export_tile) · primer mosaico subido a R2 | 01, 02, 03, 10 §2.1, 11 §6 |
| **Web (React)** | _(nombre)_ | Esqueleto en Pages · vista experta (flipbook, FLAGS, Gaia, URL) · pantalla de clasificación (celular primero) | 05, 08 §1, 09 §3.1, 11 §6 |
| **API / infraestructura** | _(nombre)_ | Cuenta Cloudflare · R2 + D1 + Worker · endpoints y migraciones · secretos en GitHub Actions | 11 completo |
| **Diseño / pitch** | _(nombre)_ | Marca y nombre · diseño de la interfaz · guion del video · diapositivas en inglés · README | 09 §10, 10 §8, 08 §1 |

*(Llenen los nombres hoy. Si son 4, el responsable de API apoya a Python en el bloque C.)*

---

## 7. Reglas del equipo
1. **Nadie sube claves al código.** Usar `.env` local (en `.gitignore`) y secretos en GitHub Actions y Workers.
2. **Commits chicos y frecuentes**, en ramas cortas; la rama `main` siempre despliega.
3. **Cada quien documenta lo que descubra** en `docs/` (una línea en la bitácora del README basta).
4. **Declarar TODO recurso externo** en *References* de la entrega: código, librerías, imágenes, textos. La entrega exige marcar que el trabajo es original.
5. **Agradecimiento obligatorio** (copiar en la app y en la entrega):
   > "This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration."
6. **No inflar resultados.** "No encontramos candidatos" es un resultado válido. Mostrar barras de error y confianza.
7. **Pregunta pendiente para el Local Lead de Piura:** ¿se permite código previo? (No usamos código de otros equipos; si usamos código abierto, lo declaramos.)

---

## 8. Decisiones abiertas (resolver hoy o en el bloque A)
- [ ] **Nombre del proyecto** (propuesta: *FOCUS*, "Time · Distance · Color", o uno que incluya Naylamp).
- [ ] **¿Quién crea la cuenta de Cloudflare y confirma si R2 pide tarjeta?** Si la piden: plan B de archivos estáticos en Pages.
- [ ] **Qué 5-10 campos se precalculan para la demo:** los 5 objetivos oficiales + 3I/ATLAS + 1-2 campos de control.
- [ ] **Quién presenta/graba el video** y en qué idioma habla (subtítulos en inglés).
- [ ] **El equipo aprueba el concepto del doc 10** (se marcó "pendiente de aprobación").

---

## 9. Checklist de entrega (usar a las 18:00 y a las 21:00)
- [ ] URL pública funcionando, probada **en celular y en una ventana privada**
- [ ] Los 5 objetivos oficiales cargan por URL con coordenadas
- [ ] Agradecimiento NASA/SPHEREx visible en la app
- [ ] Demo de 7 diapositivas **o** video de 30 s con subtítulos en inglés
- [ ] Todo el texto de entrega en inglés
- [ ] README del repo en inglés, con cómo correr y cómo se validó
- [ ] Sección *References* completa
- [ ] Repo público, sin claves
- [ ] Enviado con **2 horas de margen**

---

## 10. Glosario mínimo
| Término | Significa |
|---|---|
| **SPHEREx** | Telescopio espacial infrarrojo de la NASA que mapea todo el cielo en 102 colores (0.75-5 µm) |
| **LVF** | El filtro de SPHEREx: cada punto de la imagen ve un color distinto. Es la "trampa" y también nuestra oportunidad |
| **λ (lambda)** | Longitud de onda = el color de cada cuadro |
| **DR1 / QR3** | Versiones de datos de SPHEREx que usamos (no mezclar con QR1/QR2) |
| **IRSA / TAP / Cutout** | El archivo de datos de NASA, su lenguaje de consultas y su servicio de recortes (nunca bajar FITS completos) |
| **FLAGS / ZODI** | Máscara de píxeles malos / luz zodiacal de fondo (se restan o enmascaran antes de comparar) |
| **Flipbook / blink** | Animación de cuadros para ver lo que se mueve |
| **Inyección** | Objeto falso que metemos en los datos para medir qué tan bien se detecta |
| **Shift-and-stack** | Desplazar y sumar imágenes siguiendo una trayectoria para que un objeto débil "aparezca" |
| **Cloudflare Pages / Workers / D1 / R2** | Web / API ligera / base de datos / almacén de archivos (doc 11) |
| **MOST, SkyBoT, Horizons** | Herramientas que dicen dónde están los objetos conocidos del sistema solar (para etiquetar "conocido / desconocido") |
