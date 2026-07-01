import { describe, it, expect } from "vitest"
import { resolve } from "node:path"
import { FreeShowBibleProvider } from "../src/services/bible/providers/freeshowBibleProvider.js"
import type { BibleReference } from "../src/types/index.js"

const dataPath = resolve("test/fixtures/freeshow")
const provider = new FreeShowBibleProvider(dataPath)

function ref(over: Partial<BibleReference>): BibleReference {
    return {
        raw: "",
        bookId: "JHN",
        bookName: "Juan",
        chapter: 3,
        wholeChapter: false,
        version: "RVR1960",
        ...over,
    }
}

describe("FreeShowBibleProvider (lee .fsb tal cual los guarda FreeShow)", () => {
    it("parsea la tupla [id, Bible] y lee un rango de versiculos", async () => {
        const verses = await provider.getVerses(ref({ verseStart: 16, verseEnd: 17 }))
        expect(verses).toHaveLength(2)
        expect(verses[0]).toEqual({ verse: 16, text: "Porque de tal manera amo Dios al mundo, que ha dado a su Hijo unigenito" })
    })

    it("lee un capitulo completo ordenado por numero de versiculo", async () => {
        const verses = await provider.getVerses(ref({ wholeChapter: true, verseStart: undefined, verseEnd: undefined }))
        expect(verses.map((v) => v.verse)).toEqual([15, 16, 17])
    })

    it("acepta verse.value como alias legado de verse.text", async () => {
        const verses = await provider.getVerses(
            ref({ bookId: "PSA", chapter: 23, version: "LEGACY", verseStart: 1, verseEnd: 2 }),
        )
        expect(verses).toHaveLength(2)
        expect(verses[0].text).toBe("Jehova es mi pastor; nada me faltara.")
    })

    it("devuelve [] si la version no esta instalada (para permitir fallback)", async () => {
        const verses = await provider.getVerses(ref({ version: "NOEXISTE", verseStart: 16, verseEnd: 16 }))
        expect(verses).toEqual([])
    })

    it("devuelve [] si el rango pedido esta incompleto", async () => {
        const verses = await provider.getVerses(ref({ verseStart: 16, verseEnd: 99 }))
        expect(verses).toEqual([])
    })

    it("listAvailableVersions() refleja exactamente los .fsb presentes", () => {
        const versions = provider.listAvailableVersions().map((v) => v.id).sort()
        expect(versions).toEqual(["LEGACY", "RVR1960", "STRINGNUMS"])
    })

    it("resuelve versiculos cuando book.number/chapter.number vienen como string (caso real verificado en .fsb de produccion)", async () => {
        const verses = await provider.getVerses(ref({ version: "STRINGNUMS", verseStart: 16, verseEnd: 16 }))
        expect(verses).toEqual([{ verse: 16, text: "Porque de tal manera amo Dios al mundo (numeros como string, igual que datos reales)" }])
    })

    it("acepta FREESHOW_DATA_PATH vacio sin lanzar (usa default ~/Documents/FreeShow)", () => {
        // Solo verifica que no lanza al instanciar y escanear carpeta vacia o inexistente.
        expect(() => new FreeShowBibleProvider("").listAvailableVersions()).not.toThrow()
    })
})
