# CLAUDE.md

Orientaciones para Claude Code (claude.ai/code) al trabajar en este repositorio.

## Idioma

Responder siempre en español. El usuario es Rafael, administra la iglesia "Lirio de los Valles" en Costa Rica.

## Repositorio

**GitHub**: `https://github.com/Asoc-Cristiana-Lirio-de-los-Valles-CR/agente-iglesias`
**Org**: Asoc-Cristiana-Lirio-de-los-Valles-CR
**Rama principal**: `main`
**Versión actual**: 1.0.1

Estado de las fases Electron:
- ✅ Fase A — Electron: ventana + servidor (ESM/NodeNext, ServerManager)
- ✅ Fase B — electron-builder: instalador NSIS `.exe` (79 MB)
- ✅ Fase C — electron-updater: actualizaciones automáticas via GitHub Releases
- ⏳ Fase D — Backup automático pre-update (pendiente)
- ⏳ Fase E — Rollback tras fallo (pendiente)
- ⏳ Fase F — Migraciones versionadas (pendiente)

Estado actual del proyecto:
- ✅ Generación optimizada (~60× más rápida en lotes sin cambios)
- ✅ Watcher de Biblias en tiempo real (≤15s para reflejar cambios)
- ✅ Auto Updates (electron-updater + GitHub Releases)
- ✅ Chips de versión con formato consistente (`CÓDIGO | Nombre`) + toggle activar/desactivar
- ✅ Sincronización con limpieza automática de referencias colgantes (doble verificación anti-carrera)
- ✅ Título+contenido fusionados en un solo bloque centrado (auto-ajuste de fuente + margen real entre ambos)
- ✅ 119/119 tests
- ✅ Typecheck limpio

## Comandos

```bash
# Desarrollo
npm run dev               # tsx watch src/index.ts — servidor web en http://localhost:3000
npm run build             # tsc -p tsconfig.json — compila servidor a dist/
npm start                 # node dist/index.js — ejecuta el build compilado
npm run typecheck         # tsc --noEmit (servidor + electron)

# Tests
npm test                  # vitest run — 119 pruebas unitarias (sin red ni FreeShow)
npm run test:watch        # vitest en modo watch
npm run test:e2e          # requiere FreeShow real corriendo

# Electron
npm run electron:dev      # compila + abre ventana Electron (requiere FreeShow abierto)
npm run electron:build    # compila solo src/electron/ → dist-electron/
npm run dist              # build completo → installer/Agente para Iglesias Setup X.Y.Z.exe
npm run restore:sqlite    # restaurar better-sqlite3 para Node.js después de npm run dist
                          # (dist recompila el addon para Electron y rompe npm test)

# Workflow post-dist (cerrar npm run dev ANTES — file-lock en better-sqlite3)
# npm run dist && npm run restore:sqlite && npm test && npm run typecheck
```

Ejecutar una sola prueba: `npx vitest run test/referenceParser.test.ts` (o `-t "nombre del test"`).

Antes de la primera ejecución: `copy .env.example .env` y ajustar valores.
Nunca poner claves dentro del código fuente; siempre vía `.env`.
`GH_TOKEN` es obligatorio en `.env` para publicar releases — nunca en el repositorio.

## Qué es este proyecto

**Agente para Iglesias**: plataforma modular de servicios para iglesias. El **Módulo 1** (único implementado) genera automáticamente presentaciones bíblicas en **FreeShow**: a partir de una lista de referencias (`Mateo 2:2-6 NTV`) crea un show por referencia dentro del **proyecto fijo `Versiculos`** en FreeShow, con una diapositiva por versículo (título `Libro Cap:Vers` + contenido del versículo fusionados en un solo bloque centrado, pie = versión). El proyecto se sincroniza en cada ejecución para reflejar exclusivamente el lote más reciente.

La arquitectura admite módulos futuros (anuncios, letras, sermones con IA, OBS, Google Calendar/Sheets, control remoto de FreeShow) sin reescribir el núcleo.

## Arquitectura (capas, de arriba hacia abajo)

```
src/web (UI estática)
   → src/server/app.ts (Express, createApp())
      → MÓDULOS (src/modules/*) — implementan PlatformModule, registran sus rutas bajo /api
         → SERVICIOS (src/services/*) — bible, ai, cache, templates, freeshow
            → NÚCLEO (src/core/*, src/config/*) — db (SQLite), logger, config
```

- `src/app/container.ts` construye todo el grafo de dependencias en un solo lugar. `src/index.ts` solo hace `loadConfig() → createContainer() → createApp() → listen()`.
- `src/app/moduleRegistry.ts` define la interfaz `PlatformModule` y monta las rutas.
- El servidor Express (`createApp(container)`) no tiene dependencias del núcleo más allá del contenedor — reutilizable dentro de Electron sin cambios.

### Módulo 1 — `src/modules/scripture/`

