import { describe, it, expect } from "vitest"
import { parseReference, parseReferences, ReferenceParseError } from "../src/modules/scripture/referenceParser.js"

describe("parseReference", () => {
    it("rango con version: Mateo 2:2-6 NTV", () => {
        const r = parseReference("Mateo 2:2-6 NTV", "RVR1960")
        expect(r).toMatchObject({ bookId: "MAT", chapter: 2, verseStart: 2, verseEnd: 6, version: "NTV", wholeChapter: false })
    })

    it("versiculo unico: Juan 3:16 RVR1960", () => {
        const r = parseReference("Juan 3:16 RVR1960", "NTV")
        expect(r).toMatchObject({ bookId: "JHN", chapter: 3, verseStart: 16, verseEnd: 16, version: "RVR1960" })
    })

    it("abreviatura: Jn 3:16 (version por defecto)", () => {
        const r = parseReference("Jn 3:16", "RVR1960")
        expect(r).toMatchObject({ bookId: "JHN", chapter: 3, verseStart: 16, verseEnd: 16, version: "RVR1960" })
    })

    it("version por defecto con espacios/tildes (nombre real de archivo .fsb de FreeShow) no se corrompe", () => {
        const r = parseReference("Juan 3:16", "Reina-Valera 1960")
        expect(r.version).toBe("Reina-Valera 1960")
    })

    it("sin dos puntos: juan 3 16", () => {
        const r = parseReference("juan 3 16", "RVR1960")
        expect(r).toMatchObject({ bookId: "JHN", chapter: 3, verseStart: 16, verseEnd: 16 })
    })

    it("mayusculas: JUAN 3:16", () => {
        const r = parseReference("JUAN 3:16", "RVR1960")
        expect(r.bookId).toBe("JHN")
    })

    it("libro numerado abreviado: 1 Co 13 (capitulo completo)", () => {
        const r = parseReference("1 Co 13", "RVR1960")
        expect(r).toMatchObject({ bookId: "1CO", chapter: 13, wholeChapter: true })
        expect(r.verseStart).toBeUndefined()
    })

    it("libro numerado completo: 1 Corintios 13", () => {
        const r = parseReference("1 Corintios 13", "RVR1960")
        expect(r).toMatchObject({ bookId: "1CO", chapter: 13, wholeChapter: true })
    })

    it("Salmos abreviado: Sal 23 (capitulo completo)", () => {
        const r = parseReference("Sal 23", "RVR1960")
        expect(r).toMatchObject({ bookId: "PSA", chapter: 23, wholeChapter: true })
    })

    it("Salmos completo: Salmos 23", () => {
        expect(parseReference("Salmos 23", "RVR1960").bookId).toBe("PSA")
    })

    it("Apocalipsis: Ap 21 y Apocalipsis 21", () => {
        expect(parseReference("Ap 21", "RVR1960")).toMatchObject({ bookId: "REV", chapter: 21, wholeChapter: true })
        expect(parseReference("Apocalipsis 21", "RVR1960").bookId).toBe("REV")
    })

    it("rango abreviado: Mt 5:3-12", () => {
        expect(parseReference("Mt 5:3-12", "RVR1960")).toMatchObject({ bookId: "MAT", chapter: 5, verseStart: 3, verseEnd: 12 })
    })

    it("rango sin dos puntos: Mateo 5 3-12", () => {
        expect(parseReference("Mateo 5 3-12", "RVR1960")).toMatchObject({ chapter: 5, verseStart: 3, verseEnd: 12 })
    })

    it("lenguaje natural: Mateo capitulo 5 versiculos 3 al 12", () => {
        const r = parseReference("Mateo capitulo 5 versiculos 3 al 12", "RVR1960")
        expect(r).toMatchObject({ bookId: "MAT", chapter: 5, verseStart: 3, verseEnd: 12 })
    })

    it("con acentos: Génesis 1:1", () => {
        expect(parseReference("Génesis 1:1", "RVR1960").bookId).toBe("GEN")
    })

    it("Romanos 8:28-39 -> 12 versiculos", () => {
        const r = parseReference("Romanos 8:28-39", "RVR1960")
        expect(r.verseEnd! - r.verseStart! + 1).toBe(12)
    })

    it("entrada invalida lanza error", () => {
        expect(() => parseReference("xyz 1:1", "RVR1960")).toThrow(ReferenceParseError)
    })

    it("rango invalido (fin < inicio) lanza error", () => {
        expect(() => parseReference("Juan 3:16-10", "RVR1960")).toThrow(ReferenceParseError)
    })
})

describe("parseReferences (lote)", () => {
    it("separa lineas validas e invalidas", () => {
        const { references, errors } = parseReferences("Juan 3:16\n\nzzz\nSalmos 23", "RVR1960")
        expect(references).toHaveLength(2)
        expect(errors).toHaveLength(1)
    })
})
