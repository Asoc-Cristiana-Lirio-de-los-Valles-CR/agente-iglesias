# Diseño: etiquetas consistentes y toggle de versiones bíblicas en la UI

## Contexto

`GET /api/scripture/versions` expone las 18 Biblias `.fsb` instaladas (escaneo real de `FreeShowBibleProvider`). La UI (`src/web/index.html`, `renderVersionChips`) muestra un chip por versión usando `v.code || v.id` como etiqueta. Resultado: algunas Biblias tienen código corto (NTV, RVR1960, DHH…) definido en `VERSION_ALIASES`, otras muestran el nombre completo del archivo (`Biblia Jerusalén`, `Nueva Biblia Latinoamericana de Hoy`…). Esto genera inconsistencia visual y, con 18 versiones, ruido en la pantalla principal.

## Problema

1. **Etiquetas inconsistentes**: mezcla de código corto y nombre completo en los chips, sin patrón claro para el usuario.
2. **Demasiadas opciones visibles**: no todas las 18 Biblias se usan con la misma frecuencia; mostrarlas todas como chips satura la UI.

## Objetivo

- Todo chip muestra el mismo patrón: `CÓDIGO | Nombre completo`.
- El usuario puede activar/desactivar qué versiones aparecen como chip de acceso rápido, sin perder acceso a la versión completa desde otros lugares (ej. el selector de versión por defecto).
- Todas las versiones arrancan activas (opt-out) — comportamiento actual preservado hasta que el usuario decida ocultar alguna.

## Fuera de alcance

- No se toca la lógica de **resolución** de versión por texto inline (`resolveFile`, `VERSION_ALIASES` usado para parsear referencias como `Juan 3:16 NTV`). Solo se agrega una capa de **presentación** (código corto para mostrar) que no reemplaza ni modifica esa tabla.
- El selector "Versión por defecto" (dropdown) sigue mostrando **todas** las versiones sin filtrar por el toggle — el toggle solo afecta los chips de inserción rápida.
- No se resuelven colisiones de código corto entre dos Biblias distintas (ej. `RVC.fsb` y "Reina-Valera Contemporanea" ambas podrían derivar a `RVC`) — el nombre completo detrás del `|` ya las distingue visualmente. No es necesario un código único.
- No se borra ni modifica ningún archivo `.fsb` (el provider sigue siendo solo lectura).

## Diseño

### 1. Código corto consistente (capa de presentación)

Nueva función pura, independiente de `VERSION_ALIASES` (usada solo para mostrar, nunca para resolver referencias):

```
deriveDisplayCode(fileNameWithoutExt: string): string
```

Reglas:
1. Si `CODE_BY_ALIAS` (mapa ya derivado de `VERSION_ALIASES`) tiene una coincidencia exacta → usar ese código (comportamiento actual preservado para las ~9 versiones ya cubiertas).
2. Si no hay alias conocido: tokenizar el nombre por espacios/guiones, descartar stopwords en español (`de, la, el, en, los, las, un, una, para`), tomar la primera letra (mayúscula) de cada palabra restante, y si el último token es un número (ej. `2004`, `95`) agregarlo tal cual al final.
   - `"Biblia Jerusalén"` → `BJ`
   - `"Biblia Latinoamericana 95"` → `BL95`
   - `"Biblia Latinoamericana de Hoy"` → `BLH`
   - `"Nueva Biblia Latinoamericana de Hoy"` → `NBLH`
   - `"Nueva Biblia de Jerusalén"` → `NBJ`
   - `"Nueva Biblia de los Hispanos"` → `NBH`
   - `"Reina-Valera Contemporanea"` → `RVC`
   - `"Reina Valera Gómez 2004"` / `"Reina-Valera Gómez 2004"` → `RVG2004` (ambas — son duplicado real en disco, fuera de alcance de este cambio)
   - `"RVC"` (ya es un solo token corto) → se mantiene tal cual (`RVC`)

