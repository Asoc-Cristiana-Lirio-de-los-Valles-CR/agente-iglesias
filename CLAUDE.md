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
- ✅ 101/101 tests
- ✅ Typecheck limpio

## Comandos

```bash
# Desarrollo
npm run dev               # tsx watch src/index.ts — servidor web en http://localhost:3000
npm run build             # tsc -p tsconfig.json — compila servidor a dist/
npm start                 # node dist/index.js — ejecuta el build compilado
npm run typecheck         # tsc --noEmit (servidor + electron)

# Tests
npm test                  # vitest run — 101 pruebas unitarias (sin red ni FreeShow)
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

**Agente para Iglesias**: plataforma modular de servicios para iglesias. El **Módulo 1** (único implementado) genera automáticamente presentaciones bíblicas en **FreeShow**: a partir de una lista de referencias (`Mateo 2:2-6 NTV`) crea un show por referencia dentro del **proyecto fijo `Versiculos`** en FreeShow, con una diapositiva por versículo (título = `Libro Cap:Vers`, contenido = texto, pie = versión). El proyecto se sincroniza en cada ejecución para reflejar exclusivamente el lote más reciente.

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
3. `showBuilder.buildShow()` — construye el JSON `Show`. **Los ids de slides y layouts son deterministas** (función `stableId` via djb2 hash sobre `bookName-chapter-verse-version`) para que `sameContent()` en el sincronizador detecte contenido idéntico entre ejecuciones.
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
2. Clasifica los shows del proyecto: filtra primero los items de media (`type != "show"`) y referencias colgantes (id ausente en `get_shows`) para no llamar `get_show` sobre ellos (esas llamadas cuelgan ~10s en FreeShow). Los válidos se leen en paralelo (`Promise.all`). Con tag → administrado; sin tag → **contenido del usuario, nunca se toca**. Si `get_shows` falla o devuelve vacío → fallback a leer todos individualmente.
3. Empareja shows administrados por `name` con los items deseados.
4. **Reutiliza** (mismo id): llama `set_show` en paralelo (máx 5 simultáneos via `mapWithConcurrency`) solo si `sameContent()` detecta diferencia (compara `name/category/meta/slides/layouts` con `sortKeysDeep` para neutralizar diferencias de orden de claves).
5. **Crea** items sin show administrado existente: **secuencial** — `selectProject` → snapshot → `createShow` → polling con backoff [50,100,150…ms] hasta detectar id nuevo por diferencia de snapshot → `setShow` → `addToProject`. No paralelizar: el id se obtiene por diff de snapshot y creaciones concurrentes harían ambigua la asignación.
6. **Desvincula** shows administrados sobrantes (`removeProjectItem`, índice descendente).
7. Devuelve `SyncResult { created, updated, unchanged, unlinked, ignoredUserShows }`.

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

El diseño de diapositivas (posición, tipografía, color) vive en JSON fuera del código. Agregar plantilla = soltar un `.json` en `plantillas/`, sin recompilar.

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

## Bugs corregidos (v1.0.1)

Cuatro bugs corregidos durante el hardening — documentados aquí para no repetirlos:

1. **`mapWithConcurrency` no abortaba tras fallo** (`src/core/utils/concurrency.ts`): con `limit ≥ 2`, cuando un worker fallaba los demás seguían drenando la cola completa. Fix: flag `aborted` + `while (!aborted && ...)`. El bug solo se manifiesta con `limit ≥ 2`; tests con `limit=1` no lo detectan.

2. **`insertVersionAtCurrentLine` rompía el historial de Undo** (`src/web/index.html`): `ta.value = ...` reemplazaba todo el contenido del textarea — Ctrl+Z dejaba de funcionar. Fix: `ta.setRangeText(newLine, lineStart, lineEnd, "end")` reemplaza solo el rango de la línea actual.

3. **`getShows()` vacío generaba shows duplicados** (`ProjectSynchronizer`): si `getShows()` devolvía `[]` (vacío, no error), se creaba un `Set` vacío → `!Set.has(id)` = `true` para todo → todos los shows del proyecto marcados como "colgantes" → iban a `toCreate` → shows duplicados en FreeShow. Fix: `knownShowIds = allShows.length > 0 ? new Set(...) : null`.

4. **`FreeShowService.request()` sin timeout + `res.text()` fuera del try-catch**: cualquier llamada REST podía colgar indefinidamente; si la señal de abort disparaba durante la lectura del cuerpo, la excepción escapaba sin convertirse en `FreeShowError`. Fix: `signal: AbortSignal.timeout(8_000)` en todos los fetch + try-catch unificado que cubre headers y body.

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
npm test                      # verificar 101/101
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
