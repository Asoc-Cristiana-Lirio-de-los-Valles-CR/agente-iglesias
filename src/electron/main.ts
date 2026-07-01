/**
 * Proceso principal de Electron (ESM / NodeNext).
 *
 * Responsabilidades:
 * 1. Inyectar rutas absolutas en process.env ANTES de importar cualquier
 *    modulo del servidor (ConfigService lee process.env al primer loadConfig()).
 * 2. Cargar el .env del usuario desde %APPDATA% (sin pisar los defaults).
 * 3. Iniciar el ServerManager (Express + SQLite + todos los servicios).
 * 4. Abrir la BrowserWindow apuntando al servidor local.
 * 5. Cerrar el servidor limpiamente antes de salir (garantiza puerto libre).
 *
 * Por que dynamic import para ServerManager:
 *   Los imports estaticos de ESM se resuelven antes del cuerpo del modulo,
 *   por lo que no podemos setear process.env antes de que ConfigService
 *   ejecute su logica. Con import() dinamico (top-level await), el body
 *   del modulo corre primero → process.env esta listo cuando se importa.
 */

import { app, BrowserWindow } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// ── 1. Inyectar rutas absolutas como fallback (??= no pisa si ya existe) ────
//    Se hace ANTES de cualquier import del servidor para que ConfigService
//    encuentre las variables correctas en process.env.
if (app.isPackaged) {
    const userData = app.getPath("userData")
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? ""

    process.env["DB_PATH"]            ??= path.join(userData, "data", "app.db")
    // Biblias JSON de ejemplo se sirven desde resources/ (solo lectura, bundleadas).
    // Las Biblias reales del usuario vienen de FreeShow (~Documents/FreeShow/Bibles/).
    process.env["LOCAL_BIBLE_PATH"]   ??= path.join(resources, "data", "biblias")
    process.env["TEMPLATES_PATH"]     ??= path.join(resources, "plantillas")
    // WEB_PATH no es una variable de ConfigService; lo resuelve app.ts via process.resourcesPath
}

// ── 2. Cargar .env del usuario desde userData (override:false → nuestros fallbacks ganan) ─
const userEnvPath = path.join(app.getPath("userData"), ".env")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require("dotenv") as { config: (opts: { path: string; override: boolean }) => void }
dotenv.config({ path: userEnvPath, override: false })

// ── 3. Dynamic import del servidor (DESPUES de setear process.env) ───────────
const { ServerManager } = await import("../server/ServerManager.js")
const { initAutoUpdater } = await import("./updater.js")
const serverManager = new ServerManager()

// ── 4. Ventana principal ──────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: "Agente para Iglesias",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })

    mainWindow.loadURL(serverManager.url)

    mainWindow.on("closed", () => {
        mainWindow = null
    })
}

// ── 5. Ciclo de vida de la app ────────────────────────────────────────────────
app.whenReady().then(async () => {
    await serverManager.start()
    createWindow()

    // Iniciar actualizaciones automaticas (canal configurable via UPDATE_CHANNEL en .env)
    const channel = (process.env["UPDATE_CHANNEL"] === "beta" ? "beta" : "stable") as "stable" | "beta"
    initAutoUpdater(() => mainWindow, channel)

    app.on("activate", () => {
        // macOS: reabrir ventana si no hay ninguna (comportamiento estandar)
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on("window-all-closed", () => {
    // En macOS se mantiene vivo hasta que el usuario lo cierre explicitamente.
    // En Windows/Linux, cerrar la ultima ventana termina la app.
    if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", async () => {
    // Garantiza que el puerto 3000 queda libre antes de que el proceso muera.
    // Critico para el reinicio tras actualizacion (electron-updater, Fase C).
    await serverManager.stop()
})
