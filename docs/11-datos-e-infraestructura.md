# 11 · Manejo de datos e infraestructura gratuita (guía para el equipo)

> 14-nov-2026 (v2: **todo en Cloudflare**, decisión del equipo). **Costo objetivo: $0.**
> Los límites se verificaron hoy en la documentación oficial de Cloudflare; pueden cambiar, así que revísenlos al crear la cuenta.
> Concepto que soporta esta infraestructura: doc 10 (resta espectral + multitud calibrada + cómputo en el navegador).

---

## 1. La regla de oro (no cambia)
> **Lo pesado se calcula UNA vez, fuera del servidor, y se sirve como archivo estático. Lo que depende de cada usuario se calcula en SU navegador. El servidor solo coordina.**

Nunca descargamos FITS completos (~70 MB × 6 detectores por exposición). Solo **recortes** (Cutout Service de IRSA).

---

## 2. Por qué Cloudflare para todo
| Ventaja | Detalle |
|---|---|
| **Una sola cuenta y un solo panel** | Web, API, base de datos y archivos juntos. Menos cuentas que coordinar entre 4 personas |
| **Sin "dormirse" ni "pausarse"** | Render se duerme a los 15 min y Supabase se pausa a los 7 días. **Workers y D1 no.** Desaparece el cron de mantenimiento que teníamos en la versión 1 |
| **Salida de datos gratis** | R2 no cobra por descargar (egress). Los mosaicos de 3-6 MB no generan costo por tráfico |
| **Todo en la misma red** | El Worker lee R2 y D1 con *bindings* (sin claves ni URLs públicas entre servicios) |
| **Seguridad más simple** | D1 **no** se expone al público: solo el Worker puede leerla. Las respuestas de las inyecciones (doc 10) nunca llegan al navegador, sin configurar políticas de seguridad por fila como en Supabase |

---

## 3. Mapa de servicios
| Rol | Servicio Cloudflare | Límites gratis (verificados 14-nov-2026) |
|---|---|---|
| **Web (React + Vite)** | **Pages** | Archivos estáticos. Despliegue con cada `git push` |
| **API ligera** | **Workers** (o Pages Functions) | **100,000 peticiones/día** (se reinicia 00:00 UTC) · **10 ms de CPU** por petición (esperar a la red no cuenta) · **50 subpeticiones** por llamada · **5 Cron Triggers** |
| **Votos, usuarios, inyecciones** | **D1** (SQLite) | **5 M filas leídas/día** · **100,000 filas escritas/día** · 500 MB por base · 5 GB total · 10 bases. **Desde el 1-sep-2026, al pasar el límite las consultas fallan hasta medianoche UTC** (los datos no se pierden) |
| **Mosaicos (archivos grandes)** | **R2** | **10 GB** de almacenamiento · **1 M** operaciones de escritura/mes (clase A) · **10 M** de lectura/mes (clase B) · **egress gratis** (por Workers, API S3 o `r2.dev`) |
| **Procesamiento pesado** | **GitHub Actions** (repo público) | Minutos ilimitados en repos públicos [verificar runner], 6 h por trabajo, trabajos en paralelo. **Cloudflare no sirve para esto** (10 ms de CPU) |
| **Exploración y pruebas** | Google Colab / laptops | Notebooks de los experimentos go/no-go |

### Lo que cambia respecto a la versión 1
- ❌ **Vercel, Render, Supabase, Hugging Face Datasets** → todos reemplazados por Cloudflare.
- ✅ **GitHub Actions se queda:** es lo único que puede correr Python pesado gratis (astropy, reproject). Sube los resultados a R2 y D1 con la API compatible con S3 de R2 y la API REST de Cloudflare.
- ✅ Supabase tenía autenticación; aquí usamos **ID anónimo** (UUID guardado en el navegador) + alias opcional. Suficiente para el hackathon.

### ⚠️ Cosas a verificar o vigilar (honestidad)
1. **Tarjeta de crédito:** la documentación de R2 que leí no dice si piden una para activarlo. **[verificar al crear la cuenta]** Si la piden y no pueden ponerla, **plan B: guardar los mosaicos como archivos estáticos dentro de Pages** (la demo cabe en <300 MB; revisar el tope de Pages por archivo y por despliegue **[verificar]**).
2. **`r2.dev` es para pruebas**, no para producción (tiene límite de tasa y sin caché). Para servir los mosaicos hay dos caminos:
   a. **Worker con *binding* a R2** (cada descarga cuenta como 1 petición de las 100,000/día) y cabeceras `Cache-Control` largas para que el CDN las cachee.
   b. **Dominio propio conectado al bucket** (requiere tener un dominio) **[verificar]**.
   Para la demo, la opción (a) alcanza de sobra.
3. **El tope de 10 ms de CPU** obliga a que el Worker haga solo cosas triviales: validar un voto, consultar D1, redirigir. **Nada de calcular candidatos ni de apilar imágenes aquí.**
4. **El tope de 100,000 filas escritas/día en D1:** cada voto escribe 1-2 filas. Alcanza para ~50,000 votos/día. Si hay riesgo de pasarse, **agrupar votos en lotes** (el navegador envía 10 votos juntos).
5. **Pico de tráfico durante el juzgamiento:** las peticiones a archivos estáticos de Pages no cuentan contra las 100,000 de Workers; solo cuentan las llamadas a la API. Si se agota el cupo, la interfaz debe **seguir funcionando sin guardar** (votos en `localStorage` y envío posterior).

