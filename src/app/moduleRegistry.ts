import type { Router } from "express"
import type { Logger } from "../core/logger/Logger.js"

/**
 * Contrato de un MODULO de la plataforma. Cada modulo se registra a si mismo
 * (sus rutas y, si hace falta, sus servicios) sin que el nucleo lo conozca.
 *
 * Para anadir un modulo nuevo (anuncios, letras, sermones...): crea una clase
 * que implemente PlatformModule y registrala en `src/index.ts`. Nada mas cambia.
 */
export interface PlatformModule {
    /** Identificador del modulo (ej. "scripture"). */
    readonly id: string
    /** Nombre legible. */
    readonly name: string
    /** Monta las rutas del modulo bajo el router de la app. */
    registerRoutes(router: Router): void
}

/** Registro simple de modulos. */
export class ModuleRegistry {
    private modules: PlatformModule[] = []

    constructor(private logger: Logger) {}

    register(module: PlatformModule): void {
        this.modules.push(module)
        this.logger.info(`Modulo registrado: ${module.name} (${module.id})`)
    }

    all(): PlatformModule[] {
        return this.modules
    }

    mountAll(router: Router): void {
        for (const m of this.modules) m.registerRoutes(router)
    }
}
