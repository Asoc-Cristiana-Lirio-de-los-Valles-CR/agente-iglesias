import type { SlideTemplate, TemplateBox, Verse } from "../../types/index.js"
import type { FsShow, FsSlide, FsItem } from "../../services/freeshow/showFormat.js"
import { BOOKS } from "./bookNames.js"

/** Mapa bookId -> abreviatura oficial en espanol (ej. "JHN" -> "Jn"). */
const SHORT_BY_ID = new Map(BOOKS.map((b) => [b.id, b.short]))

/**
 * @see stableId — reemplaza uid() en la generacion de slide/layout ids
 * Id determinista basado en el contenido: mismos parametros -> mismo id.
 * Necesario para que sameContent() en ProjectSynchronizer detecte slides
 * sin cambios (uid() aleatorio romperia la comparacion en cada ejecucion).
 * Usa djb2 hash sobre el seed, produciendo 8 caracteres hex estables.
 */
function stableId(seed: string): string {
    let h = 5381
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) + h) ^ seed.charCodeAt(i)
        h |= 0 // mantener 32 bits
    }
    return (h >>> 0).toString(16).padStart(8, "0")
}

export interface BuildShowParams {
    bookId: string
    bookName: string
    chapter: number
    version: string
    verses: Verse[]
    template: SlideTemplate
}

/**
 * Nombre obligatorio de proyecto/show:
 *   "[Libro] [Cap]:[VersIni]-[VersFin] [Version]"  (rango)
 *   "[Libro] [Cap]:[Vers] [Version]"               (un solo versiculo)
 */
export function formatReferenceName(
    bookName: string,
    chapter: number,
    verseStart: number,
    verseEnd: number,
    version: string,
): string {
    const range = verseStart === verseEnd ? `${verseStart}` : `${verseStart}-${verseEnd}`
    return `${bookName} ${chapter}:${range} ${version}`
}

/** Construye el objeto Show de FreeShow: una diapositiva por versiculo. */
export function buildShow(params: BuildShowParams): { show: FsShow; name: string; slides: number } {
    const { bookId, bookName, chapter, version, verses, template } = params
    if (verses.length === 0) throw new Error("No hay versiculos para construir el show")

    const verseStart = verses[0].verse
    const verseEnd = verses[verses.length - 1].verse
    const name = formatReferenceName(bookName, chapter, verseStart, verseEnd, version)

    // Abreviatura del libro para el titulo de cada diapositiva (ej. "Jn", "Sal", "1 Co").
    const bookShort = SHORT_BY_ID.get(bookId) ?? bookName

    const slides: { [id: string]: FsSlide } = {}
    const layoutSlides: { id: string }[] = []

    for (const v of verses) {
        const slideId = stableId(`${bookName}-${chapter}-${v.verse}-${version}`)
        const group = `${bookName} ${chapter}:${v.verse}`
        // Referencia abreviada en mayusculas para mejor legibilidad en proyeccion (ej. "JN 3:16 — RVR1960").
        const slideRef = `${bookShort.toUpperCase()} ${chapter}:${v.verse} — ${version}`
        slides[slideId] = {
            group,
            color: null,
            settings: {},
            notes: "",
            items: [
                buildTextItem("", template.title),
                buildVerseContentItem(v.verse, v.text, template.content),
                buildTextItem(slideRef, template.footer),
            ],
        }
        layoutSlides.push({ id: slideId })
    }

    const layoutId = stableId(`layout-${name}`)
    const now = Date.now()

    const show: FsShow = {
        name,
        category: "scripture",
        settings: { activeLayout: layoutId, template: null },
        timestamps: { created: now, modified: now, used: null },
        meta: { title: name },
        slides,
        layouts: { [layoutId]: { name: "Default", notes: "", slides: layoutSlides } },
        media: {},
    }

    return { show, name, slides: verses.length }
}

/** Construye un item de texto de FreeShow aplicando un cuadro de plantilla. */
function buildTextItem(text: string, box: TemplateBox): FsItem {
    return {
        type: "text",
        style: boxToStyle(box),
        align: valignToCss(box.valign),
        lines: [
            {
                align: `text-align:${box.align};`,
                text: [{ value: text, style: textStyle(box) }],
            },
        ],
    }
}

/**
 * Construye el item de contenido de un versiculo con el numero al inicio
 * en superindice (misma fuente y color, ~60% del tamaño del texto principal).
 */
function buildVerseContentItem(verseNumber: number, text: string, box: TemplateBox): FsItem {
    const numSize = Math.round(box.fontSize * 0.58)
    const numStyle = `font-size:${numSize}px;color:${box.color};font-family:${box.fontFamily};vertical-align:super;`
    const bodyStyle = textStyle(box)
    return {
        type: "text",
        style: boxToStyle(box),
        align: valignToCss(box.valign),
        lines: [
            {
                align: `text-align:${box.align};`,
                text: [
                    { value: `${verseNumber} `, style: numStyle },
                    { value: text, style: bodyStyle },
                ],
            },
        ],
    }
}

function boxToStyle(box: TemplateBox): string {
    return `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;`
}

function textStyle(box: TemplateBox): string {
    let s = `font-size:${box.fontSize}px;color:${box.color};font-family:${box.fontFamily};`
    if (box.bold) s += "font-weight:bold;"
    if (box.italic) s += "font-style:italic;"
    return s
}

function valignToCss(valign: TemplateBox["valign"]): string {
    const map = { top: "flex-start", center: "center", bottom: "flex-end" } as const
    return `align-items:${map[valign]};`
}
