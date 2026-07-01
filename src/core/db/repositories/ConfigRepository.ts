import type { DB } from "../database.js"

/**
 * Acceso a la tabla `config` (clave/valor). Guarda preferencias del usuario
 * que pueden cambiar en caliente sin tocar el .env (ej. plantilla activa
 * elegida desde la interfaz).
 */
export class ConfigRepository {
    constructor(private db: DB) {}

    get(key: string): string | undefined {
        const row = this.db.prepare(`SELECT value FROM config WHERE key = ?`).get(key) as
            | { value: string }
            | undefined
        return row?.value
    }

    set(key: string, value: string): void {
        this.db
            .prepare(
                `INSERT INTO config (key, value) VALUES (?, ?)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            )
            .run(key, value)
    }

    all(): Record<string, string> {
        const rows = this.db.prepare(`SELECT key, value FROM config`).all() as { key: string; value: string }[]
        return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    }
}
