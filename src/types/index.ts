/**
 * Tipos compartidos de la plataforma.
 *
 * Aqui viven los contratos transversales (referencias biblicas, versiculos,
 * plantillas y el subconjunto del formato `Show` de FreeShow que generamos).
 * Los tipos especificos de un servicio viven junto a ese servicio.
 */

// ============================================================
//  Dominio biblico
// ============================================================

/** Referencia biblica ya parseada y normalizada. */
export interface BibleReference {
    /** Texto original tal cual lo escribio el usuario (para mensajes de error). */
    raw: string
    /** Id canonico del libro (ej. "JHN", "PSA", "1CO"). */
    bookId: string
    /** Nombre del libro en espanol para mostrar (ej. "Juan", "Salmos"). */
    bookName: string
    /** Capitulo. */
    chapter: number
    /**
     * Primer versiculo del rango. `undefined` si es una referencia de capitulo
     * completo (ej. "Salmos 23"): en ese caso el rango se resuelve al obtener
     * los versiculos del proveedor.
     */
    verseStart?: number
    /** Ultimo versiculo del rango. `undefined` si es capitulo completo. */
    verseEnd?: number
    /** true si la referencia es un capitulo completo (sin versiculos explicitos). */
    wholeChapter: boolean
    /** Codigo de version (ej. "RVR1960", "NTV"). */
    version: string
}

/** Un versiculo individual con su texto. */
export interface Verse {
    verse: number
    text: string
}

/** Versiculo con su referencia completa (capitulo/libro/version). */
export interface VerseWithRef extends Verse {
    bookId: string
    chapter: number
    version: string
}

// ============================================================
//  Plantillas visuales
// ============================================================

/** Estilo de un cuadro de texto dentro de una diapositiva. */
export interface TemplateBox {
    /** Posicion y tamano en porcentaje del lienzo (0-100) o pixeles segun unit. */
    top: number
    left: number
    width: number
    height: number
    /** Alineacion horizontal: left | center | right. */
    align: "left" | "center" | "right"
    /** Alineacion vertical: top | center | bottom. */
    valign: "top" | "center" | "bottom"
    fontFamily: string
    fontSize: number
    color: string
    bold?: boolean
    italic?: boolean
}

/** Plantilla completa para las diapositivas de versiculos. */
export interface SlideTemplate {
    /** Nombre legible de la plantilla. */
    name: string
    /** Resolucion del lienzo en pixeles. */
    resolution: { width: number; height: number }
    /** Fondo: color hex o ruta de imagen. */
    background: { type: "color" | "image"; value: string }
    /** Cuadro del titulo (referencia: "Mateo 2:2"). */
    title: TemplateBox
    /** Cuadro del contenido (texto del versiculo). */
    content: TemplateBox
    /** Cuadro del pie (version: "NTV"). */
    footer: TemplateBox
}

// ============================================================
//  Resultado de generacion (lo que devuelve el Modulo 1)
// ============================================================

export interface GenerationItemResult {
    raw: string
    ok: boolean
    /** Nombre del proyecto creado (formato obligatorio). */
    projectName?: string
    /** Numero de diapositivas generadas. */
    slides?: number
    /** Indica si se omitio por duplicado. */
    skipped?: boolean
    /** Mensaje de error si ok === false. */
    error?: string
}

export interface GenerationResult {
    total: number
    created: number
    skipped: number
    failed: number
    items: GenerationItemResult[]
}
