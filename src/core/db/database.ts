import Database from "better-sqlite3"
import { dirname } from "node:path"
import { mkdirSync } from "node:fs"
import { runMigrations } from "./migrations.js"

export type DB = Database.Database

/**
 * Abre (o crea) la base de datos SQLite y aplica las migraciones.
 * Usa `:memory:` para pruebas.
 */
export function openDatabase(path: string): DB {
    if (path !== ":memory:") {
        mkdirSync(dirname(path), { recursive: true })
    }
    const db = new Database(path)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    runMigrations(db)
    return db
}
