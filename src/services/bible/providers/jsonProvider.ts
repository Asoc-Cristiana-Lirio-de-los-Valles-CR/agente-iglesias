import { readFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { BibleProvider } from "../BibleProvider.js"
import type { BibleReference, Verse } from "../../../types/index.js"

/**
 * Estructura de un archivo de Biblia en JSON.
 * Ruta: <LOCAL_BIBLE_PATH>/<VERSION>.json  (ej. data/biblias/RVR1960.json)
 *
 * {
 *   "version": "RVR1960",
 *   "books": {
 *     "JHN": { "3": { "16": "Porque de tal manera amo Dios...", "17": "..." } }
 *   }
 * }
 *
 * Las claves de libro son los ids canonicos (ver bookNames.ts).
 */
interface BibleFile {
    version: string
    books: Record<string, Record<string, Record<string, string>>>
}

/** Proveedor que lee biblias desde archivos JSON locales. */
export class JsonProvider implements BibleProvider {
    readonly name = "json"
    private cache = new Map<string, BibleFile | null>()

    constructor(private basePath: string) {}

    async getVerses(ref: BibleReference): Promise<Verse[]> {
        const file = this.load(ref.version)
        if (!file) return []

        const chapter = file.books?.[ref.bookId]?.[String(ref.chapter)]
        if (!chapter) return []

        // Capitulo completo: devolver todos los versiculos ordenados.
        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            return Object.keys(chapter)
                .map((k) => Number(k))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b)
                .map((n) => ({ verse: n, text: chapter[String(n)] }))
        }

        const verses: Verse[] = []
        for (let v = ref.verseStart; v <= ref.verseEnd; v++) {
            const text = chapter[String(v)]
            if (text === undefined) return [] // rango incompleto -> dejar que haga fallback
            verses.push({ verse: v, text })
        }
        return verses
    }

    private load(version: string): BibleFile | null {
        if (this.cache.has(version)) return this.cache.get(version) ?? null
        const path = resolve(join(this.basePath, `${version}.json`))
        if (!existsSync(path)) {
            this.cache.set(version, null)
            return null
        }
        try {
            const data = JSON.parse(readFileSync(path, "utf-8")) as BibleFile
            this.cache.set(version, data)
            return data
        } catch {
            this.cache.set(version, null)
            return null
        }
    }
}