Flujo de `ScriptureModule.generate()` (POST `/api/scripture/generate`):
1. `referenceParser.parseReferences()` — parser determinista (sin IA). Acepta abreviaturas, libros numerados (`1 Co 13`), sin `:`, lenguaje natural, mayúsculas/acentos indistintos. Usa `bookNames.ts` (66 libros). Los errores de líneas individuales no rompen el lote. **El `defaultVersion` NO se normaliza** (no se aplica `.toUpperCase()` ni quitar espacios) para preservar nombres reales de FreeShow como `"Reina-Valera 1960"`. Solo se normaliza la versión detectada inline en el texto (`isKnownVersion`/`normalizeVersion` para códigos cortos tipo `RVR1960`).
2. `BibleService.getVerses()` — cache-first.
3. `showBuilder.buildShow()` — construye el JSON `Show`. **Los ids de slides y layouts son deterministas** (función `stableId` via djb2 hash sobre `bookName-chapter-verse-version`) para que `sameContent()` en el sincronizador detecte contenido idéntico entre ejecuciones. Cada diapositiva tiene **2 items** (no 3): título+contenido fusionados en un solo bloque centrado (`buildTitleContentItem`), y el pie aparte (`buildTextItem`). Ver detalle en "Plantillas visuales" más abajo.
4. `ProjectSynchronizer.syncProject("Versiculos", items)` — sincroniza en una sola pasada.
5. Registra en `recent_projects` (SQLite) y devuelve resumen a la UI.

Nombre de show: `Libro Cap:VersIni-VersFin Versión`. Proyecto en FreeShow: siempre `Versiculos`.

`GET /api/scripture/versions` expone las versiones instaladas en FreeShow (escaneo real de `Bibles/*.fsb`), cada una con `{ id, name, code, enabled }`. `PUT /api/scripture/versions/preferences` (body `{ disabled: string[] }`) reemplaza la lista de versiones ocultas de los chips rápidos y devuelve el estado actualizado; persiste en la tabla `config` (key `disabledBibleVersions`, vacío = todas activas). El `<select>` "Versión por defecto" de la UI ignora este filtro — siempre lista todas. `GET /api/scripture/templates` lista plantillas disponibles.

### Integración con FreeShow (`src/services/freeshow/FreeShowService.ts`)

Toda la comunicación encapsulada aquí. Si la API de FreeShow cambia, solo se toca este archivo.

**Comportamientos verificados en producción real (FreeShow 2026):**
- Respuestas con forma `{action, data:{id:{...},...}}` — `toArray()` extrae `Object.entries(obj.data)`, NO itera el objeto raíz.
- `create_show` **no devuelve el id del show** via REST (respuesta vacía). Tampoco `create_project` devuelve id directamente.
- `create_show` normaliza internamente `:` → `,` en el nombre del show (p. ej. `"Juan 3:16"` queda como `"Juan 3,16"`). Por eso `createAndLink` usa **snapshot de proyecto** (antes/después) para obtener el id del show nuevo, no `findShowIdByName`.
- `set_show` sí preserva los dos puntos (`:`) en el nombre — corrige el nombre tras la creación.
- `id_select_project` activa el proyecto en FreeShow UI, lo que hace que `create_show` auto-vincule el show al proyecto correcto.

Acciones usadas: `create_project`, `create_show`, `set_show`, `add_to_project`, `remove_project_item` (índice 1-based en la API pública; `FreeShowService` convierte desde 0-based), `id_select_project`, `get_projects`, `get_shows`, `get_show`, `getProjectShowIds` (helper: `get_projects` + filter).

Formato `Show` (`src/services/freeshow/showFormat.ts`): `slides{id: Slide} → items[] → lines[] → text[{value,style}]` + `layouts{}`.

**Límites verificados de la API de FreeShow:**
- No expone borrado físico de shows (`remove_project_item` solo desvincula; el archivo `.show` queda en disco como huérfano).
- No expone `get_folders`/`create_folder` ni `create_project` con carpeta destino. El proyecto se localiza por nombre exacto.
- Todas las llamadas REST tienen timeout de 8s (`REQUEST_TIMEOUT_MS`). Lanza `FreeShowError` con mensaje diferenciado si es timeout vs fallo de conexión.

### `ProjectSynchronizer` (`src/services/freeshow/ProjectSynchronizer.ts`)

Servicio genérico (no sabe qué es un "versículo"). En cada ejecución, **solo sobre shows con `meta.createdBy === SYNC_TAG` ("AgenteIglesias")**:

1. **Una sola** `get_projects` por sincronización; el resultado se reutiliza en todos los pasos siguientes.
2. Clasifica los shows del proyecto: filtra primero los items de media (`type != "show"`). Los refs tipo "show" (o sin `type`) cuyo id está **ausente en esta primera lectura de `get_shows`** se marcan como **candidatos a colgante** — no se les llama `get_show` (esas llamadas cuelgan ~10s en FreeShow) y no cuentan como `ignoredUserShows` (no son contenido de usuario: no hay show real detrás, son punteros rotos a un `.show` borrado/inexistente). Los refs restantes se leen en paralelo (`Promise.all`). Con tag → administrado; sin tag → **contenido del usuario, nunca se toca**. Si `get_shows` falla o devuelve vacío → fallback a leer todos individualmente (y no se detectan colgantes ese ciclo: sin la lista real, no se puede distinguir un colgante de un show válido).
3. Empareja shows administrados por `name` con los items deseados.
4. **Reutiliza** (mismo id): llama `set_show` en paralelo (máx 5 simultáneos via `mapWithConcurrency`) solo si `sameContent()` detecta diferencia (compara `name/category/meta/slides/layouts` con `sortKeysDeep` para neutralizar diferencias de orden de claves).
5. **Crea** items sin show administrado existente: **secuencial** — `selectProject` → snapshot → `createShow` → polling con backoff [50,100,150…ms] hasta detectar id nuevo por diferencia de snapshot → `setShow` → `addToProject`. No paralelizar: el id se obtiene por diff de snapshot y creaciones concurrentes harían ambigua la asignación.
6. **Desvincula** shows administrados sobrantes (`removeProjectItem`, índice descendente) **y** referencias colgantes reconfirmadas:
   - Antes de eliminar cualquier candidato a colgante, `confirmDangling()` hace una **segunda lectura** de `get_shows()` (solo si hay candidatos — cero llamadas extra en el caso normal) y solo se elimina lo que **sigue ausente en esa segunda lectura**.
   - **Por qué la doble lectura**: evita una condición de carrera donde un show recién vinculado (por ejemplo, creado a mano por el usuario en el mismo instante de la sincronización) todavía no aparecía en la primera lectura pero sí existe realmente — una sola lectura transitoria no basta para justificar borrar una referencia.
   - Si la segunda lectura falla, **no se elimina nada ese ciclo** (conservador; se reintenta en la próxima sincronización).
   - Ambos conjuntos (administrados sobrantes + colgantes reconfirmados) se combinan en una sola lista de índices, ordenada descendente, antes de llamar `removeProjectItem` (mismo patrón de splice-por-índice que ya existía).
