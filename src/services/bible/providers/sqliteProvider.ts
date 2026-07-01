import Database from "better-sqlite3"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { BibleProvider } from "../BibleProvider.js"
import type { BibleReference, Verse } from "../../../types/index.js"

/**
 * Proveedor que lee biblias desde una base SQLite local.
 *
 * Se espera un archivo por version: <basePath>/<VERSION>.db, con una tabla:
 *   CREATE TABLE verses (book_id TEXT, chapter INTEGER, verse INTEGER, text TEXT);
 *
 * Es de solo lectura. Util para biblias grandes donde JSON seria pesado.
 */
export class SqliteProvider implements BibleProvider {
    readonly name = "sqlite"
    private connections = new Map<string, Database.Database | null>()

    constructor(private basePath: string) {}

    async getVerses(ref: BibleReference): Promise<Verse[]> {
        const db = this.connect(ref.version)
        if (!db) return []

        // Capitulo completo: todos los versiculos.
        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            return db
                .prepare(
                    `SELECT verse, text FROM verses WHERE book_id = ? AND chapter = ? ORDER BY verse ASC`,
                )
                .all(ref.bookId, ref.chapter) as Verse[]
        }

        const rows = db
            .prepare(
                `SELECT verse, text FROM verses
                 WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?
                 ORDER BY verse ASC`,
            )
            .all(ref.bookId, ref.chapter, ref.verseStart, ref.verseEnd) as Verse[]

        const expected = ref.verseEnd - ref.verseStart + 1
        if (rows.length < expected) return []
        return rows
    }

    private connect(version: string): Database.Database | null {
        if (this.connections.has(version)) return this.connections.get(version) ?? null
        const path = resolve(join(this.basePath, `${version}.db`))
        if (!existsSync(path)) {
            this.connections.set(version, null)
            return null
        }
        try {
            const db = new Database(path, { readonly: true, fileMustExist: true })
            this.connections.set(version, db)
            return db
        } catch {
            this.connections.set(version, null)
            return null
        }
    }
}