---

## 4. Cuántos datos son (estimación)
| Cosa | Cálculo | Tamaño |
|---|---|---|
| 1 cuadro recortado de 0.25° | 0.25° / 6.15″ ≈ 147 px → 147² × 4 B (float32) | ~86 KB |
| 1 mosaico (campo) | ~100-200 cuadros **[verificar cuántos por campo en DR1]** | 9-17 MB (float32) |
| Mismo mosaico, **residuos en float16 + gzip** | ÷2 por float16, ÷1.5-2 por compresión | **~3-6 MB** (lo que baja el navegador) |
| Demo del hackathon | ~20-50 mosaicos (5 objetivos oficiales, 3I/ATLAS, Plutón, Makemake, campos eclípticos) | **~100-300 MB** |
| Techo del plan gratis (R2 10 GB) | ~10 GB / 5 MB | **~2,000 mosaicos** |
| Descargas que aguanta el plan | 10 M lecturas/mes, ~3 lecturas por mosaico (manifest, frames, cubo) | ~3 M mosaicos/mes |
| Votos en D1 | ~150 B por voto, 500 MB por base | ~3 M votos por base |

> ⚠️ **Corrección (doc 12):** lo que **baja de IRSA** pesa **4 MB por recorte**, no 86 KB (la tabla EPSF ocupa 3.8 MB y no se puede excluir). Son ~600 MB de descarga por mosaico, que ocurre solo en GitHub Actions. Tras reducir, queda ~48 KB por cuadro, así que lo **almacenado** sí coincide con esta tabla.

**Conclusión:** el almacenamiento y el tráfico sobran. Los límites que hay que cuidar son **las 100,000 peticiones/día del Worker** y **las 100,000 escrituras/día de D1**.

---

## 5. Flujo de datos
```
          (1) PRECÁLCULO: GitHub Actions, matriz de mosaicos en paralelo
IRSA TAP (DR1) ─► lista de cuadros ─► Cutout Service ─► alinear (reproject) ─► ZODI + FLAGS
  ─► RESTA ESPECTRAL (doc 10) ─► residuos float16 ─► + inyecciones sintéticas
  ─► sube el mosaico a R2 (API S3)  ·  verdad de las inyecciones → D1 (tabla privada)

          (2) USO: navegador del visitante (Pages)
GET /tiles/<id>/... ─► Worker ─► R2 (con caché del CDN)
Web Worker (en el navegador): shift-and-stack + búsqueda de candidatos
usuario clasifica ─► POST /votes (en lotes) ─► Worker ─► D1
Worker compara con inyecciones → confiabilidad del usuario y completitud del mosaico

          (3) COORDINACIÓN: Worker
"pedir campo nuevo" ─► Worker valida ─► registra en D1 ─► dispara workflow de GitHub Actions
                       (API de GitHub, token guardado como secreto del Worker) ─► vuelve a (1)
consulta rápida RA/Dec ─► Worker pregunta a TAP/SkyBoT (subpeticiones, ≤50) ─► vista rápida
```

---

## 6. Formato de un mosaico (contrato de datos entre Python y Web)
Carpeta `tiles/<tile_id>/` en R2:
| Archivo | Contenido |
|---|---|
| `manifest.json` | `tile_id`, RA/Dec del centro, FOV, data release (`DR1`), versión del pipeline, N de cuadros, forma del arreglo, escala de píxel, WCS de referencia, fecha de proceso |
| `frames.json` | Por cuadro: `obs_id`, detector, `t_mid` (MJD), **λ central**, ancho de banda, fracción enmascarada, ruido estimado |
| `residuals.f16.bin` | Cubo `[N, H, W]` de residuos en float16 (little-endian) |
| `science.f16.bin` | (Opcional) cuadros alineados sin restar, para el flipbook "experto" |
| `mask.u8.bin` | Máscara combinada (FLAGS + estrellas brillantes de Gaia) |
| `gaia.json` | Fuentes Gaia DR3 del campo con posiciones **propagadas** a cada época |
| `known.json` | Objetos de SkyBoT/MOST con su posición por cuadro |

- **Las inyecciones van mezcladas dentro de `residuals.f16.bin`**, pero su lista **NO** está en el mosaico: vive solo en D1. Si estuviera en el archivo, cualquiera podría hacer trampa.
- Escribir un `tile.schema.json` (JSON Schema) y validarlo en CI, así Python y Web no se rompen entre sí.

---

## 7. Base de datos (D1), tablas mínimas
| Tabla | Campos | Visible para el público (vía Worker) |
|---|---|---|
| `tiles` | id, ra, dec, fov, release, estado (`queued/processing/ready`), n_frames, completitud | Sí |
| `candidates` | id, tile_id, x, y, t_ref, tipo sugerido, score del pipeline | Sí |
| `injections` | id, tile_id, trayectoria, magnitud | **No** (solo lógica interna del Worker) |
| `votes` | id, user_id (UUID anónimo), candidate_id o injection_id, etiqueta, tiempo de respuesta | Solo inserción |
| `users` | id anónimo, alias opcional, confiabilidad calculada, n_votos | Alias y conteo, sí |

