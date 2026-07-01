/**
 * Modulo de actualizaciones automaticas (electron-updater + GitHub Releases).
 *
 * Flujo:
 *   App abre → checkForUpdates() silencioso
 *              ↓ si hay version nueva
 *   Descarga en segundo plano (autoDownload = true)
 *              ↓ descarga completa
 *   Dialog nativo: "Version X.Y.Z lista. ¿Instalar ahora?"
 *              ↓ usuario acepta
 *   quitAndInstall() → Electron cierra → NSIS instala → app reabre
 *
 * Canales: stable (latest.yml) | beta (beta.yml en GitHub Release).
 * El canal se configura con UPDATE_CHANNEL en .env del usuario.
 *
 * Para publicar una nueva version:
 *   1. npm version patch|minor|major
 *   2. npm run dist
 *   3. Subir el .exe + .blockmap + latest.yml a un GitHub Release con tag vX.Y.Z
 *   (ver electron-builder.yml seccion publish cuando se configure el repo)
 *
 * Nota: sin firma de codigo las actualizaciones silenciosas no estan disponibles
 * en Windows (el instalador mostrara dialogo de seguridad). Esto se resuelve
 * con un certificado de codigo en una fase posterior.
 */

import { autoUpdater, type UpdateInfo } from "electron-updater"
import { dialog, app } from "electron"
import type { BrowserWindow } from "electron"

/** Inicializa el sistema de actualizaciones automaticas. Solo opera cuando app.isPackaged. */
export function initAutoUpdater(mainWindow: (() => BrowserWindow | null), channel: "stable" | "beta" = "stable"): void {
    if (!app.isPackaged) {
        // En desarrollo: usar dev-app-update.yml si existe, o no hacer nada.
        // Descomentar la linea de abajo para probar el updater en modo dev:
        // autoUpdater.updateConfigPath = path.join(process.cwd(), 'dev-app-update.yml')
        console.log("[updater] Modo desarrollo — actualizaciones automaticas desactivadas")
        return
    }

    autoUpdater.channel = channel
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = channel === "beta"

    // ── Eventos ──────────────────────────────────────────────────────────────

    autoUpdater.on("update-available", (info: UpdateInfo) => {
        dialog.showMessageBox({
            type: "info",
            title: "Actualización disponible",
            message: `Nueva versión ${info.version} disponible`,
            detail: "Descargando en segundo plano. Se te avisará cuando esté lista para instalar.",
            buttons: ["Aceptar"],
            icon: undefined,
        }).catch(() => {})
    })

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
        const win = mainWindow()
        const opts = {
            type: "question" as const,
            title: "Actualización lista para instalar",
            message: `La versión ${info.version} está lista.`,
            detail:
                "La aplicación se cerrará y se reiniciará automáticamente para completar la actualización.\n" +
                "Tu base de datos y configuración se conservan intactos.",
            buttons: ["Instalar ahora", "Recordarme al salir"],
            defaultId: 0,
            icon: undefined,
        }
        const promise = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
        promise
            .then(({ response }) => {
                if (response === 0) autoUpdater.quitAndInstall(false, true)
            })
            .catch(() => {})
    })

    autoUpdater.on("error", (err: Error) => {
        // Falla silenciosa: no interrumpir al usuario si no hay internet o GitHub no responde.
        console.error("[updater] Error:", err.message)
    })

    // ── Programacion ─────────────────────────────────────────────────────────

    // Verificar al arrancar (con retraso para no bloquear el inicio)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {})
    }, 10_000) // 10 segundos tras el inicio

    // Verificar cada 24 horas
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {})
    }, 24 * 60 * 60 * 1000)
}
