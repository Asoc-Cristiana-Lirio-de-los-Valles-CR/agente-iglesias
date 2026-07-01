import express, { type Express, Router } from "express"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { existsSync } from "node:fs"
import type { Container } from "../app/container.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Resuelve la carpeta de la interfaz web (funciona en dev con tsx, compilado y Electron empaquetado). */
function resolveWebDir(): string {
    const candidates = [
        join(__dirname, "..", "web"), // dist/web o src/web (segun ejecucion)
        join(process.cwd(), "src", "web"),
        join(process.cwd(), "web"),
        // Electron empaquetado: resources/web/ (process.resourcesPath solo existe en Electron)
        ...(typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath === "string"
            ? [join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!, "web")]
            : []),
    ]
    return candidates.find((p) => existsSync(join(p, "index.html"))) ?? candidates[0]
}

/**
 * createApp(): construye la app Express y monta las rutas de todos los modulos.
 *
 * Esta funcion NO arranca el servidor (eso lo hace startServer / index.ts), de
 * modo que un futuro contenedor Electron pueda reutilizar exactamente la misma
 * app sin cambios en el backend.
 */
export function createApp(container: Container): Express {
    const app = express()
    app.use(express.json({ limit: "1mb" }))

    // API: todas las rutas de modulos cuelgan de /api
    const api = Router()

    // Salud y estado de FreeShow.
    api.get("/health", (_req, res) => res.json({ ok: true }))
    api.get("/status", async (_req, res) => {
        const freeshow = await container.freeshow.ping()
        res.json({
            freeshow,
            bibleProvider: container.config.BIBLE_PROVIDER,
            defaultVersion: container.config.DEFAULT_VERSION,
            template: container.config.TEMPLATE,
            dryRun: container.config.DRY_RUN,
        })
    })

    container.registry.mountAll(api)
    app.use("/api", api)

    // Interfaz web estatica.
    app.use(express.static(resolveWebDir()))

    return app
}
