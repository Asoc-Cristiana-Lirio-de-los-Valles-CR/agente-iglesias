import type { SlideTemplate, TemplateBox, Verse } from "../../types/index.js"
import type { FsShow, FsSlide, FsItem } from "../../services/freeshow/showFormat.js"

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
    const { bookName, chapter, version, verses, template } = params
    if (verses.length === 0) throw new Error("No hay versiculos para construir el show")

    const verseStart = verses[0].verse
    const verseEnd = verses[verses.length - 1].verse
    const name = formatReferenceName(bookName, chapter, verseStart, verseEnd, version)

    const slides: { [id: string]: FsSlide } = {}
    const layoutSlides: { id: string }[] = []

    for (const v of verses) {
        const slideId = stableId(`${bookName}-${chapter}-${v.verse}-${version}`)
        const group = `${bookName} ${chapter}:${v.verse}`
        slides[slideId] = {
            group,
            color: null,
            settings: {},
            notes: "",
            items: [
                buildTitleContentItem(group, v.verse, v.text, template.title, template.content),
                buildTextItem(version, template.footer),
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

// ---- Ajuste automatico de tamaño de fuente (auto-fit conservador) ----
// FreeShow centra el texto verticalmente (align-items:center) sin recortar
// overflow: un versiculo largo puede desbordar el cuadro tanto hacia arriba
// (invadiendo el titulo) como hacia abajo. Sin libreria de metricas de fuente
// en el proyecto, esto es una heuristica aproximada y deliberadamente
// conservadora: el tamaño original de la plantilla se mantiene siempre que el
// texto quepa (aunque ocupe varias lineas); solo se reduce cuando la
// estimacion indica que el bloque de texto excedera la altura de la caja.
const AVG_CHAR_WIDTH_RATIO = 0.55 // ancho promedio de caracter ~ 0.55 * fontSize (sans-serif negrita)
const LINE_HEIGHT_RATIO = 1.35 // alto de linea real: se aplica como `line-height` en el CSS Y se usa para estimar el desborde (un solo numero, no dos conceptos separados — mismo principio que TITLE_GAP)
const SHRINK_STEP = 0.92 // factor de reduccion por iteracion
const MIN_FONT_SCALE = 0.5 // piso: nunca reducir mas del 50% del tamaño original de la plantilla
const TITLE_GAP = 24 // margen REAL (px) entre titulo y cuerpo: se aplica como margin-top en la linea de contenido Y se resta del presupuesto de alto (mismo espacio, no dos conceptos separados)

/** Estima cuantas lineas ocupara `text` al envolver por palabras dentro de `boxWidth` a `fontSize`. */
function estimateWrappedLineCount(text: string, fontSize: number, boxWidth: number): number {
    const avgCharWidth = fontSize * AVG_CHAR_WIDTH_RATIO
    const maxCharsPerLine = Math.max(1, Math.floor(boxWidth / avgCharWidth))
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return 1

    let lines = 1
    let currentLineLen = 0
    for (const word of words) {
        const candidateLen = currentLineLen === 0 ? word.length : currentLineLen + 1 + word.length
        if (candidateLen > maxCharsPerLine && currentLineLen > 0) {
            lines++
            currentLineLen = word.length
        } else {
            currentLineLen = candidateLen
        }
    }
    return lines
}

/** Estima el alto total del bloque de texto envuelto a `fontSize`. */
function estimateBlockHeight(text: string, fontSize: number, boxWidth: number): number {
    return estimateWrappedLineCount(text, fontSize, boxWidth) * fontSize * LINE_HEIGHT_RATIO
}

/**
 * Calcula el fontSize a usar para que `text` quepa (aproximadamente) dentro
 * de `box.height`, partiendo de `box.fontSize` y reduciendo en pasos hasta
 * un piso del 50% del tamaño original. Devuelve `box.fontSize` sin cambios
 * si el texto ya cabe (no reduce solo porque el texto ocupe varias lineas).
 * Pura, sin efectos secundarios.
 */
export function fitFontSize(text: string, box: Pick<TemplateBox, "width" | "height" | "fontSize">): number {
    const minFontSize = box.fontSize * MIN_FONT_SCALE
    let fontSize = box.fontSize
    while (fontSize > minFontSize && estimateBlockHeight(text, fontSize, box.width) > box.height) {
        fontSize = Math.max(fontSize * SHRINK_STEP, minFontSize)
    }
    return Math.round(fontSize)
}

// ---- Fusion titulo + contenido en un solo bloque centrado ----
// title y content son dos cajas independientes en la plantilla, cada una
// centrada por separado dentro de su propio alto fijo: el hueco entre ambas
// no es proporcional (varia segun cuanto texto tenga el versiculo, sin
// relacion visual con el titulo). Se fusionan en UN item con 2 lineas
// (titulo, luego numero+texto) dentro de la caja combinada, centrado como
// una sola unidad — el titulo conserva siempre su propia tipografia/tamaño,
// solo la geometria se fusiona. No se toca la plantilla ni su esquema: todo
// se deriva de title/content tal como ya existen.

/**
 * Envolvente vertical de ambas cajas. Horizontal: usa left/width de `contentBox`
 * (no una union) — es la caja cuyo ancho determina el word-wrap del texto del
 * versiculo; title siempre es una referencia corta de una sola linea, centrada
 * en el mismo eje horizontal que content en todas las plantillas actuales.
 */
export function combineTitleAndContentBox(
    titleBox: Pick<TemplateBox, "top" | "left" | "width" | "height">,
    contentBox: Pick<TemplateBox, "top" | "left" | "width" | "height">,
): { top: number; left: number; width: number; height: number } {
    const top = Math.min(titleBox.top, contentBox.top)
    const bottom = Math.max(titleBox.top + titleBox.height, contentBox.top + contentBox.height)
    return { top, left: contentBox.left, width: contentBox.width, height: bottom - top }
}

/**
 * Alto disponible para el cuerpo del versiculo dentro del bloque combinado:
 * el alto combinado menos una linea de titulo (se asume que el titulo siempre
 * renderiza en una sola linea) y `TITLE_GAP` — el mismo margen que se aplica
 * como `margin-top` real en la linea de contenido (ver `buildTitleContentItem`),
 * asi el presupuesto refleja el espacio que realmente se consume, no una
 * reserva matematica sin efecto visible.
 */
export function contentHeightBudget(
    titleBox: Pick<TemplateBox, "top" | "left" | "width" | "height" | "fontSize">,
    contentBox: Pick<TemplateBox, "top" | "left" | "width" | "height">,
): number {
    const combined = combineTitleAndContentBox(titleBox, contentBox)
    const titleLineHeight = Math.ceil(titleBox.fontSize * LINE_HEIGHT_RATIO)
    return Math.max(0, combined.height - titleLineHeight - TITLE_GAP)
}

/** Construye el item fusionado titulo+contenido de una diapositiva. */
function buildTitleContentItem(titleText: string, verseNumber: number, verseText: string, titleBox: TemplateBox, contentBox: TemplateBox): FsItem {
    const combined = combineTitleAndContentBox(titleBox, contentBox)
    const fittedFontSize = fitFontSize(verseText, { width: contentBox.width, height: contentHeightBudget(titleBox, contentBox), fontSize: contentBox.fontSize })
    const numSize = Math.round(fittedFontSize * 0.58)
    const numStyle = `font-size:${numSize}px;color:${contentBox.color};font-family:${contentBox.fontFamily};vertical-align:super;`
    const bodyStyle = textStyle({ ...contentBox, fontSize: fittedFontSize })

    return {
        type: "text",
        style: boxToStyle(combined),
        align: valignToCss("center"), // el bloque fusionado siempre se centra como unidad
        lines: [
            { align: `text-align:${titleBox.align};`, text: [{ value: titleText, style: textStyle(titleBox) }] },
            {
                align: `text-align:${contentBox.align};margin-top:${TITLE_GAP}px;`, // espacio real entre titulo y cuerpo (antes solo se restaba del presupuesto, sin efecto visible)
                text: [
                    { value: `${verseNumber} `, style: numStyle },
                    { value: verseText, style: bodyStyle },
                ],
            },
        ],
    }
}

function boxToStyle(box: Pick<TemplateBox, "top" | "left" | "width" | "height">): string {
    return `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;`
}

function textStyle(box: TemplateBox): string {
    let s = `font-size:${box.fontSize}px;color:${box.color};font-family:${box.fontFamily};line-height:${LINE_HEIGHT_RATIO};`
    if (box.bold) s += "font-weight:bold;"
    if (box.italic) s += "font-style:italic;"
    return s
}

function valignToCss(valign: TemplateBox["valign"]): string {
    const map = { top: "flex-start", center: "center", bottom: "flex-end" } as const
    return `align-items:${map[valign]};`
}
