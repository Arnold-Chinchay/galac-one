# 09 · Plan maestro: "FOCUS: Time · Distance · Color"

> Escrito el 14-nov-2026, día 1 del hackathon. Entrega: **domingo 15-nov, 23:59 hora local**, en inglés.
> Reemplaza la propuesta del doc 06 (que queda como **uno de los tres módulos**, no como todo el proyecto).
> **[verificar]** = hay que confirmarlo con datos reales en las primeras horas.
>
> ⚠️ **Actualización 14-nov:** el **núcleo** del proyecto ahora está en el **doc 10** (resta espectral, multitud calibrada con inyecciones, cómputo en el navegador). Las perillas de Distancia y Color de este doc pasan a ser la **etapa de caracterización** de los candidatos. Las prioridades (§7) y los experimentos (§8) de este doc quedan **reemplazados por doc 10 §6-7**. La infraestructura está en el **doc 11**. El **cronograma (§9) queda reemplazado por el plan de un solo día del doc 00 §3**. Siguen vigentes aquí: cumplimiento del enunciado (§4), vista experta (§3.1) y pitch (§10, ajustar al doc 10 §8).

---

## 1. Por qué lo que teníamos no basta
- **El flipbook es un commodity.** Los 9 rivales del doc 08 ya lo tienen, y minhaz-42 y hd189b llevan semanas de trabajo.
- **El "espectro del objeto en movimiento" es bueno, pero es una sola función.** Un jurado lo ve como un *feature*, no como una idea grande.
- **"Planet X" está en el título del reto y nadie lo ataca de verdad.** Todos hacen "ver cosas moverse". Nadie ofrece una forma real de **buscar** un planeta lejano. Ahí está el hueco más grande.

Necesitamos tres cosas a la vez: **una idea grande que se explique en una frase**, **ciencia que un astrónomo respete**, y **una validación con números**.

---

## 2. El concepto: una cámara con tres perillas
> **SPHEREx no es una cámara normal. Nuestra herramienta le pone tres perillas para enfocar el cielo: en el TIEMPO, en la DISTANCIA y en el COLOR.**

| Perilla | Pregunta que responde | Qué hace la herramienta | ¿Alguien más lo hace? |
|---|---|---|---|
| ⏱️ **Tiempo** | *¿Qué cambió?* | Flipbook, diferencias, suma/resta de épocas, curva de luz a λ fija | Sí, todos. Es la **base obligatoria**: hay que hacerla bien, pero no gana sola |
| 📏 **Distancia** | *¿Qué tan lejos está? ¿Hay un Planeta X?* | **Shift-and-stack por paralaje**: el usuario mueve un deslizador de distancia (30 → 1000 UA) y las imágenes se re-apilan siguiendo la trayectoria que tendría un objeto a esa distancia. A la distancia correcta, el objeto **aparece enfocado** y las estrellas se borronean | **No encontramos a nadie** [verificar] |
| 🌈 **Color** | *¿De qué está hecho?* | El espectro del objeto se arma **siguiendo su trayectoria** (fotometría forzada en la λ de cada cuadro) y se compara con espectros tipo: roca, hielo de agua, **hielo de metano**, CO₂, enana marrón | No para objetos en movimiento (doc 08) |

**Frase del pitch:** *"Other tools let you watch the sky move. FOCUS lets you measure how far things are and what they're made of, using nothing but SPHEREx."*

### Por qué la perilla de distancia es la jugada fuerte
1. **Es la técnica real con la que se buscan planetas lejanos y objetos transneptunianos** (*digital tracking* o *shift-and-stack*). Así se encontraron muchos TNO débiles. Nadie la ofrece al público.
2. **Responde literalmente al título del reto.** Un Planeta X a cientos de UA se mueve muy poco por su órbita, pero **sí se desplaza por el paralaje** (porque la Tierra se mueve). Ese desplazamiento depende **solo de la distancia**. Fijar la distancia equivale a fijar la trayectoria.
3. **Es visualmente espectacular:** un deslizador que "enfoca" un punto que antes era invisible. Se entiende en 5 segundos en un video.
4. **Da una medición, no solo una imagen:** *"medimos la distancia de Makemake usando solo SPHEREx: X UA (real: ~52 UA)"*. Eso es **Validity** pura.
5. **El régimen de Planeta X (300-1000 UA) es el más barato de calcular:** el desplazamiento es pequeño (decenas de píxeles en días), así que basta un recorte chico.
6. **Usa la sugerencia oficial de "sumar imágenes"** de la forma más inteligente posible: sumar *a lo largo de la trayectoria*, no en un punto fijo.

