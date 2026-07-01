import type { DB } from "../database.js"
import type { LogEntry } from "../../logger/Logger.js"

/** Acceso a la tabla `logs`. Pensado para usarse como sink del Logger. */
export class LogsRepository {
    constructor(private db: DB) {}

    add(entry: LogEntry): void {
        this.db
            .prepare(`INSERT INTO logs (level, scope, message, meta, created_at) VALUES (?, ?, ?, ?, ?)`)
            .run(
                entry.level,
                entry.scope,
                entry.message,
                entry.meta !== undefined ? JSON.stringify(entry.meta) : null,
                entry.timestamp,
            )
    }

    recent(limit = 200): unknown[] {
        return this.db
            .prepare(`SELECT level, scope, message, meta, created_at FROM logs ORDER BY created_at DESC LIMIT ?`)
            .all(limit)
    }
}
