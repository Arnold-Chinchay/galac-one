# 06 · El diferenciador: "Míralo moverse. Descubre de qué está hecho."

> Propuesta del 13-nov-2026. Estado: **propuesta, pendiente de que el equipo la apruebe.**

## 1. El problema con lo que teníamos
"Visor de animación + detección + etiqueta conocido/desconocido + espectro opcional" es un buen proyecto, pero:
- La animación es **lo que pide el enunciado**; la harán casi todos los equipos.
- WiseView (Backyard Worlds) ya hace flipbooks desde 2017.
- El espectro estaba como un "extra" desconectado del resto.

Falta una idea que un científico de SPHEREx vea y diga: *"eso solo se puede hacer con SPHEREx, y nadie lo ofrece al público"*.

## 2. La idea: convertir el defecto en la función principal
**Hecho clave (doc 01):** por el filtro LVF, **cada cuadro de la animación ve el objeto en un color (λ) distinto**. Todos los equipos lo verán como un problema (el brillo "salta" entre cuadros).

**Nuestra jugada:** cuando un objeto se mueve por la animación, **cada cuadro es un punto de su espectro**. Si seguimos al objeto cuadro a cuadro y medimos su brillo en la λ de ese cuadro, **la propia animación arma el espectro del objeto**.

> *Watch it move. Find out what it's made of.*
> El usuario encuentra algo que se mueve y la herramienta le dice de qué está hecho.

### Flujo para el usuario
1. Mira la animación y marca lo que se mueve (o la herramienta se lo sugiere).
2. La herramienta sigue al objeto en todos los cuadros y mide su brillo en cada λ (fotometría forzada con la posición del tracklet o la efeméride de MOST y la λ del WCS espectral `W`).
3. Aparece el **espectro de 0.75 a 5 µm** construido en vivo, punto a punto, sincronizado con la animación: cada cuadro que pasa agrega su punto de color.
4. Comparación con espectros tipo y veredicto en lenguaje simple:
   - **asteroide rocoso** (silicatos: bandas de ~0.9-1 µm y ~1.9-2 µm, ej. tipo V/S);
   - **asteroide primitivo/hidratado** (banda de ~3 µm, ej. Ceres, tipo C);
   - **cometa** (hielo de agua ~3 µm, CO₂ ~4.27 µm, CO ~4.67 µm, como 3I/ATLAS);
   - **enana marrón** (absorción de metano y agua, "Planet X");
   - **cola térmica** (>3.5 µm en asteroides cercanos al Sol: el objeto "brilla" por calor).

## 3. Por qué esto puede ganar (contra los 5 criterios)
| Criterio | Qué aporta |
|---|---|
| **Creativity** | Usa la rareza exclusiva de SPHEREx (LVF) como función. No existe una herramienta pública que lo haga. |
| **Relevance** | Responde al reto (ver cambios en el tiempo) **y** usa lo único de la misión (102 colores). Los datos NASA son el núcleo. |
| **Validity** | Verificable con objetos de composición conocida: si el espectro de un asteroide tipo V (Vesta) muestra sus bandas de silicato y el de Ceres su banda de 3 µm, el método está validado ante los jueces. |
| **Impact** | Ciencia ciudadana con un paso más: no solo "encontré algo", sino "sé qué es". Educa sobre espectroscopía sin fórmulas. Escala: el equipo de SPHEREx (SSOC) reconoce que los espectros de objetos móviles son un reto de reducción de datos. |
| **Presentation** | La demo se explica sola en 30 segundos: algo se mueve → aparece su espectro → "es un cometa con hielo de agua". |

## 4. Honestidad técnica (lo que no ocultamos)
- **Precedentes profesionales:** el equipo SSOC de SPHEREx prepara un catálogo de objetos del sistema solar, y Gagné et al. 2026 (SPIFF) extrajo espectros de enanas marrones en movimiento. **Nuestra novedad es hacerlo público, interactivo e instantáneo**, no inventar la técnica.
- **Fuentes de error que hay que mostrar en la interfaz:**
  - la **rotación** del asteroide cambia su brillo entre cuadros (curva de luz de ~0.1-0.5 mag), lo que añade ruido;
  - la distancia y la fase cambian poco en horas o días, pero algo cambian;
  - S/N bajo en algunas λ (3I/ATLAS lo tiene);
  - fuentes extendidas (cometas): la fotometría de apertura es aproximada.
  - **Solución de diseño:** barras de error en cada punto y "confianza" del veredicto. Mejor honestos que espectaculares.
- **Riesgo: saturación.** Los asteroides más brillantes (Ceres, Vesta) podrían **saturar** SPHEREx, que está diseñado para fuentes débiles (bit `OVERFLOW`). **[verificar el día 1]**. Plan B: asteroides algo más débiles con taxonomía conocida.

## 5. Por qué además **baja** el riesgo técnico
El MVP **no necesita detección a ciegas**:
- Para objetos conocidos, MOST da la posición predicha en cada imagen y SPHEREx la λ en cada píxel → fotometría forzada → espectro.
- La detección automática de objetos desconocidos (doc 03 §7) pasa a ser la **segunda capa**, no la base. Si no llegamos, la demo sigue siendo fuerte.

## 6. Demo propuesta (3 actos)
1. **"Algo se mueve":** flipbook de 3I/ATLAS cruzando el campo.
2. **"¿Qué es?":** el espectro se arma cuadro a cuadro: hielo de agua y CO₂ → "es un cometa, y vino de otra estrella".
3. **"Ahora tú":** el usuario elige un asteroide (o marca uno en un campo) y obtiene su veredicto. Cierre: estudiantes de Piura haciendo espectroscopía planetaria desde el teléfono.

## 7. Tareas de verificación inmediata (día 1, primeras horas)
- [ ] Fotometría forzada de 1 asteroide conocido en ≥20 cuadros: ¿el espectro sale coherente?
- [ ] ¿Satura Vesta o Ceres? Si satura, elegir alternativas con taxonomía conocida.
- [ ] Espectros de referencia de comparación (taxonomía Bus-DeMeo hasta 2.45 µm; banda de 3 µm de la literatura) **[buscar fuentes y licencia]**.
- [ ] 3I/ATLAS: comparar nuestro espectro con lo publicado por Lisse et al. (hielo de H₂O, CO₂).
