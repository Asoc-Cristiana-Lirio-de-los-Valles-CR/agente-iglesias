import type { DB } from "../database.js"
import type { Verse } from "../../../types/index.js"

/** Acceso a la tabla `verses_cache`. */
export class VersesCacheRepository {
    constructor(private db: DB) {}

    /** Devuelve los versiculos cacheados de un rango, o null si falta alguno. */
    getRange(version: string, bookId: string, chapter: number, start: number, end: number): Verse[] | null {
        const rows = this.db
            .prepare(
                `SELECT verse, text FROM verses_cache
                 WHERE version = ? AND book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?
                 ORDER BY verse ASC`,
            )
            .all(version, bookId, chapter, start, end) as Verse[]

        const expected = end - start + 1
        if (rows.length < expected) return null
        return rows
    }

    /** Devuelve todos los versiculos cacheados de un capitulo (o [] si no hay). */
    getChapter(version: string, bookId: string, chapter: number): Verse[] {
        return this.db
            .prepare(
                `SELECT verse, text FROM verses_cache
                 WHERE version = ? AND book_id = ? AND chapter = ?
                 ORDER BY verse ASC`,
            )
            .all(version, bookId, chapter) as Verse[]
    }

    /** Inserta o reemplaza versiculos en la cache. */
    saveMany(version: string, bookId: string, chapter: number, verses: Verse[]): void {
        const stmt = this.db.prepare(
            `INSERT INTO verses_cache (version, book_id, chapter, verse, text, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (version, book_id, chapter, verse)
             DO UPDATE SET text = excluded.text`,
        )
        const now = Date.now()
        const tx = this.db.transaction((items: Verse[]) => {
            for (const v of items) stmt.run(version, bookId, chapter, v.verse, v.text, now)
        })
        tx(verses)
    }
}
