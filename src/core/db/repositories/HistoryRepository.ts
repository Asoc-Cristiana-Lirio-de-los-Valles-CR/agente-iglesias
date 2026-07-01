import type { DB } from "../database.js"

export interface HistoryEntry {
    raw: string
    version: string | null
    created_at: number
}

/** Acceso a la tabla `history`. */
export class HistoryRepository {
    constructor(private db: DB) {}

    add(raw: string, version: string | null): void {
        this.db
            .prepare(`INSERT INTO history (raw, version, created_at) VALUES (?, ?, ?)`)
            .run(raw, version, Date.now())
    }

    recent(limit = 50): HistoryEntry[] {
        return this.db
            .prepare(`SELECT raw, version, created_at FROM history ORDER BY created_at DESC, id DESC LIMIT ?`)
            .all(limit) as HistoryEntry[]
    }
}
