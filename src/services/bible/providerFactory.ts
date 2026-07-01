import type { AppConfig } from "../../config/ConfigService.js"
import type { BibleProvider } from "./BibleProvider.js"
import { FreeShowBibleProvider } from "./providers/freeshowBibleProvider.js"
import { JsonProvider } from "./providers/jsonProvider.js"
import { SqliteProvider } from "./providers/sqliteProvider.js"
import { ApiBibleProvider } from "./providers/apiBibleProvider.js"

/**
 * Construye la lista ORDENADA de proveedores segun la configuracion.
 * El BibleService los consulta en orden hasta que uno devuelve versiculos.
 *
 * - local:    FreeShow (Bibles/*.fsb) -> JSON local -> SQLite local -> API.Bible si hay clave.
 *             FreeShow es la fuente principal: si la version ya esta instalada
 *             ahi, se usa esa exactamente (sin mantener una copia aparte).
 * - apibible: solo API.Bible.
 * - json:     solo archivos JSON.
 * - sqlite:   solo base SQLite.
 *
 * Futuros proveedores (mysql, postgres): crear la clase que implemente
 * BibleProvider y anadir el caso aqui. Nada mas cambia.
 */
export function buildBibleProviders(config: AppConfig, freeshow: FreeShowBibleProvider): BibleProvider[] {
    const json = new JsonProvider(config.LOCAL_BIBLE_PATH)
    const sqlite = new SqliteProvider(config.LOCAL_BIBLE_PATH)
    const api = new ApiBibleProvider(config.BIBLE_API_KEY)

    switch (config.BIBLE_PROVIDER) {
        case "apibible":
            return [api]
        case "json":
            return [json]
        case "sqlite":
            return [sqlite]
        case "local":
        default: {
            const providers: BibleProvider[] = [freeshow, json, sqlite]
            if (config.BIBLE_API_KEY) providers.push(api)
            return providers
        }
    }
}
