import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { BibleProvider } from "../BibleProvider.js"
import type { BibleReference, Verse } from "../../../types/index.js"
import { BOOKS } from "../../../modules/scripture/bookNames.js"

/**
 * Formato real de un archivo .fsb de FreeShow (verificado contra el codigo
 * fuente de ChurchApps/FreeShow): tupla [id, Bible], no un objeto plano.
 * `verse.text` es el campo actual; `verse.value` es el alias legado
 * (Biblias guardadas por versiones de FreeShow anteriores a 1.3.0).
 */
type FsBibleFile = [string, FsBible] | FsBible

interface FsBible {
    name: string
    books: FsBibleBook[]
}
interface FsBibleBook {
    /** Verificado contra archivos reales: algunos exportadores serializan esto como string ("43"). */
    number: number | string
    name: string
    chapters: FsBibleChapter[]
}
interface FsBibleChapter {
    /** Verificado contra archivos reales: algunos exportadores serializan esto como string ("3"). */
    number: number | string
    verses: FsBibleVerse[]
}
interface FsBibleVerse {
    number: number
    text?: string
    value?: string
}

/** bookId canonico (ver bookNames.ts) -> numero de libro (1-66, orden canonico). */
const BOOK_NUMBER_BY_ID = new Map(BOOKS.map((b, i) => [b.id, i + 1]))

/**
 * Mapa de codigos cortos de version -> posibles nombres de archivo .fsb instalados por FreeShow.
 * Cubre las traducciones espanolas mas comunes y sus variantes de nombre.
 * Si el usuario tiene un archivo con nombre distinto, puede configurar FREESHOW_DATA_PATH
 * y el sistema lo detectara por su nombre real via el selector de versiones.
 */
const VERSION_ALIASES: Record<string, string[]> = {
    RVR1960: ["Reina-Valera 1960", "Reina Valera 1960", "RVR 1960", "Reina-Valera1960"],
    RVR1909: ["Reina-Valera 1909", "Reina Valera 1909", "RVR 1909"],
    NTV: ["Nueva Traducción Viviente", "Nueva Traduccion Viviente", "NTV", "Nueva Tradución Viviente"],
    NVI: ["Nueva Versión Internacional", "Nueva Version Internacional", "NVI"],
    TLA: ["Traducción en Lenguaje Actual", "Traduccion en Lenguaje Actual", "TLA"],
    LBLA: ["La Biblia de Las Américas", "La Biblia de Las Americas", "LBLA"],
    DHH: ["Dios Habla Hoy", "Biblia Dios Habla Hoy", "DHH"],
    BDHH: ["Biblia Dios Habla Hoy", "Dios Habla Hoy"],
    PDT: ["Palabra de Dios para Todos", "PDT"],
    NBD: ["Nueva Biblia al Día", "Nueva Biblia al Dia", "NBD"],
    BLP: ["La Palabra", "BLP"],
    CST: ["Castilian", "CST"],
}

interface LoadedBible {
    /** nombre de version mostrado por FreeShow (igual que en su carpeta Bibles). */
    name: string
    /** numero de libro -> numero de capitulo -> numero de versiculo -> texto. */
    verses: Map<number, Map<number, Map<number, string>>>
}

/**
 * Lee directamente las Biblias instaladas por el usuario en FreeShow
 * (carpeta `Bibles/*.fsb`), sin mantener una copia separada.
 *
 * Solo lectura: nunca escribe en la carpeta de FreeShow.
 */
export class FreeShowBibleProvider implements BibleProvider {
    readonly name = "freeshow"
    private cache = new Map<string, LoadedBible | null>()
    private scanned = false
    private filesByVersion = new Map<string, string>()

    constructor(private dataPath: string) {}

    async getVerses(ref: BibleReference): Promise<Verse[]> {
        const bookNumber = BOOK_NUMBER_BY_ID.get(ref.bookId)
        if (!bookNumber) return []

        const bible = this.load(ref.version)
        if (!bible) return []

        const chapter = bible.verses.get(bookNumber)?.get(ref.chapter)
        if (!chapter) return []

        if (ref.wholeChapter || ref.verseStart === undefined || ref.verseEnd === undefined) {
            return [...chapter.entries()]
                .sort(([a], [b]) => a - b)
                .map(([verse, text]) => ({ verse, text }))
        }

        const out: Verse[] = []
        for (let v = ref.verseStart; v <= ref.verseEnd; v++) {
            const text = chapter.get(v)
            if (text === undefined) return [] // rango incompleto -> dejar que haga fallback
            out.push({ verse: v, text })
        }
        return out
    }