7. Devuelve `SyncResult { created, updated, unchanged, unlinked, ignoredUserShows, danglingRemoved }`:
   - `unlinked`: shows **administrados** (tag `AgenteIglesias`) que ya no corresponden a ningún item del lote actual — se desvinculan porque el lote los reemplazó, no porque estén rotos.
   - `danglingRemoved`: referencias cuyo id ya no existe en `get_shows()` — sin contenido real detrás, se limpia el puntero roto.
   - `ignoredUserShows`: shows reales (existen, se pudieron leer) pero sin `meta.createdBy === SYNC_TAG` — contenido genuino del usuario, nunca se toca.

`ProjectSynchronizerOptions { createPollDelaysMs?, updateConcurrency? }` permite inyectar delays y concurrencia (útil en tests sin timers reales). Reutilizable por futuros módulos.

> **⚠ Antes de modificar `ProjectSynchronizer`:**
> - **NO paralelizar `createAndLink`/`create_show`**. FreeShow no devuelve el id del show creado vía REST. El id se obtiene comparando el snapshot del proyecto antes y después de la creación (diff de ids). Con creaciones concurrentes, el diff es ambiguo — no se puede saber qué id corresponde a qué show → shows con JSON incorrecto aplicado.
> - **`set_show` sí puede ir en paralelo** (`mapWithConcurrency`, límite 5) porque el id ya se conoce antes de llamarlo.
> - **No aumentar el límite de concurrencia sin medir**: la API REST de FreeShow corre sobre el hilo principal de Electron; concurrencia alta puede congelar la UI de FreeShow sin mejorar el throughput. El límite 5 se eligió para saturar sin bloquear.

### Proveedores de Biblia — cache-first (`src/services/bible/`)

`BibleService.getVerses()`: caché SQLite → proveedores en orden → guarda en caché → registra en `history`. La caché solo almacena versículos consultados, nunca Biblias completas.

**Prioridad de proveedores** (caso `local` en `providerFactory.ts`):
```
FreeShowBibleProvider → JsonProvider → SqliteProvider → ApiBibleProvider
```

**`FreeShowBibleProvider`** (`src/services/bible/providers/freeshowBibleProvider.ts`) — proveedor principal:
- Lee `<FREESHOW_DATA_PATH>/Bibles/*.fsb`. Default si vacío: `~/Documents/FreeShow`.
- Formato real de archivos `.fsb`: tupla `[id, Bible]` (no objeto plano). Los campos `book.number` y `chapter.number` vienen como **string** en archivos reales exportados (verificado en producción) — se convierten con `Number()` al indexar.
- Soporta `verse.text` y `verse.value` (alias legado de versiones antiguas de FreeShow).
- `resolveFile(version)` busca en este orden: 1) nombre exacto del archivo, 2) código normalizado en mayúsculas, 3) aliases conocidos (`VERSION_ALIASES`: NTV, RVR1960, NVI, TLA, LBLA, DHH/BDHH, PDT…), 4) búsqueda flexible (nombre contiene el código). Esto permite escribir `Juan 3:16 NTV` o `Juan 3:16 Reina-Valera 1960` indistintamente.
- `listAvailableVersions()` devuelve `{ id, name, code }` — `code` **siempre presente** (ya no opcional): el de `VERSION_ALIASES` si el archivo coincide con un alias conocido (NTV, RVR1960…), o autogenerado por iniciales via `deriveInitialsCode()` si no (ej. `"Biblia Jerusalén"` → `"BJ"`, stopwords `de/la/el/en/los/las/un/una/para` excluidas, número final preservado: `"Biblia Latinoamericana 95"` → `"BL95"`). Este código autogenerado es **solo para mostrar** en los chips de la UI — la resolución de versión inline en las referencias (`Juan 3:16 NTV`) sigue usando exclusivamente `VERSION_ALIASES`/`resolveFile`, sin tocar.
- `startWatching(onLog?)` / `stopWatching()` / `invalidate()`: vigila la carpeta `Bibles/` con `fs.watch` (debounce 400ms, retry 30s si la carpeta desaparece). Al arrancar la app (`container.ts`) se inicia automáticamente; al cerrar se limpia. Instalar/quitar un `.fsb` invalida el cache y la UI refleja el cambio en ≤15s. `startWatching` es idempotente; `stopWatching` seguro si nunca inició.
- Solo lectura — nunca escribe en la carpeta de FreeShow.

Otros proveedores: `jsonProvider` (`data/biblias/<VERSION>.json`), `sqliteProvider` (`<VERSION>.db`, tabla `verses`), `apiBibleProvider` (respaldo final, requiere `BIBLE_API_KEY`).

Sin texto bíblico con copyright empaquetado. Solo se incluye RVR1909 (dominio público) en `data/biblias/RVR1909.json` como ejemplo funcional.

