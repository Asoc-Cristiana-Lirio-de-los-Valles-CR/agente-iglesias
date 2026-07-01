import "dotenv/config"
import { loadConfig } from "./config/ConfigService.js"
import { createContainer } from "./app/container.js"
import { createApp } from "./server/app.js"

/**
 * Punto de entrada de la plataforma.
 *   config -> contenedor (DB + servicios + modulos) -> app Express -> escuchar
 */
function main(): void {
    const config = loadConfig()
    const container = createContainer(config)
    const app = createApp(container)

    const server = app.listen(config.WEB_PORT, () => {
        container.logger.info(`Interfaz web en http://localhost:${config.WEB_PORT}`)
        container.logger.info(
            `FreeShow: ${config.FREESHOW_HOST}:${config.FREESHOW_PORT} (${config.FREESHOW_TRANSPORT}) | ` +
                `Biblia: ${config.BIBLE_PROVIDER} | Plantilla: ${config.TEMPLATE}` +
                (config.DRY_RUN ? " | DRY_RUN" : ""),
        )
    })

    const shutdown = () => {
        container.logger.info("Cerrando...")
        server.close()
        container.close()
        process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
}

main()
