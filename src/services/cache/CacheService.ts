import type { BibleReference, Verse } from "../../types/index.js"
import type { VersesCacheRepository } from "../../core/db/repositories/VersesCacheRepository.js"

/**
 * Servicio de cache de versiculos. Encapsula la tabla `verses_cache` para que
 * el BibleService no dependa directamente del repositorio.
 */
export class CacheService {
    constructor(private repo: VersesCacheRepository) {}

    /** Devuelve los versiculos cacheados del rango, o null si falta alguno. */
    get(ref: BibleReference): Verse[] | null {
        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            // Capitulo completo: asumimos que la cache guarda capitulos completos.
            const rows = this.repo.getChapter(ref.version, ref.bookId, ref.chapter)
            return rows.length > 0 ? rows : null
        }
        return this.repo.getRange(ref.version, ref.bookId, ref.chapter, ref.verseStart, ref.verseEnd)
    }

    /** Guarda versiculos en la cache. */
    save(ref: BibleReference, verses: Verse[]): void {
        if (verses.length === 0) return
        this.repo.saveMany(ref.version, ref.bookId, ref.chapter, verses)
    }
}
