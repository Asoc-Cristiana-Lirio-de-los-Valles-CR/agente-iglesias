# CLAUDE.md

Orientaciones para Claude Code (claude.ai/code) al trabajar en este repositorio.

## Idioma

Responder siempre en español. El usuario es Rafael, administra la iglesia "Lirio de los Valles" en Costa Rica.

## Comandos

```bash
# Desarrollo
npm run dev               # tsx watch src/index.ts — servidor web en http://localhost:3000
npm run build             # tsc -p tsconfig.json — compila servidor a dist/
npm start                 # node dist/index.js — ejecuta el build compilado
npm run typecheck         # tsc --noEmit (servidor + electron)

# Tests
npm test                  # vitest run — 68 pruebas unitarias (sin red ni FreeShow)
npm run test:watch        # vitest en modo watch
npm run test:e2e          # requiere FreeShow real corriendo

# Electron
npm run electron:dev      # compila + abre ventana Electron (requiere FreeShow abierto)
npm run electron:build    # compila solo src/electron/ → dist-electron/
npm run dist              # build completo → installer/Agente para Iglesias Setup X.Y.Z.exe
npm run restore:sqlite    # restaurar better-sqlite3 para Node.js después de npm run dist
                          # (dist recompila el addon para Electron y rompe npm test)

# Workflow post-dist
# npm run dist && npm run restore:sqlite && npm test
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

`GET /api/scripture/versions` expone las versiones instaladas en FreeShow (escaneo real de `Bibles/*.fsb`). `GET /api/scripture/templates` lista plantillas disponibles.

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

### `ProjectSynchronizer` (`src/services/freeshow/ProjectSynchronizer.ts`)

Servicio genérico (no sabe qué es un "versículo"). En cada ejecución, **solo sobre shows con `meta.createdBy === SYNC_TAG` ("AgenteIglesias")**:

1. Busca/crea el proyecto por nombre exacto.
2. Lee CADA show del proyecto con `get_show` (porque `get_projects` no incluye `meta`) y lo clasifica: con tag → administrado; sin tag o tag distinto → **contenido del usuario, nunca se toca**.
3. Empareja shows administrados por `name` con los items deseados.
4. **Reutiliza** (mismo id): llama `set_show` solo si `sameContent()` detecta diferencia (compara `name/category/meta/slides/layouts` con `sortKeysDeep` para neutralizar diferencias de orden de claves).
5. **Crea** items sin show administrado existente: `selectProject` → snapshot → `createShow` → obtiene id nuevo por diferencia de proyecto → `setShow` → `addToProject`.
6. **Desvincula** shows administrados sobrantes (`removeProjectItem`, índice descendente).
7. Devuelve `SyncResult { created, updated, unchanged, unlinked, ignoredUserShows }`.

Reutilizable por futuros módulos que necesiten su propio proyecto fijo.

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
- **Publicar**: `npm run dist` con `GH_TOKEN` en `.env` → subir artifacts al GitHub Release.
- **Firmar**: sin certificado de código por ahora (Windows mostrará advertencia de seguridad).

### Problema conocido: better-sqlite3 ABI

`npm run dist` recompila `better-sqlite3` para Electron (NMV 125). Después, `npm test` falla porque Node.js 24 necesita NMV 137. node-gyp 9.4.1 no detecta VS Build Tools 2026 (v18.x); se usa node-gyp 12.2.0 (bundled en npm 11):

```bash
npm run restore:sqlite   # restaura el addon para Node.js 24
```

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

## Limitaciones conocidas (API de FreeShow)

- **Huérfanos en disco**: shows desvinculados por `remove_project_item` quedan como archivos `.show` en disco de FreeShow (la API no expone borrado físico). Están fuera de cualquier proyecto; no afectan la UI ni el sistema.
- **Sin control de carpeta**: el proyecto `Versiculos` se localiza por nombre exacto; no es posible garantizar en qué carpeta queda vía API. El usuario puede moverlo manualmente en FreeShow después de la primera generación.
- **Shows de diagnóstico**: en el proyecto `Versiculos` de Rafael pueden existir shows de prueba creados durante el desarrollo (`TestDiag123`, etc.) sin `meta.createdBy`. El sincronizador los ignora correctamente (`ignoredUserShows`). Eliminables manualmente en FreeShow.

## Restricciones importantes

- Nunca incluir claves API en el código — siempre vía `.env`.
- No empaquetar texto bíblico con copyright (NTV, RVR1960, NVI, etc.).
- `DRY_RUN=true` deshabilita completamente las escrituras a FreeShow (incluido `ProjectSynchronizer`). Solo registra el JSON en logs.
- No modificar archivos en `Bibles/` de FreeShow — acceso exclusivamente de lectura.