### Las perillas se combinan
- **Distancia + Color:** al apilar a la distancia correcta, el objeto débil gana S/N. El espectro sale de esos mismos cuadros. Ejemplo: Makemake o Plutón muestran **bandas de hielo de metano** (1.7, 2.3, 3.3 µm).
- **Tiempo + Distancia:** el flipbook "normal" muestra que no se ve nada; al girar la perilla de distancia, aparece. Ese contraste **es** la demo.

---

## 3. Los módulos en detalle

### 3.1 ⏱️ Tiempo (base obligatoria, cubre el enunciado)
- Entrada por **nombre o RA/Dec**, y **URL compartible** (`?ra=..&dec=..&fov=..&mode=..`) embebible en `<iframe>`.
- **Campo de visión** elegible (el enunciado lo pide).
- Flipbook con la **λ de cada cuadro** visible, blink, diferencia **solo entre λ compatibles** (LVF), **suma y resta** de épocas elegidas por el usuario.
- **Coadd por detector** (sumar todos los cuadros de cada uno de los 6 detectores): pedido explícito del enunciado.
- **Gaia DR3 superpuesto con posiciones propagadas a la fecha de cada cuadro** (movimiento propio + época). Pedido explícito; los rivales usan SIMBAD/AllWISE.
- **Banderas (FLAGS)** visibles como capa y metadatos por cuadro.
- **Data release configurable** (DR1 por defecto; cambiar de versión es un parámetro). Pedido explícito.
- Los **5 objetivos oficiales** (Barnard, Eps Indi B, WISE 0855, RW Aur, R Dra) precalculados y con medición: movimiento propio medido vs. catálogo, y curva de luz a λ fija.

### 3.2 📏 Distancia: "Planet X Hunter"
**Matemática (simple y correcta):**
1. Para cada cuadro *i* (tiempo *tᵢ*), tomar la posición de la Tierra **Eᵢ** (`astropy.coordinates.get_body_barycentric`). SPHEREx está en órbita baja; para objetos a más de 30 UA la diferencia con el geocentro es despreciable.
2. Hipótesis: hay un objeto en la dirección (RA₀, Dec₀) en *t₀* a distancia *d*. Su posición en el espacio es **P = E₀ + d·û₀**.
3. Para objetos lejanos el movimiento orbital propio en días es pequeño frente al paralaje; se modela con una velocidad tangencial opcional (*v*ₓ, *v*ᵧ) en una grilla gruesa.
4. Dirección predicha en el cuadro *i*: **ûᵢ = (P − Eᵢ)/|P − Eᵢ|** → RA/Dec → píxel con el WCS del cuadro.
5. Desplazar cada cuadro para que esa posición caiga en el mismo píxel y **apilar** con mediana o media con rechazo de outliers. Antes de apilar: restar `ZODI`, enmascarar con `FLAGS` y restar una plantilla de estrellas fijas.
6. **Métrica de enfoque:** S/N del pico en el centro. Graficar **S/N vs. distancia**: el máximo es la distancia medida.

