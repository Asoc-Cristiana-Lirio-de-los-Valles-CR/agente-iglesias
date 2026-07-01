import type { DB } from "../database.js"

export interface Translation {
    code: string
    provider: string
    provider_id: string | null
    installed: number
}

/**
 * Acceso a la tabla `translations`: que versiones estan disponibles/instaladas
 * y su identificador por proveedor (ej. el id de API.Bible para "RVR1960").
 */
export class TranslationsRepository {
    constructor(private db: DB) {}

    upsert(code: string, provider: string, providerId: string | null, installed: boolean): void {
        this.db
            .prepare(
                `INSERT INTO translations (code, provider, provider_id, installed) VALUES (?, ?, ?, ?)
                 ON CONFLICT (code, provider)
                 DO UPDATE SET provider_id = excluded.provider_id, installed = excluded.installed`,
            )
            .run(code, provider, providerId, installed ? 1 : 0)
    }

    list(): Translation[] {
        return this.db
            .prepare(`SELECT code, provider, provider_id, installed FROM translations ORDER BY code ASC`)
            .all() as Translation[]
    }
}