    /** Lista las versiones realmente instaladas en la carpeta Bibles de FreeShow. */
    listAvailableVersions(): { id: string; name: string }[] {
        this.scanFolder()
        return [...this.filesByVersion.keys()].map((version) => ({ id: version, name: version }))
    }

    private get biblesFolder(): string {
        const root = this.dataPath || join(homedir(), "Documents", "FreeShow")
        return join(root, "Bibles")
    }

    /** Indexa la carpeta Bibles por nombre de archivo (sin extension) -> ruta. */
    private scanFolder(): void {
        if (this.scanned) return
        this.scanned = true

        const folder = this.biblesFolder
        if (!existsSync(folder)) return

        for (const entry of readdirSync(folder)) {
            if (!entry.toLowerCase().endsWith(".fsb")) continue
            const version = entry.slice(0, -4)
            this.filesByVersion.set(version, join(folder, entry))
        }
    }

    private load(version: string): LoadedBible | null {
        if (this.cache.has(version)) return this.cache.get(version) ?? null

        this.scanFolder()
        const filePath = this.resolveFile(version)
        if (!filePath) {
            this.cache.set(version, null)
            return null
        }

        try {
            const raw = JSON.parse(readFileSync(filePath, "utf-8")) as FsBibleFile
            const bible = Array.isArray(raw) ? raw[1] : raw
            const loaded = this.index(bible)
            this.cache.set(version, loaded)
            return loaded
        } catch {
            // Archivo a medio escribir o corrupto: tratar como no disponible.
            this.cache.set(version, null)
            return null
        }
    }

    /**
     * Resuelve el codigo de version a la ruta real del archivo .fsb.
     *
     * Orden de busqueda:
     * 1. Nombre exacto del archivo (p. ej. "Reina-Valera 1960" para el selector de UI).
     * 2. Codigo corto normalizado (p. ej. "RVR1960" en mayusculas).
     * 3. Aliases conocidos del codigo: prueba cada variante de nombre hasta encontrar un .fsb.
     * 4. Busqueda flexible: si ninguno de los anteriores coincide, busca archivos cuyo nombre
     *    contenga la version (case-insensitive) para manejar variantes no previstas.
     */
    private resolveFile(version: string): string | undefined {
        // 1. Nombre exacto
        const exact = this.filesByVersion.get(version)
        if (exact) return exact

        // 2. Codigo normalizado (mayusculas, sin espacios)
        const upper = version.toUpperCase().replace(/\s+/g, "")
        const normalized = this.filesByVersion.get(upper)
        if (normalized) return normalized

        // 3. Aliases conocidos del codigo corto (en mayusculas sin espacios)
        const aliases = VERSION_ALIASES[upper]
        if (aliases) {
            for (const alias of aliases) {
                const f = this.filesByVersion.get(alias)
                if (f) return f
            }
        }

        // 4. Busqueda flexible: archivo cuyo nombre contenga la version (util para codigos parciales)
        const vLow = version.toLowerCase()
        for (const [key, path] of this.filesByVersion) {
            if (key.toLowerCase().includes(vLow)) return path
        }

        return undefined
    }

    private index(bible: FsBible): LoadedBible {
        const verses = new Map<number, Map<number, Map<number, string>>>()

        for (const book of bible.books ?? []) {
            const chapters = new Map<number, Map<number, string>>()
            for (const chapter of book.chapters ?? []) {
                const vs = new Map<number, string>()
                for (const verse of chapter.verses ?? []) {
                    const text = verse.text ?? verse.value
                    if (text !== undefined) vs.set(verse.number, text)
                }
                chapters.set(Number(chapter.number), vs)
            }
            verses.set(Number(book.number), chapters)
        }

        return { name: bible.name, verses }
    }
}