**Modos para el usuario:**
- **Validar:** objeto conocido (Plutón, Makemake, Haumea, Eris). Se carga la efeméride (MOST/Horizons), el usuario mueve el deslizador y ve cómo el objeto se enfoca justo en su distancia real. Curva S/N vs. *d* con la distancia real marcada.
- **Buscar:** campo elegido por el usuario. La herramienta barre una grilla de distancias (50-1000 UA) y velocidades, y muestra los **candidatos** con su mejor *d*. Etiquetados con SkyBoT (conocido / desconocido) y Gaia (¿es una estrella?).
- **Honestidad en la interfaz:** "un candidato no es un descubrimiento". Se muestran los falsos positivos típicos (rayos cósmicos, estrellas mal restadas, bordes).

**Riesgos [verificar en las primeras 3 h]:**
- **Cadencia:** ¿cuántos cuadros cubren un mismo punto dentro de una ventana de días a semanas? (SPHEREx barre el cielo dos veces por año; cada punto recibe sus 102 λ en una ventana corta.) Sin unos 10 cuadros en la ventana, el método no gana S/N.
- **Profundidad:** ¿Makemake (V≈17) o Eris (V≈18.7) se ven en un cuadro o solo apilados? **Plutón (V≈14.4)** es la validación segura, aunque su campo es denso (plano galáctico).
- **Desplazamiento grande para TNOs cercanos:** a 50 UA, en 10 días el objeto se mueve ~0.2° (~120 px). Solución: recortes centrados en la efeméride para el modo Validar; en el modo Buscar, el régimen de 300-1000 UA (desplazamiento chico) es justo el de Planeta X.

### 3.3 🌈 Color: "What is it made of?"
(Es el doc 06, mejorado.)
- Fotometría forzada en la posición de la efeméride o del tracklet, en la λ de cada cuadro (WCS espectral).
- **Correcciones físicas:** normalizar por distancias heliocéntrica y geocéntrica y por fase (Horizons da *r*, Δ y α). Así el espectro no se deforma porque el objeto se acercó.
- **Barras de error** y **nivel de confianza** del veredicto.
- **Comparación** con plantillas: asteroides S / C / V (Bus-DeMeo hasta 2.45 µm), banda de 3 µm (hidratación), hielo de H₂O y CO₂ (cometas, 3I/ATLAS), **hielo de CH₄** (Plutón, Makemake, Eris), enanas marrones (CH₄ + H₂O).
- **Exceso térmico (>3.5 µm):** en asteroides cercanos al Sol, el objeto "brilla por calor". Nivel extra: con H (de JPL) + flujo térmico, un modelo NEATM simple da **tamaño y albedo**. Esto conecta con **defensa planetaria y NEO Surveyor (lanzamiento 2027)**. Solo si sobra tiempo.

### 3.4 Capas que suben Impact y Presentation (baratas)
- **🔊 Sonificación** (Web Audio): el espectro se escucha (λ → tono, brillo → volumen) y el "enfoque" suena cuando la perilla de distancia acierta. Accesible para personas ciegas. NASA hace sonificaciones oficiales; es un gancho de inclusión fuerte. Unas 2-3 h de trabajo.
- **🇵🇪 Modo escuela en español** (ES/EN): 3 misiones guiadas ("Encuentra a Plutón", "¿De qué está hecho este cometa?", "Busca el Planeta X"). Narrativa Naylamp/Piura.
- **📄 Borrador de reporte MPC** para candidatos (estilo COIAS, doc 07): presentado como trabajo futuro con validación profesional.
- *(Opcional, miembro de hardware)* **espectroscopio casero** con un CD y el celular para el video: "esto es lo que hace SPHEREx, pero desde el espacio y en infrarrojo". Une la experiencia física con la herramienta.

---

## 4. Matriz de cumplimiento del enunciado (va en una diapositiva)
| Pedido oficial | Cómo lo cubrimos |
|---|---|
| RA/Dec → "pequeño video" | ⏱️ Flipbook |
| 5 objetivos de prueba | Precalculados, con **medición** (no solo visualización) |
| Actualizable a nuevas versiones | Data release como parámetro; DR1 por defecto |
| 102 bandas creativamente + **espectros al vuelo ("extra kudos")** | 🌈 Espectro de objetos en movimiento + 📏 apilado por trayectoria |
| Sumar por detector | Coadd por detector |
| Sumar/restar épocas | ⏱️ Suma/resta |
| Elegir campo de visión | Parámetro `fov` |
| Superponer Gaia/WISE | Gaia DR3 propagado a cada época |
| Consultas por URL / embeber | URL con parámetros + `<iframe>` |
| Metadatos y banderas | Capa FLAGS + panel de metadatos |
| Astropy, Aladin | Backend Astropy; contexto con Aladin Lite (HiPS de SPHEREx) |

