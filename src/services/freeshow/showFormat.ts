/**
 * Subconjunto del formato `Show` de FreeShow que necesitamos generar.
 *
 * Basado en `src/types/Show.ts` del repositorio ChurchApps/FreeShow.
 * Solo declaramos los campos que usamos; FreeShow ignora/rellena el resto.
 */

export interface FsTextSegment {
    value: string
    style: string
}

export interface FsLine {
    align: string
    text: FsTextSegment[]
}

export interface FsItem {
    type: "text"
    lines: FsLine[]
    style: string
    align?: string
}

export interface FsSlide {
    group: string | null
    color: string | null
    settings: Record<string, unknown>
    notes: string
    items: FsItem[]
}

export interface FsLayoutSlide {
    id: string
}

export interface FsLayout {
    name: string
    notes: string
    slides: FsLayoutSlide[]
}

export interface FsShow {
    name: string
    category: string | null
    settings: {
        activeLayout: string
        template: string | null
    }
    timestamps: {
        created: number
        modified: number | null
        used: number | null
    }
    meta: Record<string, string>
    slides: { [id: string]: FsSlide }
    layouts: { [id: string]: FsLayout }
    media: Record<string, unknown>
}