### Proveedores de IA (`src/services/ai/`)

Abstracción (`AIProvider`: `complete(prompt, opts?)`) con implementaciones para Claude, OpenAI, Gemini, DeepSeek y Ollama. **El Módulo 1 no la usa** — lista para módulos futuros.

### Plantillas visuales (`src/services/templates/TemplateService.ts` + `plantillas/*.json`)

El diseño de diapositivas (posición, tipografía, color) vive en JSON fuera del código. Agregar plantilla = soltar un `.json` en `plantillas/`, sin recompilar. `TemplateService` cachea cada plantilla en memoria tras la primera carga — editar un `.json` existente requiere reiniciar el proceso para que se refleje.

**`Escritura.json` — bug corregido**: el bloque `title` tenía `width=0, height=0, fontSize=1, color=#000000` (invisible: caja de tamaño cero, texto negro sobre fondo negro). `showBuilder.buildShow()` ya generaba el texto del título correctamente (`${bookName} ${chapter}:${verse}`) — el problema era **exclusivamente de configuración de la plantilla**, no del código generador. Verificado contra FreeShow real vía `get_show()` antes y después del fix. Valores actuales: `top=40, left=100, width=1720, height=130, fontSize=70, color=#FFFFFF, bold=true` (left/width alineados con los márgenes de `content`; `fontSize` subido de 60 a 70 tras feedback visual de Rafael — el título se veía chico junto al cuerpo).

**Título+contenido fusionados en un solo bloque** (`src/modules/scripture/showBuilder.ts`): `title` y `content` siguen siendo dos cajas independientes en cada plantilla (tipografía propia: fuente/tamaño/color/negrita), pero su **geometría** se fusiona en tiempo de construcción en un solo `FsItem` con 2 `lines` (título, luego número+texto del versículo), centrado como una sola unidad — no dos cajas centradas por separado con un hueco fijo entre ellas. No se toca ningún archivo de `plantillas/*.json` ni el esquema (`TemplateBox`/`SlideTemplate`): todo se deriva de `title`+`content` tal como ya existen.
- `combineTitleAndContentBox(titleBox, contentBox)`: envolvente vertical de ambas cajas (`top` = la más alta, `bottom` = la más baja). Horizontal: usa `left`/`width` de **`content`**, no una unión — 2 de las 5 plantillas (`Conferencia`, `LirioDeLosValles`) tienen `left`/`width` distintos entre `title` y `content` (ambos centrados en el mismo eje x=960 igual, solo con anchos de ajuste distintos); `content` es la caja cuyo ancho determina el word-wrap del texto largo, `title` es siempre una referencia corta de una sola línea.
- `contentHeightBudget(titleBox, contentBox)`: presupuesto de alto para el `fitFontSize` del cuerpo — el alto combinado menos una línea de título (`titleBox.fontSize * LINE_HEIGHT_RATIO`, redondeada hacia arriba) menos `TITLE_GAP` (24px). Antes de esta constante, el "margen" solo existía en el cálculo — no se traducía en ningún espacio real en el render, por eso título y texto se veían pegados aunque el número diera positivo (bug real, detectado por Rafael viendo el resultado en FreeShow, no por los tests). Fix: `TITLE_GAP` ahora se aplica **también** como `margin-top:24px;` real en la línea de contenido (`buildTitleContentItem`) — un solo número gobierna tanto el presupuesto matemático como el espacio visual, así no pueden desincronizarse.
- El título nunca pasa por `fitFontSize` (siempre conserva el tamaño de la plantilla) — solo el cuerpo del versículo se auto-ajusta.
- **`LINE_HEIGHT_RATIO` (1.35)** — mismo patrón de bug que `TITLE_GAP`: se usaba solo para estimar el desborde en `fitFontSize`/`contentHeightBudget`, nunca se aplicaba como `line-height` real en el CSS generado (`textStyle()`) — el espaciado entre líneas que se veía en FreeShow era el default de FreeShow, no algo controlado por el agente. Fix: `textStyle()` ahora emite `line-height:${LINE_HEIGHT_RATIO};` real en todo texto (título/contenido/pie) — un solo número gobierna tanto la estimación de desborde como el espaciado visual real entre líneas. Subido de 1.25 a 1.35 a pedido de Rafael (quería más espacio entre líneas del versículo).

### Base de datos SQLite (`src/core/db/`)

`migrations.ts` (idempotente) crea las tablas al arrancar: `verses_cache`, `history`, `recent_projects`, `favorites`, `config`, `translations`, `logs`. Cada tabla tiene su repositorio en `src/core/db/repositories/`.

## Electron — empaquetado e instalador Windows

El proyecto corre como **aplicación Electron** con instalador **NSIS `.exe`** generado por `electron-builder`.

### Arquitectura Electron

```
src/electron/
  main.ts       ← proceso principal ESM/NodeNext; inyecta rutas antes de importar servidor
  preload.ts    ← contextBridge mínimo (sandbox seguro)
  updater.ts    ← electron-updater: check/download/dialog/quitAndInstall
src/server/
  ServerManager.ts ← start()/stop()/url — encapsula ciclo de vida del servidor Express
tsconfig.electron.json ← NodeNext, rootDir:src, outDir:dist-electron
electron-builder.yml   ← NSIS + extraResources + publish GitHub
```

### Rutas en runtime

