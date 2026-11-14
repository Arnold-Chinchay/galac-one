# 10 · Qué problema real resolvemos y cómo participa el usuario

> 14-nov-2026. Responde a la crítica del equipo: *"las diferencias del doc 09 son solo visuales, no resuelven nada y no innovan; el usuario solo mira"*.
> Este doc **redefine el núcleo del proyecto**. El doc 09 sigue valiendo para cronograma, pitch y cumplimiento del enunciado. Sus perillas de Distancia y Color pasan a ser **herramientas de caracterización** dentro de la cadena que se describe aquí.
> **[verificar]** = confirmar con datos reales.

---

## 1. El problema real (no inventado: está documentado)

### Problema A: SPHEREx "rompe" las técnicas clásicas para ver el cielo cambiar
- La técnica estándar para encontrar lo que se mueve o cambia es la **diferencia de imágenes**: restar una imagen de referencia del mismo color. Así trabajan ZTF, Rubin y Backyard Worlds.
- En SPHEREx, por el filtro LVF, **cada cuadro ve cada punto del cielo en un color distinto**. Restar dos cuadros cualquiera deja residuos enormes de todas las estrellas, porque cada una tiene distinto brillo en cada color.
- La salida que usan los demás equipos (minhaz, novax) es **comparar solo cuadros de λ casi igual**. Eso **descarta ~95-99 % de los pares posibles** y deja muy pocas épocas comparables.
- **Lo dicen investigadores:** Kim et al. 2026 (KASI, arXiv:2604.05332) escriben que con el esquema espectral de SPHEREx *es difícil identificar variables usando solo SPHEREx*. Por eso recurren a NEOWISE. El equipo SSOC (sistema solar) llama a los espectros de objetos móviles "un desafío" (doc 07).
- **Consecuencia:** el "cielo dinámico" de SPHEREx (asteroides, cometas, variables, transitorios) está **subexplotado**. La misión fue diseñada para cosmología, hielos y galaxias, no para el dominio temporal.

### Problema B: no existe un camino público de "píxel → descubrimiento validado"
- Los visores (WiseView y los 9 rivales) terminan en "mira, algo se mueve". **Nadie convierte eso en un dato científico**: con qué confianza es real, qué tan completa fue la búsqueda y qué es el objeto.
- Backyard Worlds demostró que los voluntarios descubren cosas reales, pero NEOWISE **terminó en agosto de 2024**. **SPHEREx es hoy el único telescopio que mapea todo el cielo en 3-5 µm**, justo donde brillan las enanas marrones frías y un posible Planeta X. Los voluntarios necesitan una herramienta para este nuevo dato.

### Problema C: procesar SPHEREx es caro, y un equipo (o un colegio) no tiene servidores
- Cientos de imágenes por punto del cielo y archivos de ~70 MB por detector. Un servicio gratuito como Render (512 MB de RAM, 0.1 CPU) o un Worker de Cloudflare (10 ms de CPU) **no puede** procesarlo para muchos usuarios a la vez (doc 11).

---

## 2. Nuestra solución: tres innovaciones que se apoyan entre sí

### 🧪 Innovación 1: Resta espectral (*λ-aware difference imaging*). **Resuelve el problema A.**
**Idea:** en vez de restar *otro cuadro* (que está en otro color), restamos **lo que ese píxel debería verse en el color exacto de ese cuadro**, según el espectro del propio cielo.

**Cómo funciona (implementable en numpy en horas):**
1. Se alinean todos los cuadros de un campo con `reproject`, se resta `ZODI` y se enmascaran los `FLAGS` (igual que antes).
2. **Para cada píxel**, se juntan sus ~100-200 mediciones. Cada una tiene su λ (WCS espectral) y su tiempo.
3. Se ajusta una **curva suave de flujo en función de λ** (spline o polinomio de grado bajo, **con rechazo robusto de outliers**). Esa curva es el **espectro estático** del píxel, y sale de los mismos datos, sin plantilla externa.
4. **Residuo del cuadro i = medición − espectro_estático(λᵢ).**
5. Lo estático (estrellas, galaxias) desaparece **en todos los cuadros**. Lo que queda es **lo que cambió**:
   - **Objeto que se mueve:** residuo positivo que cambia de lugar entre cuadros.
   - **Estrella variable:** residuo del mismo signo en el mismo lugar, que sigue una curva de luz.
   - **Artefacto:** residuo de un solo cuadro con forma rara (rayo cósmico, borde).
6. **Variante B [verificar]:** usar el **All-Sky spectral cube de DR1** como plantilla, en lugar de construirla con los cuadros del campo.

