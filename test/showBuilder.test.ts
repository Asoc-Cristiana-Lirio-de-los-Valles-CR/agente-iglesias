import { describe, it, expect } from "vitest"
import { buildShow, formatReferenceName, fitFontSize, combineTitleAndContentBox, contentHeightBudget } from "../src/modules/scripture/showBuilder.js"
import { TemplateService } from "../src/services/templates/TemplateService.js"
import type { SlideTemplate } from "../src/types/index.js"

const templates = new TemplateService("./plantillas")

/** Genera N palabras de 7 caracteres (ej. "PALABRA0 PALABRA1 ..."): con la caja de Escritura
 *  (width 1720, fontSize 88) cada linea contiene exactamente 4 palabras, asi que N palabras
 *  envuelven en exactamente ceil(N/4) lineas, sin ambiguedad de donde corta cada linea. */
function wordsOfLength7(count: number): string {
    return Array.from({ length: count }, (_, i) => `PALABRA${i % 10}`).join(" ")
}

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

    it("crea una diapositiva por versiculo con 2 items (titulo+contenido fusionado / pie)", () => {
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
        expect(first.items).toHaveLength(2) // titulo+contenido fusionados en un solo item, pie aparte
        expect(first.items[0].lines[0].text[0].value).toBe("Salmos 23:1") // titulo: linea 0 del item fusionado
        expect(first.items[0].lines[1].text[0].value).toBe("1 ") // numero de versiculo: linea 1, segmento superindice
        expect(first.items[0].lines[1].text[1].value).toBe("uno") // texto del versiculo: linea 1, segundo segmento
        expect(first.items[1].lines[0].text[0].value).toBe("NTV") // pie con la version (ahora items[1])
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

describe("fitFontSize (auto-ajuste conservador de tamaño de fuente)", () => {
    it("no reduce un texto corto que cabe holgadamente", () => {
        const box = { width: 1720, height: 720, fontSize: 88 }
        expect(fitFontSize("Dios amo tanto al mundo", box)).toBe(88)
    })

    it("un texto extremadamente largo cae exactamente en el piso (50% del tamaño original)", () => {
        const box = { width: 1720, height: 720, fontSize: 88 }
        // 300 palabras de 7 caracteres: incluso al tamaño minimo (44px) desborda por mucho.
        expect(fitFontSize(wordsOfLength7(300), box)).toBe(44)
    })
})

describe("buildShow + plantilla Escritura (auto-ajuste conservador, no invade el titulo)", () => {
    const escritura = templates.get("Escritura")

    function bodyAndNumSize(text: string): { bodySize: number; numSize: number } {
        const { show } = buildShow({ bookId: "JHN", bookName: "Juan", chapter: 3, version: "NTV", verses: [{ verse: 16, text }], template: escritura })
        const titleContentItem = Object.values(show.slides)[0].items[0]
        const numStyle = titleContentItem.lines[1].text[0].style
        const bodyStyle = titleContentItem.lines[1].text[1].style
        return {
            bodySize: Number(bodyStyle.match(/font-size:(\d+)px/)![1]),
            numSize: Number(numStyle.match(/font-size:(\d+)px/)![1]),
        }
    }

    it("versiculo de una sola linea conserva exactamente 88px", () => {
        const { bodySize } = bodyAndNumSize("Porque de tal manera amo Dios al mundo.")
        expect(bodySize).toBe(88)
    })

    it("versiculo medio (5 lineas estimadas) tambien conserva exactamente 88px — no reduce solo por ocupar varias lineas", () => {
        const { bodySize } = bodyAndNumSize(wordsOfLength7(20)) // 20 palabras / 4 por linea = 5 lineas -> 550px, cabe holgado
        expect(bodySize).toBe(88)
    })

    it("solo un versiculo realmente largo reduce el tamaño, y el numero de versiculo se mantiene proporcional (~58% del cuerpo)", () => {
        const { bodySize, numSize } = bodyAndNumSize(wordsOfLength7(300)) // ~75 lineas a 88px, desborda claramente
        expect(bodySize).toBeLessThan(88)
        expect(bodySize).toBeGreaterThanOrEqual(44) // nunca por debajo del piso del 50%
        expect(numSize).toBe(Math.round(bodySize * 0.58))
    })

    it("el titulo nunca se auto-ajusta, aunque el cuerpo caiga hasta el piso del 50%", () => {
        const { show } = buildShow({
            bookId: "JHN",
            bookName: "Juan",
            chapter: 3,
            version: "NTV",
            verses: [{ verse: 16, text: wordsOfLength7(300) }],
            template: escritura,
        })
        const titleStyle = Object.values(show.slides)[0].items[0].lines[0].text[0].style
        expect(titleStyle).toContain("font-size:70px") // fontSize original del title de Escritura, sin cambio
    })

})

describe("combineTitleAndContentBox (fusion geometrica titulo+contenido)", () => {
    it("Escritura: title y content comparten left/width, el alto combinado abarca ambas cajas", () => {
        const t = templates.get("Escritura")
        expect(combineTitleAndContentBox(t.title, t.content)).toEqual({ top: 40, left: 100, width: 1720, height: 860 })
    })

    it("LirioDeLosValles: title y content tienen left/width DISTINTOS — el bloque usa el de content, no una union", () => {
        const t = templates.get("LirioDeLosValles")
        expect(combineTitleAndContentBox(t.title, t.content)).toEqual({ top: 70, left: 200, width: 1520, height: 780 })
    })
})

describe("contentHeightBudget (presupuesto de alto para el cuerpo, reservando la linea del titulo + margen real)", () => {
    it("Escritura: 860 (combinado) - 95 (linea de titulo a 70px x 1.35) - 24 (TITLE_GAP) = 741", () => {
        const t = templates.get("Escritura")
        expect(contentHeightBudget(t.title, t.content)).toBe(741)
    })

    it("LirioDeLosValles: 780 (combinado) - 79 (linea de titulo a 58px x 1.35, redondeada hacia arriba) - 24 (TITLE_GAP) = 677", () => {
        const t = templates.get("LirioDeLosValles")
        expect(contentHeightBudget(t.title, t.content)).toBe(677)
    })
})

describe("textStyle — line-height real (antes solo existia en el calculo de fitFontSize, sin efecto visible)", () => {
    it("el texto del versiculo lleva line-height real, sincronizado con LINE_HEIGHT_RATIO", () => {
        const escritura = templates.get("Escritura")
        const { show } = buildShow({ bookId: "JHN", bookName: "Juan", chapter: 3, version: "NTV", verses: [{ verse: 16, text: "Porque de tal manera amo Dios al mundo." }], template: escritura })
        const bodyStyle = Object.values(show.slides)[0].items[0].lines[1].text[1].style
        expect(bodyStyle).toContain("line-height:1.35;")
    })
})

describe("buildTitleContentItem — margen real entre titulo y cuerpo", () => {
    it("la linea de contenido lleva margin-top real (no solo una reserva matematica sin efecto visible)", () => {
        const escritura = templates.get("Escritura")
        const { show } = buildShow({ bookId: "JHN", bookName: "Juan", chapter: 3, version: "NTV", verses: [{ verse: 16, text: "Porque de tal manera amo Dios al mundo." }], template: escritura })
        const contentLineAlign = Object.values(show.slides)[0].items[0].lines[1].align
        expect(contentLineAlign).toContain("margin-top:24px;")
    })
})

describe("buildShow + plantilla con geometria title/content distinta (LirioDeLosValles)", () => {
    it("el item fusionado usa la geometria de content, no la de title (mas ancha)", () => {
        const lirio = templates.get("LirioDeLosValles")
        const { show } = buildShow({ bookId: "JHN", bookName: "Juan", chapter: 3, version: "NTV", verses: [{ verse: 16, text: "Porque de tal manera amo Dios al mundo." }], template: lirio })
        const titleContentItem = Object.values(show.slides)[0].items[0]
        expect(titleContentItem.style).toBe("top:70px;left:200px;width:1520px;height:780px;")
    })
})

describe("plantilla Escritura — geometria titulo/contenido (Fix A: ya no se solapan)", () => {
    it("content empieza despues del final de title, con margen, y el borde inferior no cambia", () => {
        const t = templates.get("Escritura")
        expect(t.title.top).toBe(40)
        expect(t.title.height).toBe(130) // title termina en y=170
        expect(t.content.top).toBe(180) // 10px de margen tras el fin del title
        expect(t.content.height).toBe(720)
        expect(t.content.top + t.content.height).toBe(900) // borde inferior sin cambios (footer empieza en 930)
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