| Recurso | Desarrollo | Empaquetado (Electron) |
|---|---|---|
| `DB_PATH` | `./data/app.db` | `%APPDATA%\Agente para Iglesias\data\app.db` |
| `LOCAL_BIBLE_PATH` | `./data/biblias` | `resources/data/biblias` |
| `TEMPLATES_PATH` | `./plantillas` | `resources/plantillas` |
| Web estática | `src/web/` | `resources/web/` |
| `.env` usuario | `./` | `%APPDATA%\Agente para Iglesias\.env` |

`main.ts` inyecta las rutas de producción en `process.env` ANTES de importar el servidor.

### Actualizaciones automáticas (electron-updater)

- **Canal**: `UPDATE_CHANNEL=stable|beta` en `.env` del usuario.
- **Servidor**: GitHub Releases de `Asoc-Cristiana-Lirio-de-los-Valles-CR/agente-iglesias`.
- **Flujo**: check al arrancar (10s delay) + cada 24h → descarga background → dialog nativo → `quitAndInstall()`.
- **Publicar**: cerrar `npm run dev` → `GH_TOKEN` en `.env` → `npm run dist -- --publish always` (genera instalador, crea GitHub Release y sube artifacts con nombres correctos en un solo paso). Si se sube manualmente vía API, GitHub convierte espacios a puntos en los nombres de assets (`Agente.para...`) pero `latest.yml` espera guiones (`Agente-para...`) — mismatch que rompe el auto-update; hay que re-subir con nombre correcto.
- **Firmar**: sin certificado de código por ahora (Windows mostrará advertencia de seguridad).

### Problema conocido: better-sqlite3 ABI

`npm run dist` recompila `better-sqlite3` para Electron (NMV 125). Después, `npm test` falla porque Node.js 24 necesita NMV 137. node-gyp 9.4.1 no detecta VS Build Tools 2026 (v18.x); se usa node-gyp 12.2.0 (bundled en npm 11):

```bash
npm run restore:sqlite   # restaura el addon para Node.js 24
```

**File-lock en Windows (lección aprendida)**: antes de ejecutar `npm run dist`, cerrar cualquier instancia de `npm run dev`, `tsx watch` o Electron del proyecto. En Windows, `better_sqlite3.node` queda bloqueado mientras el proceso está activo y `electron-builder` falla con `EPERM: operation not permitted, unlink better_sqlite3.node`. Para identificar el proceso bloqueador: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,CommandLine`.

### Ícono pendiente (próxima fase)

Ícono actual (`assets/icon.ico`) = `logos/Negro.png` incrustado como PNG único. Pendiente versión multi-resolución 16/32/48/256px con `png-to-ico` para mejor legibilidad en barra de tareas.

## Variables de entorno relevantes (`.env.example`)

| Variable | Descripción |
|---|---|
| `FREESHOW_DATA_PATH` | Raíz de datos de FreeShow. Vacío = `~/Documents/FreeShow` |
| `BIBLE_PROVIDER` | `local` (FreeShow→JSON→SQLite→API) o `apibible`/`json`/`sqlite` |
| `BIBLE_API_KEY` | Clave API.Bible (solo como respaldo final) |
| `LOCAL_BIBLE_PATH` | Ruta de biblias JSON/SQLite locales propias |
| `TEMPLATES_PATH` | Ruta de plantillas (inyectada por Electron en producción) |
| `DEFAULT_VERSION` | Versión cuando la referencia no especifica una |
| `UPDATE_CHANNEL` | `stable` (default) o `beta` — canal de actualizaciones |
| `GH_TOKEN` | Token GitHub para publicar releases (NUNCA en el repo) |
| `DRY_RUN` | `true` = registra JSON sin enviar nada a FreeShow |
| `LOG_LEVEL` | `error`/`warn`/`info`/`debug` |

## Cómo extender

**Módulo nuevo**: crear `src/modules/<modulo>/TuModulo.ts` implementando `PlatformModule`, registrarlo en `src/app/container.ts`. No se toca nada más.

**Proveedor de Biblia o IA nuevo**: implementar `BibleProvider`/`AIProvider`, añadirlo al `providerFactory.ts` correspondiente.

## Concurrencia

`mapWithConcurrency(items, limit, fn)` — helper en `src/core/utils/concurrency.ts`:
- Límite actual para `set_show`: **5**. No aumentar sin medir — la API REST de FreeShow corre sobre el hilo principal de Electron y una concurrencia alta puede congelar la UI sin mejorar el throughput. Con 5 workers simultáneos el cuello de botella pasa a ser la latencia de red, no el procesador de FreeShow.
- Flag `aborted`: si un worker falla, los demás dejan de tomar nuevos items del la cola (`while (!aborted && ...)`). Semántica equivalente a `Promise.all` — primer fallo cancela el lote.
- `createPollDelaysMs` inyectable en tests para evitar `setTimeout` reales: `new ProjectSynchronizer(fs, logger, { createPollDelaysMs: [0, 0] })`.

## Rendimiento (v1.0.1)

Optimizaciones implementadas para reducir el tiempo de generación de ~10s a ~0.17s en lotes sin cambios (~60×):

- **`ProjectSynchronizer` — una sola `get_projects`**: antes se llamaba 3 veces por sincronización; ahora se llama una vez al inicio y el resultado se pasa a todos los métodos internos.
- **`classifyExistingShows` — `get_show` en paralelo**: antes secuencial; ahora `Promise.all` sobre los shows válidos (filtrados previamente). Límite de 5 actualizaciones simultáneas via `mapWithConcurrency`.
- **Filtrado previo a `get_show`**: items de media (`type != "show"`) y referencias colgantes (id ausente en `get_shows`) se descartan antes de llamar `get_show`, que cuelga ~10s en FreeShow para esos casos.
- **`ScriptureModule` — `Promise.allSettled`**: versículos de todas las referencias se buscan en paralelo; un fallo en una referencia no bloquea las demás.
- **Watcher de Biblias (`fs.watch` + `invalidate()`)**: en vez de escanear en cada consulta, se escanea una vez y se invalida el caché solo cuando cambia la carpeta `Bibles/`. Debounce 400ms, retry 30s si la carpeta desaparece.
- **Limpieza de colgantes — segunda `get_shows()` solo si hace falta**: `confirmDangling()` solo ejecuta la llamada de reconfirmación cuando hay candidatos a colgante; si no hay ninguno (caso normal, la mayoría de sincronizaciones), cero llamadas extra. Sigue siendo O(n) sobre el total de shows de FreeShow (un `Set`, un filtro, sin recorridos anidados) — el comportamiento y costo cuando no hay referencias colgantes no cambia respecto a antes.

## Bugs corregidos (v1.0.1)

Diez bugs corregidos durante el hardening — documentados aquí para no repetirlos:

1. **`mapWithConcurrency` no abortaba tras fallo** (`src/core/utils/concurrency.ts`): con `limit ≥ 2`, cuando un worker fallaba los demás seguían drenando la cola completa. Fix: flag `aborted` + `while (!aborted && ...)`. El bug solo se manifiesta con `limit ≥ 2`; tests con `limit=1` no lo detectan.

2. **`insertVersionAtCurrentLine` rompía el historial de Undo** (`src/web/index.html`): `ta.value = ...` reemplazaba todo el contenido del textarea — Ctrl+Z dejaba de funcionar. Fix: `ta.setRangeText(newLine, lineStart, lineEnd, "end")` reemplaza solo el rango de la línea actual.

3. **`getShows()` vacío generaba shows duplicados** (`ProjectSynchronizer`): si `getShows()` devolvía `[]` (vacío, no error), se creaba un `Set` vacío → `!Set.has(id)` = `true` para todo → todos los shows del proyecto marcados como "colgantes" → iban a `toCreate` → shows duplicados en FreeShow. Fix: `knownShowIds = allShows.length > 0 ? new Set(...) : null`.

4. **`FreeShowService.request()` sin timeout + `res.text()` fuera del try-catch**: cualquier llamada REST podía colgar indefinidamente; si la señal de abort disparaba durante la lectura del cuerpo, la excepción escapaba sin convertirse en `FreeShowError`. Fix: `signal: AbortSignal.timeout(8_000)` en todos los fetch + try-catch unificado que cubre headers y body.

5. **Título invisible en la plantilla `Escritura`** (`plantillas/Escritura.json`): bloque `title` con `width=0, height=0, fontSize=1, color=#000000` — invisible independientemente del texto generado. `showBuilder.ts` ya generaba el texto correctamente; el bug era solo de configuración de plantilla, confirmado comparando el JSON real de un show generado (`get_show()`) contra el archivo de plantilla. Fix: caja real `top=40, left=100, width=1720, height=130, fontSize=60, color=#FFFFFF, bold=true`.