La confiabilidad se calcula en el Worker al recibir un lote de votos (¿cayó alguno sobre una inyección?). **Poner índices** en `tile_id` y `candidate_id` para no gastar filas leídas con escaneos completos.

**Endpoints mínimos del Worker:** `GET /api/tiles`, `GET /api/tiles/:id/candidates`, `POST /api/votes` (lote), `GET /api/stats` (mapa de cobertura y exclusión), `POST /api/request-tile`.

---

## 8. Buenas prácticas con IRSA (no abusar del archivo de NASA)
- Máximo **4-8 descargas en paralelo**, con reintentos y espera exponencial (hay 5-20 % de fallas, doc 02).
- **Caché:** nunca bajar dos veces el mismo recorte. Guardar por `obs_id` + centro + tamaño (en la caché de GitHub Actions).
- Identificar el cliente con un User-Agent genérico del proyecto (sin datos personales).
- **TAP puede tardar** (hoy una consulta sin filtros superó los 60 s). Siempre filtrar por posición (`CONTAINS(POINT..., CIRCLE...)`) y pedir solo las columnas necesarias.
- **[verificar el día 1]** si el Cutout Service responde con cabeceras CORS. Si sí, el navegador puede pedir recortes directo. Si no, se pasa por un Worker (ojo con el tope de subpeticiones y el de CPU: solo para vistas rápidas pequeñas).

---

## 9. Estructura del repositorio (un solo repo público)
```
/pipeline              Python (precálculo, corre en GitHub Actions)
  query.py             TAP: cuadros de un campo
  cutouts.py           descarga en paralelo + caché + reintentos
  align.py             reproject + ZODI + FLAGS
  spectral_sub.py      ★ resta espectral (doc 10, innovación 1)
  inject.py            objetos sintéticos (verdad → D1)
  export_tile.py       escribe tiles/<id>/ y los sube a R2 (S3 API)
  characterize.py      fotometría forzada (espectro) + distancia por paralaje
/web                   React + Vite (se despliega en Pages)
  src/workers/stack.worker.ts   shift-and-stack en el navegador
  src/views/Classify.tsx        clasificación (celular primero)
  src/views/Expert.tsx          flipbook, diferencias, FLAGS, Gaia (enunciado)
  src/views/Map.tsx             mapa de cobertura y exclusión
/api                   Worker en TypeScript (Hono) + wrangler.toml con bindings a D1 y R2
/migrations            SQL de D1 (esquema de la sección 7)
/data-contract         tile.schema.json
/.github/workflows
  build-tiles.yml      matriz de mosaicos (manual o disparado por el Worker)
/docs                  esta carpeta
```

---

## 10. Qué hace cada uno (primeros 30-40 min)
| Persona | Tareas |
|---|---|
| **Quien tenga la cuenta Cloudflare (1 persona)** | Crear la cuenta · bucket R2 `naylamp-tiles` · base D1 `naylamp-db` · invitar al resto como miembros · **crear el token de API de R2 (S3)** y el de D1/Workers |
| Python/datos | Repo público en GitHub · secretos de Actions: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `CF_API_TOKEN`, `CF_ACCOUNT_ID` · primer workflow que suba un mosaico de prueba |
| Web | Proyecto de Pages conectado al repo (raíz `/web`) · esqueleto con ruta y URL con parámetros (`?ra=&dec=&fov=`) |
| Apoyo/API | `wrangler init` en `/api` · bindings a D1 y R2 · migración inicial · endpoints de la sección 7 · secreto del Worker con el token de GitHub (permiso de `workflow`) |
| Todos | **Nadie sube claves al código**: `.env` local (en `.gitignore`) y secretos en Actions y Workers |

Comandos útiles (una vez con `npm i -g wrangler` y `wrangler login`):
```bash
wrangler r2 bucket create naylamp-tiles
wrangler d1 create naylamp-db
wrangler d1 migrations apply naylamp-db --remote
wrangler deploy
```

---

## 11. Plan B si algo falla
| Falla | Plan B |
|---|---|
| R2 pide tarjeta y no se puede | Mosaicos como archivos estáticos dentro de Pages (la demo <300 MB) **[verificar topes de Pages]** |
| Se agotan las 100,000 peticiones/día | Interfaz funciona sin guardar; votos en `localStorage` y se envían al día siguiente |
| Se agotan las escrituras de D1 | Votos en lotes de 10-20; si persiste, el Worker los acumula en R2 como archivos y se cargan después |
| GitHub Actions lento o con cola | Precalcular la demo en laptops/Colab y subir a mano con `wrangler r2 object put` |
| IRSA lenta el domingo | Todo lo de la demo ya precalculado el sábado por la noche |
| Python en el Worker | **No usarlo.** El Worker es TypeScript y trivial; el Python vive en Actions |