**Ningún rival cubre las 11 filas. Nosotros sí, y además tenemos 2 cosas que nadie tiene.**

---

## 5. Validación científica (la diapositiva que gana "Validity")
| Prueba | Resultado esperado | Si sale bien, decimos |
|---|---|---|
| Movimiento propio de Barnard | ~10.4″/año | "Medido: X″/año (catálogo: 10.4)" |
| WISE 0855 visible solo a 3.8-4.4 µm | Aparece en λ largas, desaparece en cortas | "El color correcto lo revela" |
| **Distancia de Plutón por enfoque** | Pico de S/N en ~35 UA | "Medimos la distancia a Plutón solo con SPHEREx" |
| **Distancia de Makemake** | Pico en ~52 UA | Ídem, objeto más débil |
| Espectro de Plutón / Makemake | Bandas de CH₄ | "Encontramos hielo de metano" |
| Asteroide S vs. C | Banda de 1 µm vs. espectro plano o con banda de 3 µm | Taxonomía recuperada |
| 3I/ATLAS | H₂O + CO₂ | Coincide con Lisse et al. |
| Campo sin objetos (control) | Ningún pico | "Sin falsos positivos en el control" |

---

## 6. Arquitectura
```
[⚠️ Infraestructura vigente: doc 11 (todo en Cloudflare: Pages + Workers + D1 + R2; Python solo en GitHub Actions). El diagrama de abajo es la versión inicial.]
[React + Vite (Vercel)] ──► [Static: casos precalculados (WebP + JSON)]
        │
        └─► [API Python FastAPI (Hugging Face Spaces / Render)]
                 ├─ TAP IRSA (DR1)  → lista de cuadros + URL de recorte
                 ├─ Cutout service  → recortes (en paralelo, con reintentos)
                 ├─ Astropy/reproject → ZODI, FLAGS, alineación
                 ├─ stack.py        → shift-and-stack por distancia
                 ├─ photometry.py   → fotometría forzada + espectro
                 └─ Horizons/MOST/SkyBoT/Gaia (astroquery)
```
- **Demo = precalculada** (rápida y a prueba de fallas). **Modo en vivo** para cualquier RA/Dec, con barra de progreso honesta (~20-60 s).
- La grilla de distancias se calcula **una vez** en el backend; el deslizador en el navegador solo elige qué apilado mostrar (respuesta instantánea). Se precalculan unos 30 valores de *d* por caso.

---

## 7. Prioridades (qué se corta si falta tiempo)
| Nivel | Contenido | Si no llega... |
|---|---|---|
| **P0: imprescindible** | ⏱️ Tiempo con los 5 objetivos + URL + FOV + FLAGS · 🌈 espectro de 1 objeto móvil (3I/ATLAS o asteroide) | No hay proyecto |
| **P1: lo que gana** | 📏 Distancia en modo Validar con Plutón (curva S/N vs. *d*) · Gaia propagado · coadd por detector | Volvemos al plan del doc 06 (sigue siendo competitivo) |
| **P2: lo que impresiona** | 📏 modo Buscar · espectro de CH₄ de Makemake · sonificación · modo escuela ES | Se menciona en el pitch como "next" |
| **P3: trabajo futuro** | NEATM (tamaño y albedo) · borrador MPC · espectroscopio casero | Solo en la diapositiva final |

**Regla:** no se empieza P2 hasta que P0 esté desplegado en una URL pública.

---

