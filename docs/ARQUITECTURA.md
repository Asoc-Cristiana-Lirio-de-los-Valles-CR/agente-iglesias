# Arquitectura

Plataforma modular por **servicios** y **módulos**, pensada para crecer sin
rediseñar el núcleo.

## Capas

```
                ┌─────────────────────────────────────┐
   Navegador →  │  src/web (UI)                        │
                └───────────────┬─────────────────────┘
                                │ HTTP /api
                ┌───────────────▼─────────────────────┐
                │  src/server/app.ts (Express)         │
                │  monta las rutas de cada módulo      │
                └───────────────┬─────────────────────┘
                                │
        ┌───────────────────────▼───────────────────────┐
        │  MÓDULOS  (src/modules)                         │
        │   scripture  ← Módulo 1 (versículos)            │
        │   [futuros: anuncios, letras, sermones, ...]    │
        └───────────────────────┬───────────────────────┘
                                │ usan
        ┌───────────────────────▼───────────────────────┐
        │  SERVICIOS  (src/services)                      │
        │   bible · ai · cache · templates · freeshow     │
        └───────────────────────┬───────────────────────┘
                                │ usan
        ┌───────────────────────▼───────────────────────┐
        │  NÚCLEO  (src/core, src/config)                 │
        │   config · logger · db (SQLite) + repositorios  │
        └────────────────────────────────────────────────┘
```

El **contenedor** (`src/app/container.ts`) arma el grafo de dependencias a partir
de la configuración. El **registro de módulos** (`src/app/moduleRegistry.ts`)
monta las rutas de cada módulo.

## Decisiones clave

- **Backend desacoplado del servidor web.** `createApp()` devuelve la app Express;
  `src/index.ts` la levanta. Esto permite empaquetar luego en **Electron**
  reutilizando el mismo backend sin cambios.
- **Proveedores intercambiables.** Biblia e IA se eligen por configuración:
  - Biblia: `BibleProvider` (**freeshow**, json, sqlite, apiBible implementados;
    mysql/postgres documentados como extensión). **FreeShow es la fuente
    principal**: si la versión ya está instalada ahí, se usa exactamente esa,
    sin mantener una copia aparte (ver "Biblias de FreeShow" abajo).
  - IA: `AIProvider` (claude, openai, gemini, deepseek, ollama). **El Módulo 1 no
    usa IA**; queda lista para futuros módulos.
- **Cache-first para versículos** (`BibleService`): proveedores en orden → guardar
  en SQLite local. La caché solo guarda versículos consultados, nunca biblias
  completas.
- **Plantillas en datos, no en código** (`TemplateService` + `plantillas/`).
- **FreeShow encapsulado** (`FreeShowService`): si cambia su API, se toca un archivo.
- **Sincronización de proyectos genérica** (`ProjectSynchronizer`): cualquier
  módulo que necesite mantener un proyecto fijo de FreeShow (no solo Biblia)
  reutiliza este servicio (ver abajo).

## Biblias de FreeShow (`FreeShowBibleProvider`)

FreeShow guarda las Biblias que el usuario importa en archivos `.fsb` (JSON)
dentro de `<carpeta de datos de FreeShow>/Bibles/`. Investigación verificada
contra el código fuente de `ChurchApps/FreeShow`:

- **No existe una API REST/WS de FreeShow para pedir el texto de un versículo.**
  `start_scripture` solo dispara una presentación en vivo, no devuelve texto.
  La única vía de integración real es leer los archivos `.fsb` del disco.
- Formato real en disco: una **tupla `[id, Bible]`**, no un objeto plano.
  `Bible.books[].chapters[].verses[].text` (alias legado: `verse.value`).
- Solo las Biblias **importadas localmente por el usuario** tienen archivo
  `.fsb`; las que FreeShow sirve "en línea" vía API.Bible no tienen copia local
  — para esas sigue haciendo falta `ApiBibleProvider` como respaldo.

`FreeShowBibleProvider` (`src/services/bible/providers/freeshowBibleProvider.ts`)
lee `<FREESHOW_DATA_PATH>/Bibles/*.fsb` en modo **solo lectura** (nunca escribe
ahí), indexa por número de libro canónico (1-66, mismo orden que `bookNames.ts`)
y expone exactamente las versiones presentes en esa carpeta — si el usuario
instala una Biblia nueva en FreeShow, aparece automáticamente sin tocar código.

`GET /api/scripture/versions` expone `listAvailableVersions()` para que la UI
muestre únicamente las traducciones realmente instaladas (sin lista fija en el
HTML). Nota: `VERSIONS` en `src/services/bible/versions.ts` es un catálogo
distinto — lo usa `referenceParser.ts` para *reconocer* un código de versión
dentro del texto que escribe el usuario (ej. distinguir "RVR1960" de un número
de versículo) y `apiBibleProvider` para mapear a ids de API.Bible; no es una
lista de versiones "disponibles" y no se elimina.

### Orden de proveedores (`providerFactory.ts`, caso `local`)

```
FreeShowBibleProvider → JsonProvider → SqliteProvider → ApiBibleProvider (si hay clave)
```

## El proyecto "Versiculos" y `ProjectSynchronizer`

Todos los versículos generados en una ejecución se agrupan en **un único
proyecto fijo de FreeShow llamado `Versiculos`**, administrado en exclusiva por
este sistema (nunca se modifican otros proyectos del usuario).