**Por qué importa:**
- Usa **el 100 % de los cuadros** para buscar cambios, no solo los pares con λ igual. Es más sensibilidad y más épocas con el mismo dato.
- Da **curvas de luz de variables usando todos los colores** (normalizadas por el espectro de la fuente). Eso ataca de frente el hueco que señala el paper coreano.
- **Validación externa:** comparar la curva de luz de **R Draconis** (objetivo oficial) con la de la **AAVSO**, que son datos de **astrónomos aficionados**. Es la prueba perfecta para los jueces y además una historia de ciencia ciudadana.
- **Cuidado honesto:** estrellas muy brillantes dejan residuos por cambios de PSF con λ. Se enmascaran con Gaia y se reportan.

### 👥 Innovación 2: La multitud como **detector calibrado**. **Resuelve el problema B.**
El usuario **no solo mira: produce ciencia medible**.
1. La herramienta le muestra **candidatos** salidos de los residuos: un recorte animado de 5-10 cuadros residuales, más su ubicación y su λ.
2. El usuario clasifica: **se mueve / varía / artefacto / no sé**. Toma unos 5 segundos y funciona en el celular.
3. **Inyección de objetos falsos (la clave):** el sistema mete en los datos **objetos sintéticos** con trayectoria y brillo conocidos. Ni el usuario ni el navegador sabe cuáles son. La verdad vive solo en la base de datos.
   - Sirve para medir **la confiabilidad de cada usuario** (qué tanto acierta con los falsos) y ponderar sus votos.
   - Sirve para medir **la completitud de la búsqueda**: "en este campo detectamos el 90 % de los objetos más brillantes que magnitud X".
   - Es **la misma técnica** (*injection-recovery*) que usan los surveys profesionales para publicar resultados. No es un juego: es metodología real.
4. **Producto científico que sale de la multitud:**
   - **Catálogo de candidatos** con probabilidad (votos ponderados), descargable en CSV/VOTable.
   - **Mapa de exclusión del Planeta X:** *"en el 3 % del cielo revisado, NO hay un objeto en movimiento más brillante que mag X"*. **Un "no encontré nada" también es un resultado**, y así se publican las búsquedas reales de Planeta 9. Cada usuario ve cómo su trabajo "cierra" una zona del mapa. Eso da **sentido** aunque no descubra nada.
   - **Conjunto de entrenamiento etiquetado de artefactos de SPHEREx** (abierto): sirve para entrenar clasificadores automáticos en el futuro. Así pasó con Zooniverse y Galaxy Zoo.
5. **Crédito:** cada candidato confirmado lista a sus clasificadores, como en COIAS y Backyard Worlds. Tiene borrador de reporte MPC si no está en SkyBoT (presentado como "requiere validación profesional").

### 💻 Innovación 3: **Cada visitante es un nodo de cómputo**. **Resuelve el problema C.**
- La parte pesada por usuario (buscar trayectorias en los residuos con *shift-and-stack* e inyectar los falsos) **corre en el navegador** del visitante (Web Worker, sin instalar nada). Es computación voluntaria al estilo SETI@home, pero sin instalación y mientras el usuario clasifica.
- El servidor **solo sirve archivos estáticos** (recortes residuales precalculados) y guarda votos. Por eso **cuesta $0 y escala**: más usuarios es más cómputo, no más costo.
- **Redundancia:** cada mosaico lo procesan 2 o más navegadores; si los resultados no coinciden, se reprocesa. Es la misma lógica que BOINC.
- **Los usuarios eligen dónde buscar:** "pedir un campo nuevo" encola un trabajo gratuito en GitHub Actions que precalcula ese mosaico (doc 11). **La cobertura crece con la comunidad.**

---

## 3. La cadena completa: de píxel a descubrimiento
```
 DETECTAR            VERIFICAR              CARACTERIZAR                 PUBLICAR
 Resta espectral ──► Multitud calibrada ──► 📏 Distancia (paralaje)  ──► Catálogo + probabilidad
 (todos los cuadros)  (inyecciones,          🌈 Composición (espectro      Mapa de exclusión
                       votos ponderados)        en la trayectoria)          Dataset etiquetado
                                             SkyBoT/Gaia: ¿conocido?        Borrador MPC
```
- Las "perillas" del doc 09 **ya no son el producto**. Son la etapa de **caracterización** que se aplica automáticamente a cada candidato confirmado. Ejemplo: "este candidato está a ~40 UA y tiene hielo de metano → posible TNO".
- La base obligatoria del enunciado (flipbook, 5 objetivos, URL, FOV, FLAGS, Gaia) **sigue igual** (doc 09 §4): es la "vista experta" de cualquier campo.

