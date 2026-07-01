import { describe, it, expect } from "vitest"
import { BOOKS, normalize, ALIAS_INDEX, getBookById } from "../src/modules/scripture/bookNames.js"

describe("bookNames", () => {
    it("incluye los 66 libros", () => {
        expect(BOOKS).toHaveLength(66)
    })

    it("normalize quita acentos y pasa a minusculas", () => {
        expect(normalize("Génesis")).toBe("genesis")
        expect(normalize("  ÉXODO  ")).toBe("exodo")
        expect(normalize("Nahúm")).toBe("nahum")
    })

    it("el indice de alias esta ordenado por longitud descendente", () => {
        for (let i = 1; i < ALIAS_INDEX.length; i++) {
            expect(ALIAS_INDEX[i - 1].alias.length).toBeGreaterThanOrEqual(ALIAS_INDEX[i].alias.length)
        }
    })

    it("getBookById resuelve ids canonicos", () => {
        expect(getBookById("JHN")?.name).toBe("Juan")
        expect(getBookById("1CO")?.name).toBe("1 Corintios")
        expect(getBookById("XXX")).toBeUndefined()
    })

    it("no hay ids duplicados", () => {
        const ids = BOOKS.map((b) => b.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