**Límites verificados en la API pública de FreeShow** (código fuente
`src/frontend/components/actions/api.ts` / `apiHelper.ts`):

- **No hay borrado físico de shows vía REST/WS.** `remove_project_item` solo
  desvincula la referencia del proyecto (`splice` sobre `project.shows`); el
  borrado real del archivo `.show` es un canal IPC interno de Electron, no
  expuesto por la API. Por eso `ProjectSynchronizer` REUTILIZA al máximo los
  shows existentes (`set_show`) en vez de desvincular y recrear todo — solo
  desvincula lo que de verdad sobra. Lo desvinculado no se borra físicamente
  (queda como `.show` huérfano en disco; limpieza física queda fuera de esta fase).
- **No hay `get_folders`/`create_folder`**, y `create_project` ignora cualquier
  carpeta destino. Por eso el proyecto se localiza por **nombre exacto**
  (`"Versiculos"`), no por carpeta.

### Regla de seguridad: el proyecto puede tener contenido manual

El proyecto "Versiculos" puede contener shows agregados a mano por el usuario
(bienvenida, anuncios, etc.) y **`ProjectSynchronizer` nunca debe tocarlos**.

Cada show creado por este sistema lleva `meta.createdBy = "AgenteIglesias"`
(`SYNC_TAG`). En cada sincronización, antes de decidir nada, se lee el
contenido de **cada show actual del proyecto** (`get_show`, porque el listado
de `get_projects` no trae `meta`) y se clasifica:

- `meta.createdBy === SYNC_TAG` → **administrado**: puede reutilizarse,
  sobrescribirse o desvincularse según corresponda.
- cualquier otro caso (sin tag, tag distinto, o el show no se pudo leer) →
  **contenido del usuario**: nunca se actualiza, nunca se desvincula, nunca se
  sobrescribe, nunca se cuenta como reutilizable. Si un item de hoy coincide
  por nombre con un show del usuario, igual se **crea uno nuevo** (no se toca
  el ajeno aunque el nombre coincida).

`SyncResult.ignoredUserShows` reporta cuántos shows del proyecto se dejaron
intactos por no tener el tag.

`ProjectSynchronizer.syncProject(nombre, items)` (`src/services/freeshow/ProjectSynchronizer.ts`)
es **genérico** (no sabe qué es un "versículo"; cualquier módulo futuro con un
proyecto fijo puede reutilizarlo) y en cada ejecución, **solo sobre los shows
administrados**:

1. Busca el proyecto por nombre exacto; si no existe, lo crea.
2. Lee y clasifica los shows actuales del proyecto (administrados vs. del
   usuario, ver regla de seguridad arriba); empareja los administrados por
   `name` con los items deseados de hoy.
3. **Reutiliza** (mismo id) los administrados cuyo nombre coincide: compara el
   contenido contra lo que hay en FreeShow y solo llama `set_show` si cambió
   (si es idéntico, no toca nada).
4. **Crea** (`create_show` → `set_show` → `add_to_project`) los items
   deseados que no tenían show administrado existente, etiquetando con
   `meta.createdBy = "AgenteIglesias"`.
5. **Desvincula** (`remove_project_item`, orden descendente de índice)
   únicamente los shows administrados que ya no corresponden a ningún item de
   hoy. Los shows del usuario nunca entran en este paso.

El proyecto "Versiculos" termina conteniendo **exclusivamente** los versículos
de la ejecución más reciente entre los shows administrados, sin recrear shows
innecesariamente ni acumular huérfanos más allá de lo estrictamente necesario
— y respetando intacto cualquier contenido que el usuario haya agregado a mano
dentro del mismo proyecto.

## El flujo del Módulo 1

`ScriptureModule.generate()`:

1. `parseReferences()` → referencias + errores por línea.
2. `BibleService.getVerses()` (cache-first, FreeShow primero) → versículos.
3. `buildShow()` aplica la plantilla → JSON `Show`.
4. `ProjectSynchronizer.syncProject("Versiculos", items)` sincroniza el proyecto
   fijo con todos los shows del lote en una sola pasada.
5. Registra en `recent_projects` y devuelve un resumen.

## Cómo añadir un MÓDULO nuevo

1. Crea `src/modules/<tu-modulo>/TuModulo.ts` que implemente `PlatformModule`
   (`id`, `name`, `registerRoutes(router)`).
2. Inyecta los servicios que necesite desde el contenedor.
3. Regístralo en `src/app/container.ts` con `registry.register(new TuModulo(...))`.

No hace falta tocar el servidor ni los demás módulos.

## Cómo añadir un PROVEEDOR de Biblia o IA

1. Crea una clase que implemente `BibleProvider` o `AIProvider`.
2. Añádela al `providerFactory.ts` correspondiente (`src/services/bible` o
   `src/services/ai`).
3. Selecciónala con `BIBLE_PROVIDER` / `AI_PROVIDER` en `.env`.

Ejemplos pendientes (interfaz lista, sin implementar): `mysql`, `postgres` para
Biblia.

## Base de datos (SQLite)

`src/core/db/migrations.ts` crea (idempotente) las tablas: `verses_cache`,
`history`, `recent_projects`, `favorites`, `config`, `translations`, `logs`.
Cada tabla tiene su repositorio en `src/core/db/repositories/`.
