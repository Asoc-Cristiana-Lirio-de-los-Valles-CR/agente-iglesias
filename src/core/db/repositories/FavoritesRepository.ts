import type { DB } from "../database.js"

export interface Favorite {
    raw: string
    created_at: number
}

/** Acceso a la tabla `favorites`. */
export class FavoritesRepository {
    constructor(private db: DB) {}

    add(raw: string): void {
        this.db
            .prepare(`INSERT OR IGNORE INTO favorites (raw, created_at) VALUES (?, ?)`)
            .run(raw, Date.now())
    }

    remove(raw: string): void {
        this.db.prepare(`DELETE FROM favorites WHERE raw = ?`).run(raw)
    }

    list(): Favorite[] {
        return this.db
            .prepare(`SELECT raw, created_at FROM favorites ORDER BY created_at DESC`)
            .all() as Favorite[]
    }
}
