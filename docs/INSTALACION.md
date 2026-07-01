# Instalación paso a paso

## 1. Requisitos

- **Node.js 18 o superior** (recomendado 20+). Descarga: <https://nodejs.org>
- **FreeShow** instalado: <https://freeshow.app>
- (Opcional) Una clave de **API.Bible** si quieres descargar versículos en línea.

Comprueba Node:

```bash
node -v
```

## 2. Instalar dependencias

Desde la carpeta del proyecto:

```bash
npm install
```

## 3. Configurar

Copia el archivo de ejemplo y edítalo:

```bash
# Windows (PowerShell)
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Abre `.env` y ajusta lo que necesites. Valores más importantes:

- `BIBLE_PROVIDER` → `local` (FreeShow + archivos/SQLite + caché) o `apibible` (en línea).
- `FREESHOW_DATA_PATH` → carpeta raíz de datos de FreeShow (contiene `Bibles/`).
  Vacío = usa el default de FreeShow (`~/Documents/FreeShow`). Si cambiaste la
  carpeta de datos en FreeShow → Settings → Data, ponla aquí.
- `BIBLE_API_KEY` → tu clave si usas API.Bible (también sirve como respaldo
  final cuando una versión no está instalada ni en FreeShow ni en local).
- `DEFAULT_VERSION` → versión por defecto cuando no la indicas (ej. `RVR1960`).
- `TEMPLATE` → plantilla visual activa (ej. `Default`).
- `FREESHOW_PORT` → normalmente `5506`.

> Si ya tienes Biblias importadas en FreeShow (RVR1960, NVI, etc.), el agente
> las usa directamente — no necesitas configurar nada más para esas versiones.
> Para probar sin tener nada instalado en FreeShow, deja `BIBLE_PROVIDER=local`
> y usa la versión de ejemplo `RVR1909` (incluida). Ejemplo: `Juan 3:16 RVR1909`.

## 4. Activar la API en FreeShow

Sigue [FREESHOW.md](FREESHOW.md). Resumen: FreeShow → **Settings → Connections** →
activa la API / WebSocket (puerto 5506).

## 5. Ejecutar

```bash
npm run dev
```

Verás un mensaje como `Interfaz web en http://localhost:3000`. Abre esa dirección
en el navegador.

## 6. Probar

1. Escribe referencias (una por línea), por ejemplo:
   ```
   Juan 3:16 RVR1909
   Salmos 23 RVR1909
   ```
2. Pulsa **Generar Presentación**.
3. Revisa FreeShow: deberían aparecer los proyectos.

## Modo de prueba sin enviar a FreeShow

Pon `DRY_RUN=true` en `.env`. El sistema generará el JSON y lo registrará en los
logs **sin** enviarlo a FreeShow. Útil para validar versículos y plantillas.

## Comandos disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Ejecuta en modo desarrollo (recarga al guardar). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Ejecuta la versión compilada. |
| `npm test` | Corre las pruebas. |
| `npm run typecheck` | Verifica tipos sin compilar. |

## Problemas frecuentes

- **"FreeShow no responde"** → revisa que FreeShow esté abierto y la API activada
  (ver [FREESHOW.md](FREESHOW.md)).
- **"No se encontró el texto…"** → la versión no está disponible en tu proveedor.
  Usa otra versión, añade el archivo local, o configura API.Bible.
- **Error al instalar `better-sqlite3`** → asegúrate de tener una versión reciente
  de Node; vuelve a ejecutar `npm install`.
