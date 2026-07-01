import { describe, it, expect } from "vitest"
import { buildShow, formatReferenceName } from "../src/modules/scripture/showBuilder.js"
import { TemplateService } from "../src/services/templates/TemplateService.js"
import type { SlideTemplate } from "../src/types/index.js"

const templates = new TemplateService("./plantillas")

describe("formatReferenceName", () => {
    it("rango", () => {
        expect(formatReferenceName("Mateo", 2, 2, 6, "NTV")).toBe("Mateo 2:2-6 NTV")
    })
    it("versiculo unico", () => {
        expect(formatReferenceName("Juan", 3, 16, 16, "RVR1960")).toBe("Juan 3:16 RVR1960")
    })
})

describe("buildShow", () => {
    const template: SlideTemplate = templates.get("Default")

    it("crea una diapositiva por versiculo con 3 items (titulo/contenido/pie)", () => {
        const verses = [
            { verse: 1, text: "uno" },
            { verse: 2, text: "dos" },
            { verse: 3, text: "tres" },
        ]
        const { show, name, slides } = buildShow({ bookId: "PSA", bookName: "Salmos", chapter: 23, version: "NTV", verses, template })

        expect(slides).toBe(3)
        expect(name).toBe("Salmos 23:1-3 NTV")

        const slideIds = Object.keys(show.slides)
        expect(slideIds).toHaveLength(3)

        const first = show.slides[slideIds[0]]
        expect(first.items).toHaveLength(3)
        expect(first.items[0].lines[0].text[0].value).toBe("") // titulo vacio (referencia va al pie)
        expect(first.items[1].lines[0].text[0].value).toBe("1 ") // numero de versiculo (segmento superindice)
        expect(first.items[1].lines[0].text[1].value).toBe("uno") // texto del versiculo
        expect(first.items[2].lines[0].text[0].value).toBe("SAL 23:1 — NTV") // pie con referencia en mayusculas
    })

    it("el layout ordena las diapositivas y apunta a slides existentes", () => {
        const verses = [
            { verse: 5, text: "a" },
            { verse: 6, text: "b" },
        ]
        const { show } = buildShow({ bookName: "Juan", chapter: 3, version: "NTV", verses, template })
        const layoutId = show.settings.activeLayout
        const layout = show.layouts[layoutId]
        expect(layout.slides).toHaveLength(2)
        for (const ls of layout.slides) {
            expect(show.slides[ls.id]).toBeDefined()
        }
    })

    it("falla si no hay versiculos", () => {
        expect(() => buildShow({ bookId: "JHN", bookName: "Juan", chapter: 3, version: "NTV", verses: [], template })).toThrow()
    })
})

describe("TemplateService", () => {
    it("lista las plantillas incluidas", () => {
        const list = templates.list()
        expect(list).toContain("Default")
        expect(list).toContain("LirioDeLosValles")
    })

    it("lanza error claro si la plantilla no existe", () => {
        expect(() => templates.get("NoExiste")).toThrow(/no encontrada/i)
    })
})
