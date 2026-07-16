import { describe, it, expect } from "vitest"
import { deriveInitialsCode } from "../src/services/bible/providers/freeshowBibleProvider.js"

describe("deriveInitialsCode (codigo corto autogenerado para chips sin alias conocido)", () => {
    it("un solo token corto se mantiene tal cual", () => {
        expect(deriveInitialsCode("RVC")).toBe("RVC")
    })
    it("dos palabras sin stopwords -> iniciales", () => {
        expect(deriveInitialsCode("Biblia Jerusalén")).toBe("BJ")
    })
    it("numero final se preserva pegado a las iniciales", () => {
        expect(deriveInitialsCode("Biblia Latinoamericana 95")).toBe("BL95")
    })
    it("stopword 'de' se excluye de las iniciales", () => {
        expect(deriveInitialsCode("Biblia Latinoamericana de Hoy")).toBe("BLH")
    })
    it("varias stopwords se excluyen (de, los)", () => {
        expect(deriveInitialsCode("Nueva Biblia de los Hispanos")).toBe("NBH")
    })
    it("el guion se trata como separador de palabra", () => {
        expect(deriveInitialsCode("Reina-Valera Contemporanea")).toBe("RVC")
    })
    it("nombre con guion y numero final (con y sin guion dan el mismo codigo)", () => {
        expect(deriveInitialsCode("Reina-Valera Gómez 2004")).toBe("RVG2004")
        expect(deriveInitialsCode("Reina Valera Gómez 2004")).toBe("RVG2004")
    })
})