## 8. Experimentos go/no-go (primeras 3 horas)
| # | Experimento | Responsable | Decide |
|---|---|---|---|
| 1 | TAP DR1 en el campo de Plutón: ¿cuántos cuadros caen en una ventana de ≤ 14 días? | Python | Si son ≥ 8, el módulo 📏 va. Si no, se prueba con la ventana completa usando efemérides |
| 2 | Shift-and-stack de Plutón con la efeméride: ¿se ve un punto nítido? | Python | Valida el método |
| 3 | Fotometría forzada de un asteroide en ≥ 20 cuadros: ¿espectro coherente? ¿satura? | Python | Elige el objeto de 🌈 |
| 4 | Esqueleto React desplegado + URL con parámetros + 1 caso estático | Web | P0 en marcha |
| 5 | ¿Algún rival tiene shift-and-stack o espectro en trayectoria? (revisar demos de minhaz y hd189b) | Diseño/pitch | Confirma el diferenciador |

---

## 9. Cronograma (de hoy sábado a la entrega del domingo 23:59)
| Bloque | Python/datos | Web (React) | Diseño/pitch | Hardware/apoyo |
|---|---|---|---|---|
| **Sáb. primeras 3 h** | Experimentos 1-3 | Esqueleto + deploy + URL | Experimento 5, nombre/marca, guion del video | Gaia propagado (astroquery) |
| **Sáb. tarde** | Pipeline P0: 5 objetivos + 3I/ATLAS | Flipbook, λ por cuadro, diferencias, FLAGS | Diseño de interfaz (3 perillas) | Coadd por detector |
| **Sáb. noche** | 📏 Validar con Plutón: grilla de *d* → JSON | Pantalla del espectro | Diapositivas 1-4 | Sonificación |
| **Dom. mañana** | Makemake + espectro CH₄ · API en vivo | Pantalla de distancia (deslizador + curva) | Grabar video | Modo escuela ES |
| **Dom. tarde** | Validación (tabla §5 con números reales) | Pulido, móvil, tour para jueces | Diapositivas 5-7, textos en inglés | QA de todos los casos |
| **Dom. 18:00** | 🔒 **Congelar funciones**. Solo arreglos | | | |
| **Dom. 21:00** | 🚀 **Enviar** (3 h de margen) | | | |

---

## 10. Pitch (7 diapositivas + video de 30 s)
1. **Hook:** "Planet X has been hunted for 100 years. What if anyone could join the hunt?"
2. **Problema:** SPHEREx ve 102 colores, pero cada cuadro ve uno distinto. Los demás lo ven como un defecto.
3. **Idea:** una cámara con tres perillas (Tiempo · Distancia · Color).
4. **Demo de Distancia:** Plutón se enfoca en 35 UA (GIF del deslizador).
5. **Demo de Color:** espectro armado cuadro a cuadro → "hielo de metano" / "cometa interestelar".
6. **Validación + cumplimiento:** tablas §5 y §4.
7. **Impacto:** estudiantes de Piura y de cualquier lugar del mundo, accesible (sonificación), ES/EN, camino a reportes MPC.

**Video de 30 s:** flipbook vacío (0-5 s) → giro de la perilla de distancia y aparece Plutón (5-15 s) → el espectro se arma y aparece "methane ice" (15-25 s) → logo y "Time · Distance · Color" (25-30 s). Con subtítulos en inglés.

---

## 11. Riesgos y planes B
| Riesgo | Plan B |
|---|---|
| Pocos cuadros por ventana para el apilado | Usar toda la cobertura con efemérides de Horizons (modo Validar sigue funcionando) |
| Makemake o Eris no se detectan | Plutón + Haumea; Eris queda como "límite de profundidad", también es un resultado |
| Campo de Plutón demasiado denso | Restar plantilla de estrellas fijas + máscara Gaia |
| IRSA lenta o caída el domingo | Todo lo de la demo ya precalculado y estático |
| Un rival ya tiene shift-and-stack | El combo Distancia + Color + cumplimiento total sigue siendo único; ajustar el pitch |
| Falta tiempo | Aplicar la tabla §7 sin piedad |