6. **Referencias colgantes nunca se limpiaban** (`ProjectSynchronizer`): ids de shows borrados/inexistentes (`.show` eliminado en FreeShow) quedaban como referencias rotas en el proyecto para siempre — se mostraban como "Sin nombre" en la UI de FreeShow. `classifyExistingShows` ya las detectaba (para evitar el hang de ~10s de `get_show` sobre un id inexistente) pero nunca las desvinculaba, solo las contaba como `ignoredUserShows`. Fix: se desvinculan automáticamente en cada sincronización (`removeProjectItem`).

7. **Protección contra condiciones de carrera en la limpieza de colgantes**: para no arriesgar desvincular una referencia que en realidad sí es válida (por ejemplo un show recién creado a mano que la primera lectura de `get_shows()` aún no reflejaba), se agrega `confirmDangling()`: segunda lectura de confirmación justo antes de eliminar — solo se elimina lo que sigue ausente en ambas lecturas. Si la segunda lectura falla, no se elimina nada ese ciclo.

8. **Métricas de `SyncResult` mezclaban conceptos distintos**: antes, referencias colgantes (punteros rotos) y contenido real de usuario sin tag (shows genuinos que no son nuestros) compartían el mismo contador `ignoredUserShows`, dificultando diagnosticar "cuántas referencias rotas hay" vs "cuánto contenido ajeno hay realmente". Fix: nuevo campo `danglingRemoved` separado (ver sección `ProjectSynchronizer` arriba).

9. **Hueco desproporcional entre título y contenido** (`showBuilder.ts`): `title` y `content` eran dos cajas independientes, cada una centrada por separado dentro de su propio alto fijo — el espacio entre ambas variaba según cuánto texto tuviera el versículo, sin relación visual con el título (reportado por Rafael viendo el resultado real en FreeShow). Fix: fusionados en un solo `FsItem` con 2 líneas (`buildTitleContentItem`), centrado como una unidad — ver "Plantillas visuales" arriba.

10. **`TITLE_GAP` no tenía efecto visual real**: al implementar el fix anterior, el margen entre título y contenido se restaba únicamente del presupuesto de `fitFontSize` (afectaba solo cuándo se reducía la fuente) pero nunca se traducía en un espacio real en el render — FreeShow apilaba las dos líneas sin ningún margen entre ellas, viéndose "pegadas". Detectado por Rafael con una captura real de FreeShow (los tests unitarios y la verificación por API no lo detectaron, porque el JSON generado era coherente consigo mismo — el error era la brecha entre "coherente" y "con efecto visual real"). Fix: `TITLE_GAP` (24px) ahora se aplica también como `margin-top` real en la línea de contenido — un solo número gobierna ambos efectos.

