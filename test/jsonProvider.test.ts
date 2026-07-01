import { describe, it, expect } from "vitest"
import { JsonProvider } from "../src/services/bible/providers/jsonProvider.js"
import type { BibleReference } from "../src/types/index.js"

const provider = new JsonProvider("./data/biblias")

function ref(over: Partial<BibleReference>): BibleReference {
    return {
        raw: "",
        bookId: "JHN",
        bookName: "Juan",
        chapter: 3,
        wholeChapter: false,
        version: "RVR1909",
        ...over,
    }
}

describe("JsonProvider (Biblia de ejemplo RVR1909)", () => {
    it("lee un rango de versiculos", async () => {
        const verses = await provider.getVerses(ref({ verseStart: 16, verseEnd: 18 }))
        expect(verses).toHaveLength(3)
        expect(verses[0].verse).toBe(16)
        expect(verses[0].text).toMatch(/amo Dios al mundo/i)
    })

    it("lee un capitulo completo (Salmos 23 -> 6 versiculos)", async () => {
        const verses = await provider.getVerses(
            ref({ bookId: "PSA", chapter: 23, wholeChapter: true, verseStart: undefined, verseEnd: undefined }),
        )
        expect(verses).toHaveLength(6)
        expect(verses.map((v) => v.verse)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("devuelve [] si la version no existe (para permitir fallback)", async () => {
        const verses = await provider.getVerses(ref({ version: "NOEXISTE", verseStart: 16, verseEnd: 16 }))
        expect(verses).toEqual([])
    })
})
