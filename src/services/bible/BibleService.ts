import type { BibleReference, Verse } from "../../types/index.js"
import type { BibleProvider } from "./BibleProvider.js"
import type { CacheService } from "../cache/CacheService.js"
import type { HistoryRepository } from "../../core/db/repositories/HistoryRepository.js"
import type { Logger } from "../../core/logger/Logger.js"

/** Error de dominio cuando no se encuentra el texto de una referencia. */
export class VersesNotFoundError extends Error {
    constructor(ref: BibleReference) {
        super(`No se encontro el texto para "${ref.raw}" (version ${ref.version}). ` + `Revisa el proveedor biblico o la version.`)
        this.name = "VersesNotFoundError"
    }
}

/**
 * BibleService: obtiene versiculos con estrategia CACHE-FIRST.
 *
 *   1. Buscar en la cache local (SQLite).
 *   2. Si falta, consultar los proveedores en orden (local -> API).
 *   3. Guardar el resultado en la cache.
 *   4. La proxima vez sale de la cache (casi nunca se reconsume la API).
 */
export class BibleService {
    constructor(
        private providers: BibleProvider[],
        private cache: CacheService,
        private history: HistoryRepository,
        private logger: Logger,
    ) {}

    async getVerses(ref: BibleReference): Promise<Verse[]> {
        // 1. Cache local
        const cached = this.cache.get(ref)
        if (cached) {
            this.logger.debug(`Cache HIT: ${ref.raw}`)
            this.history.add(ref.raw, ref.version)
            return cached
        }

        // 2. Proveedores en orden
        for (const provider of this.providers) {
            try {
                const verses = await provider.getVerses(ref)
                if (verses.length > 0) {
                    this.logger.debug(`Proveedor "${provider.name}" resolvio: ${ref.raw}`)
                    // 3. Guardar en cache
                    this.cache.save(ref, verses)
                    this.history.add(ref.raw, ref.version)
                    return verses
                }
            } catch (err) {
                this.logger.warn(`Proveedor "${provider.name}" fallo en ${ref.raw}`, err)
            }
        }

        throw new VersesNotFoundError(ref)
    }
}