## Limitaciones conocidas (API de FreeShow)

- **Huérfanos en disco**: shows desvinculados por `remove_project_item` quedan como archivos `.show` en disco de FreeShow (la API no expone borrado físico). Están fuera de cualquier proyecto; no afectan la UI ni el sistema.
- **Sin control de carpeta**: el proyecto `Versiculos` se localiza por nombre exacto; no es posible garantizar en qué carpeta queda vía API. El usuario puede moverlo manualmente en FreeShow después de la primera generación.
- **Shows de diagnóstico**: en el proyecto `Versiculos` de Rafael pueden existir shows de prueba creados durante el desarrollo (`TestDiag123`, etc.) sin `meta.createdBy`. El sincronizador los ignora correctamente (`ignoredUserShows`). Eliminables manualmente en FreeShow.

## Git — flujo de trabajo

```bash
# Desarrollo normal
git add -p                    # revisar cambios antes de commit
git commit -m "tipo: mensaje"
git push

# Publicar nueva versión con instalador
# 0. Cerrar npm run dev (evita file-lock en better-sqlite3 durante dist)
git add -p && git commit -m "feat: ..."   # commit de funcionalidades primero
npm version patch             # bumps version + commit + tag (ej. 1.0.1 → 1.0.2)
# GH_TOKEN válido con scope "repo" en .env (verificar antes)
npm run dist -- --publish always          # build + release + upload en un paso
npm run restore:sqlite        # restaurar better-sqlite3 para Node.js
npm test                      # verificar 119/119
npm run typecheck             # sin errores TypeScript
```

**No commitear jamás**: `.env` (tiene `GH_TOKEN`), `node_modules/`, `dist/`, `dist-electron/`, `installer/`.

## Restricciones importantes

- Nunca incluir claves API en el código — siempre vía `.env`.
- No empaquetar texto bíblico con copyright (NTV, RVR1960, NVI, etc.).
- `DRY_RUN=true` deshabilita completamente las escrituras a FreeShow (incluido `ProjectSynchronizer`). Solo registra el JSON en logs.
- No modificar archivos en `Bibles/` de FreeShow — acceso exclusivamente de lectura.
- `GH_TOKEN` en `.env` — nunca en el repositorio.

## Pendientes (post v1.0.1)

### Decisiones inmediatas
- **`pasos Electron.txt`**: archivo con notas de la Fase A, sin commitear desde v1.0.1. Opciones: `git commit` con mensaje `docs: notas sesión Fase A Electron`, `git restore` (descartarlo), o añadir a `.gitignore`. Actualmente aparece como `modified` en cada `git status` — ruido.
- **GH_TOKEN**: token nuevo creado el 2026-07-14 (usuario `soporteLirio`). Anotar la fecha de vencimiento del token en un lugar seguro. Si expira, `npm run dist -- --publish always` fallará en silencio.

### Próxima versión (v1.1.0 sugerida)
- **Fase D — Backup automático pre-update** *(alta prioridad)*: antes de `quitAndInstall()`, copiar `app.db` a `app.db.bak`. Sin esto, una actualización con cambios de esquema SQLite puede romper instancias en campo sin posibilidad de rollback.
- **Fase E — Rollback tras fallo**: si la app no arranca tras update, restaurar `app.db.bak` y bajar a la versión anterior.
- **Fase F — Migraciones versionadas**: sistema de migraciones numeradas con control de versión de esquema en la BD.
- **Ícono multi-resolución**: `assets/icon.ico` es PNG único incrustado. Generar versión 16/32/48/256px con `png-to-ico` para mejor legibilidad en barra de tareas.
- **GitHub Actions / CI**: actualmente cada release depende del entorno local limpio. Automatizar con workflow que ejecute `npm test` + `npm run typecheck` en cada push a `main`.

### Documentación pendiente
- Guía de primer uso: configurar `.env`, activar API en FreeShow (Settings → Connections), verificar `FREESHOW_DATA_PATH`.
- Sección `test:e2e`: qué prueba, qué necesita FreeShow corriendo, qué escenarios cubre.

## Changelog