---

## 4. Honestidad: qué es nuevo y qué no
| Pieza | ¿Existe? | Qué aportamos |
|---|---|---|
| Diferencia de imágenes | Sí (ZTF, Rubin) | **Versión espectral para un instrumento LVF**: no la encontramos pública para SPHEREx [verificar] |
| Ciencia ciudadana de objetos móviles | Sí (Backyard Worlds, COIAS) | Sobre **SPHEREx** (el único mapeo 3-5 µm activo), con **calibración por inyección por usuario** y **mapa de exclusión** como producto |
| Computación voluntaria | Sí (BOINC, SETI@home) | **En el navegador, sin instalar**, integrada a la tarea de clasificar |
| Shift-and-stack | Sí (búsquedas de TNO) | Público, interactivo y aplicado a residuos espectrales |
| Espectro de objetos móviles | Profesional (SSOC, SPIFF) | Público y a demanda |

**Lo innovador es la combinación:** resolver el obstáculo técnico del LVF y convertir al público en un instrumento calibrado cuyo trabajo produce un dato publicable, todo sin costo de infraestructura.

**Qué NO prometemos:** encontrar el Planeta 9. Si existe, probablemente es más débil que el límite de SPHEREx [verificar profundidad]. Prometemos **acotar dónde no está** (hasta cierto brillo), encontrar objetos móviles y variables reales, y dejar un método que escala a DR2, NEO Surveyor y Roman.

---

## 5. Validación (reemplaza y amplía la tabla §5 del doc 09)
| Prueba | Métrica | Meta |
|---|---|---|
| Resta espectral en campo de control | RMS del residuo vs. ruido esperado | Residuo ≈ ruido (sin estructura de estrellas) |
| % de cuadros útiles | Resta espectral vs. "solo λ iguales" | Mostrar el factor de ganancia (esperado: ≥10×) [medir] |
| R Draconis | Nuestra curva vs. AAVSO | Misma fase y tendencia |
| Asteroide conocido en el campo | ¿Aparece en los residuos? ¿Lo recupera el shift-and-stack? | Sí, con posición de Horizons ±1 px |
| Inyección-recuperación | Completitud vs. magnitud | Curva de completitud (50 % en mag X) |
| Multitud piloto (equipo + 10 amigos) | Acierto en inyecciones | Medir la confiabilidad real |
| Plutón / Makemake | Distancia por enfoque y CH₄ | Doc 09 §5 |

---

## 6. Experimentos go/no-go (reemplazan doc 09 §8; primeras 3 h)
| # | Experimento | Decide |
|---|---|---|
| 1 | **Resta espectral** en un campo de 0.25° con ~100 cuadros: ¿desaparecen las estrellas? | Si funciona: es el núcleo. Si no: plan B = solo λ iguales + inyección + multitud (las innovaciones 2 y 3 siguen en pie) |
| 2 | ¿Un asteroide conocido aparece limpio en los residuos? | Valida la detección |
| 3 | Shift-and-stack en JS (Web Worker) sobre 1 mosaico: ¿cuánto tarda en un celular? | Tamaño de mosaico y grilla |
| 4 | Esqueleto web en Cloudflare Pages + Worker con D1 (votos) + 1 mosaico en R2 (doc 11) | P0 de la plataforma |

## 7. Nuevas prioridades
| Nivel | Contenido |
|---|---|
| **P0** | Base del enunciado (doc 09 §3.1) · resta espectral en 5-10 campos precalculados · interfaz de clasificación con votos guardados |
| **P1** | Inyecciones + confiabilidad por usuario + curva de completitud · shift-and-stack en el navegador · R Dra vs. AAVSO |
| **P2** | Mapa de exclusión en vivo · "pedir un campo" (GitHub Actions) · espectro y distancia automáticos del candidato · modo escuela ES |
| **P3** | Borrador MPC · redundancia entre navegadores · sonificación |

## 8. Cómo se cuenta en 30 segundos
> *"SPHEREx sees every star in a different color in every frame, so the standard way to find what moves or changes doesn't work. Researchers say so. We fixed it with spectral subtraction, which uses every frame instead of 1 %. Then we turned the public into a calibrated detector: hidden fake objects measure how good each volunteer and each search really is, and every visitor's browser does the computing. Even 'nothing found' becomes science: a growing map of where Planet X is not."*
