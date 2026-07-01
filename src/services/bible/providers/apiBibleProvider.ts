import type { BibleProvider } from "../BibleProvider.js"
import type { BibleReference, Verse } from "../../../types/index.js"
import { getVersion } from "../versions.js"

/**
 * Proveedor que consulta scripture.api.bible (API.Bible).
 * Requiere una clave (BIBLE_API_KEY) y que la version tenga `apiBibleId`.
 *
 * Usa el endpoint de "passages" con numeros de versiculo incluidos y luego
 * separa el texto por versiculo. Si no puede resolver, devuelve [] para
 * permitir el fallback a otro proveedor.
 */
export class ApiBibleProvider implements BibleProvider {
    readonly name = "apibible"
    private base = "https://api.scripture.api.bible/v1"

    constructor(
        private apiKey: string,
        /** Permite inyectar fetch en pruebas. */
        private fetchFn: typeof fetch = fetch,
    ) {}

    async getVerses(ref: BibleReference): Promise<Verse[]> {
        if (!this.apiKey) return []
        const info = getVersion(ref.version)
        const bibleId = info?.apiBibleId
        if (!bibleId) return []

        const passageId = this.buildPassageId(ref)

        const url =
            `${this.base}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}` +
            `?content-type=text&include-notes=false&include-titles=false` +
            `&include-verse-numbers=true&include-chapter-numbers=false`

        let content: string
        try {
            const res = await this.fetchFn(url, { headers: { "api-key": this.apiKey } })
            if (!res.ok) return []
            const json = (await res.json()) as { data?: { content?: string } }
            content = json.data?.content ?? ""
        } catch {
            return []
        }
        if (!content.trim()) return []

        return this.parseVerses(content, ref)
    }

    /** Construye el id de pasaje de API.Bible (capitulo completo o rango). */
    private buildPassageId(ref: BibleReference): string {
        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            return `${ref.bookId}.${ref.chapter}`
        }
        if (ref.verseStart === ref.verseEnd) {
            return `${ref.bookId}.${ref.chapter}.${ref.verseStart}`
        }
        return `${ref.bookId}.${ref.chapter}.${ref.verseStart}-${ref.bookId}.${ref.chapter}.${ref.verseEnd}`
    }

    /** Separa el texto en versiculos usando los marcadores [n]. */
    private parseVerses(content: string, ref: BibleReference): Verse[] {
        const verses: Verse[] = []
        const regex = /\[(\d+)\]\s*([^[]*)/g
        let match: RegExpExecArray | null
        while ((match = regex.exec(content)) !== null) {
            const num = Number(match[1])
            const text = match[2].replace(/\s+/g, " ").trim()
            if (text) verses.push({ verse: num, text })
        }

        // Caso de un solo versiculo sin marcador detectable.
        if (verses.length === 0 && ref.verseStart !== undefined && ref.verseStart === ref.verseEnd) {
            const text = content.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim()
            if (text) verses.push({ verse: ref.verseStart, text })
        }

        // Capitulo completo: no filtrar por rango.
        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            return verses.sort((a, b) => a.verse - b.verse)
        }
        return verses.filter((v) => v.verse >= ref.verseStart! && v.verse <= ref.verseEnd!)
    }
}
