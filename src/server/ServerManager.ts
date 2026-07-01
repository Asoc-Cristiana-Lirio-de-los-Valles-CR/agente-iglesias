import http from "node:http"
import { loadConfig } from "../config/ConfigService.js"
import { createContainer, type Container } from "../app/container.js"
import { createApp } from "./app.js"

/**
 * Encapsula el ciclo de vida completo del servidor Express.
 *
 * Electron (main.ts) solo interactua con esta clase — no conoce loadConfig,
 * createContainer ni createApp directamente. Esto mantiene el acoplamiento
 * minimo y facilita las pruebas de integracion.
 *
 * Garantia critica: stop() no resuelve hasta que el puerto esta efectivamente
 * liberado (server.close con callback promisificado). Esto es necesario para
 * que electron-updater pueda reiniciar la app sin que el puerto 3000 quede
 * ocupado entre sesiones.
 */
export class ServerManager {
    private container: Container | null = null
    private server: http.Server | null = null
    private _port = 0

    async start(): Promise<void> {
        const config = loadConfig()
        this.container = createContainer(config)
        const app = createApp(this.container)

        await new Promise<void>((resolve, reject) => {
            this.server = app.listen(config.WEB_PORT, () => {
                this._port = (this.server!.address() as { port: number }).port
                this.container!.logger.info(`Interfaz web en http://localhost:${this._port}`)
                this.container!.logger.info(
                    `FreeShow: ${config.FREESHOW_HOST}:${config.FREESHOW_PORT} (${config.FREESHOW_TRANSPORT}) | ` +
                        `Biblia: ${config.BIBLE_PROVIDER} | Plantilla: ${config.TEMPLATE}` +
                        (config.DRY_RUN ? " | DRY_RUN" : ""),
                )
                resolve()
            })
            this.server.once("error", reject)
        })
    }

    /** Cierra el servidor y libera todos los recursos. Espera hasta que el puerto quede libre. */
    async stop(): Promise<void> {
        await new Promise<void>((resolve) => {
            if (!this.server) return resolve()
            this.server.close(() => resolve())
        })
        this.container?.close()
        this.server = null
        this.container = null
        this._port = 0
    }

    get port(): number {
        return this._port
    }

    get url(): string {
        return `http://localhost:${this._port}`
    }

    get isRunning(): boolean {
        return this.server !== null && this._port > 0
    }
}