`listAvailableVersions()` en `FreeShowBibleProvider` pasa a devolver `code` siempre presente (ya no opcional) usando esta función como fallback.

### 2. Formato de chip

`renderVersionChips` en `src/web/index.html` cambia la etiqueta de `v.code || v.id` a siempre `` `${v.code} | ${v.name}` ``. El `title` (tooltip) y el comportamiento de inserción al hacer clic no cambian — al insertar en la línea de referencia se sigue usando el **código corto solo** (`v.code`), no el string completo con `|`.

### 3. Preferencias de visibilidad (toggle)

- Tabla `config` existente (key-value, `ConfigRepository.get/set`) guarda una nueva key: `disabledBibleVersions` → JSON `string[]` de ids de versión desactivados. Ausente o `[]` = todas activas.
- Sin migración de esquema nueva — la tabla `config` ya soporta cualquier key.

### 4. Endpoints (`src/modules/scripture/`)

- `GET /api/scripture/versions`: cada item del array pasa a incluir `enabled: boolean` (true salvo que su `id` esté en `disabledBibleVersions`).
- `PUT /api/scripture/versions/preferences`: body `{ disabled: string[] }` reemplaza la lista completa guardada en `config`. Responde con el array de versiones actualizado (mismo shape que `GET`).

### 5. UI (`src/web/index.html`)

- Ícono ⚙ junto al label "Versiones instaladas en FreeShow" abre/cierra un panel inline (mismo patrón que el panel de ayuda `?` ya existente) con checkbox por versión (`CÓDIGO | Nombre`, más un indicador si es duplicado conocido — opcional, no bloqueante).
- Al tildar/destildar, se llama `PUT /api/scripture/versions/preferences` con la lista completa de ids desactivados y se re-renderizan los chips filtrando por `enabled`.
- El chip de acceso rápido solo se pinta si `enabled === true`. El panel de checklist siempre muestra las 18 (para poder reactivarlas).
- El `<select>` de "Versión por defecto" sigue poblándose con **todas** las versiones (`versions`, sin filtrar), sin cambios respecto al comportamiento actual.

### 6. Manejo de errores

- Si `PUT /preferences` falla (red, FreeShow no disponible no aplica acá — es solo SQLite local), el checkbox vuelve a su estado anterior y se muestra el mismo patrón de error ya usado en el resto de la UI (no se introduce uno nuevo).
- `deriveDisplayCode` es una función pura sin I/O — no puede fallar en runtime más allá de recibir un string vacío (caso no esperado, ya que siempre viene del nombre de archivo real).

### 7. Testing

- Unit test de `deriveDisplayCode`: casos de la tabla de arriba + verificación de que los alias existentes (`VERSION_ALIASES`) siguen ganando sobre el algoritmo de iniciales.
- Unit test de `ConfigRepository` round-trip para la key `disabledBibleVersions` (ya cubierto por patrón existente de tests de `ConfigRepository`, se agrega un caso más).
- Unit test del merge en el endpoint `GET /versions` (con preferences vacías → todo `enabled:true`; con algunas deshabilitadas → reflejan `enabled:false`).
- Unit test de `PUT /preferences` (persiste y devuelve el array actualizado).

## Archivos afectados

- `src/services/bible/providers/freeshowBibleProvider.ts` — `deriveDisplayCode`, `listAvailableVersions` siempre con `code`.
- `src/modules/scripture/ScriptureModule.ts` (o donde vivan las rutas del módulo) — nuevo endpoint `PUT /api/scripture/versions/preferences`, extender `GET /versions` con `enabled`.
- `src/core/db/repositories/ConfigRepository.ts` — sin cambios de código (ya soporta cualquier key), solo se documenta el nuevo uso.
- `src/web/index.html` — `renderVersionChips` (formato `CÓDIGO | Nombre`), nuevo panel de checklist con ícono ⚙, llamada a `PUT /preferences`.
- Tests nuevos en `test/` siguiendo la convención existente (vitest).