### Sin publicar (sobre v1.0.1, sin bump de versión aún)
- Chips de versión: formato consistente `CÓDIGO | Nombre completo` para las 18/15 Biblias instaladas (antes mezclaba código corto y nombre completo segun tuviera alias en `VERSION_ALIASES`).
- `deriveInitialsCode()` (`freeshowBibleProvider.ts`): código corto autogenerado por iniciales para versiones sin alias conocido — solo para mostrar, no afecta la resolución de referencias inline.
- Nuevo endpoint `PUT /api/scripture/versions/preferences`: activar/desactivar qué versiones aparecen como chip (persistido en `config`, key `disabledBibleVersions`, todas activas por defecto). Panel ⚙ en la UI junto a "Versiones instaladas".
- Limpieza manual de duplicados reales en la carpeta `Bibles/` de FreeShow de Rafael (18 → 15 archivos): `RVC.fsb` (duplicado de `Reina-Valera Contemporanea.fsb`), `Reina Valera Gómez 2004.fsb` sin guion (duplicado byte-a-byte de `Reina-Valera Gómez 2004.fsb`), y `Dios Habla Hoy.fsb` (misma traducción que `Biblia Dios Habla Hoy.fsb` pero con 6417 entidades HTML `&quot;` mal decodificadas — corrupto, se conservó la copia limpia).
- 10 tests nuevos (91 → 101): 7 de `deriveInitialsCode`, 3 de `getVersions`/`setDisabledVersions`.
- `ProjectSynchronizer`: nuevo algoritmo de limpieza automática de referencias colgantes (ids sin show real detrás, mostrados como "Sin nombre" en FreeShow) — doble verificación de `get_shows()` antes de eliminar para evitar falsos positivos por condiciones de carrera. Nuevo campo `SyncResult.danglingRemoved`, separado de `unlinked` e `ignoredUserShows`.
- Plantilla `Escritura.json`: título ahora visible (antes `width=0,height=0,fontSize=1,color=#000000` — invisible). Nuevo: `top=40,left=100,width=1720,height=130,fontSize=60,color=#FFFFFF,bold=true`. El texto del título ya se generaba correctamente en `showBuilder.ts`; el bug era solo de configuración de plantilla.
- 4 tests nuevos (101 → 105): limpieza de colgantes, coexistencia con shows administrados y contenido real de usuario, reconfirmación que revierte un falso positivo (carrera simulada), fallo de la reconfirmación (no elimina nada), exclusión de multimedia de la detección de colgantes.
- `showBuilder.ts`: título y contenido de cada diapositiva fusionados en un solo `FsItem` con 2 líneas (`buildTitleContentItem`, `combineTitleAndContentBox`, `contentHeightBudget`) — antes eran 2 cajas independientes cada una centrada por separado, dejando un hueco entre ambas sin relación proporcional con el texto. No se tocó ninguna plantilla ni el esquema de `TemplateBox`/`SlideTemplate`: la geometría combinada se deriva en tiempo de construcción de `title`+`content` tal como ya existían. El título nunca se auto-ajusta (conserva siempre el tamaño de la plantilla); solo el cuerpo pasa por `fitFontSize`, ahora con un presupuesto de altura que reserva la línea del título + `TITLE_GAP` (24px).
- `TITLE_GAP`: un solo número gobierna tanto el presupuesto de `fitFontSize` como el `margin-top` real aplicado a la línea de contenido — evita que ambos conceptos se desincronicen (el primer intento solo lo aplicaba al cálculo, sin efecto visible en el render; corregido tras revisión visual real en FreeShow).
- 13 tests nuevos (105 → 118): `combineTitleAndContentBox` (Escritura y una plantilla con geometría title/content distinta), `contentHeightBudget` (valores exactos), título nunca se auto-ajusta, `margin-top` real presente en la línea de contenido, geometría del bloque fusionado con plantilla de anchos distintos (`LirioDeLosValles`), más la reescritura de los tests existentes que asumían 3 items por diapositiva (ahora 2). Un test intermedio (límite exacto de líneas para demostrar la reserva de altura) se removió por depender demasiado ajustadamente de constantes tunables (`TITLE_GAP`) — la aritmética exacta ya queda anclada por los tests de `contentHeightBudget`.
- Ajustes visuales tras revisión real en FreeShow (capturas de Rafael, no solo API): `Escritura.json` título `fontSize` 60→70 (se veía chico junto al cuerpo). `LINE_HEIGHT_RATIO` (`showBuilder.ts`) 1.25→1.35, y ahora se aplica **también** como `line-height` real en `textStyle()` — mismo bug que `TITLE_GAP`: antes solo gobernaba la estimación de desborde de `fitFontSize`, sin ningún efecto en el espaciado real entre líneas del texto renderizado.
- 1 test nuevo (118 → 119): `line-height` real presente y sincronizado con `LINE_HEIGHT_RATIO` en el texto del versículo.
- Lección operativa: `TemplateService` cachea las plantillas en memoria — un cambio en `plantillas/*.json` (a diferencia de un cambio en `.ts`) no dispara el auto-reinicio de `tsx watch` (no es parte del grafo de módulos importados). Hay que reiniciar el proceso manualmente para que un `.json` editado se refleje.

### v1.0.1
- `ProjectSynchronizer`: una sola `get_projects`, clasificación en paralelo, filtrado de media/refs colgantes → ~60× más rápido en lotes sin cambios.
- `FreeShowBibleProvider`: watcher `fs.watch` (debounce 400ms, retry 30s), `invalidate()` global, `listAvailableVersions()` con código corto (`code?`).
- `FreeShowService`: timeout 8s (`AbortSignal.timeout`), try-catch unificado headers+body, mensajes de error diferenciados timeout vs conexión.
- `ScriptureModule`: búsqueda de versículos en paralelo (`Promise.allSettled`), orden preservado, dedup respeta primer resultado.
- `mapWithConcurrency`: nuevo helper con flag `aborted` para abort-on-first-failure con `limit ≥ 2`.
- UI: chips de versiones instaladas (clic para insertar), panel de ayuda (?), inserción preserva historial Undo (`setRangeText`), refresco automático cada 15s.
- Bugs corregidos: `mapWithConcurrency` abort-flag, `setRangeText` Undo, `getShows()` vacío → duplicados, timeout FreeShowService.
- 23 nuevos tests (91/91 en verde).

### v1.0.0
- Lanzamiento inicial: Módulo 1 (generación de presentaciones bíblicas en FreeShow).
- Instalador NSIS Windows via electron-builder.
- Auto-updates via electron-updater + GitHub Releases.
- Parser de referencias bíblicas determinista (66 libros, abreviaturas, rangos).
- Proveedor FreeShow (.fsb), JSON, SQLite, API.Bible.
- `ProjectSynchronizer`: sincronización con tag `AgenteIglesias`, nunca toca contenido del usuario.
- 68 tests unitarios.
