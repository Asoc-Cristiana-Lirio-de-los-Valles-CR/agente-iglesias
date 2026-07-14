/**
 * Registro de versiones biblicas y su mapeo por proveedor.
 *
 * Anadir una version nueva = una entrada aqui (y, para API.Bible, el id real
 * de esa version en su catalogo). No hace falta tocar el nucleo.
 *
 * Los ids de API.Bible son ejemplos/placeholders: cada cuenta puede tener
 * acceso a unos u otros. Verifica los ids reales en https://scripture.api.bible
 * (endpoint /v1/bibles) y ajustalos aqui o via la tabla `translations`.
 */

export interface VersionInfo {
    /** Codigo interno usado en las referencias (ej. "RVR1960"). */
    code: string
    /** Nombre completo para mostrar. */
    name: string
    /** Idioma. */
    language: string
    /** Id de esta version en API.Bible (si aplica). */
    apiBibleId?: string
}

export const VERSIONS: Record<string, VersionInfo> = {
    RVR1960: {
        code: "RVR1960",
        name: "Reina-Valera 1960",
        language: "es",
        apiBibleId: "592420522e16049f-01",
    },
    NTV: {
        code: "NTV",
        name: "Nueva Traduccion Viviente",
        language: "es",
        apiBibleId: "",
    },
    NVI: {
        code: "NVI",
        name: "Nueva Version Internacional",
        language: "es",
        apiBibleId: "",
    },
    TLA: {
        code: "TLA",
        name: "Traduccion en Lenguaje Actual",
        language: "es",
        apiBibleId: "",
    },
    PDT: {
        code: "PDT",
        name: "Palabra de Dios para Todos",
        language: "es",
        apiBibleId: "",
    },
    DHH: {
        code: "DHH",
        name: "Dios Habla Hoy",
        language: "es",
        apiBibleId: "",
    },
    // Codigos adicionales que FreeShowBibleProvider puede derivar de archivos
    // instalados (VERSION_ALIASES): deben estar aqui para que el parser los
    // reconozca como version inline al final de una referencia.
    RVR1909: {
        code: "RVR1909",
        name: "Reina-Valera 1909",
        language: "es",
        apiBibleId: "",
    },
    LBLA: {
        code: "LBLA",
        name: "La Biblia de Las Americas",
        language: "es",
        apiBibleId: "",
    },
    BDHH: {
        code: "BDHH",
        name: "Biblia Dios Habla Hoy",
        language: "es",
        apiBibleId: "",
    },
    NBD: {
        code: "NBD",
        name: "Nueva Biblia al Dia",
        language: "es",
        apiBibleId: "",
    },
    BLP: {
        code: "BLP",
        name: "La Palabra",
        language: "es",
        apiBibleId: "",
    },
    CST: {
        code: "CST",
        name: "Castilian",
        language: "es",
        apiBibleId: "",
    },
}

/** Normaliza un codigo de version (mayusculas, sin espacios). */
export function normalizeVersion(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, "")
}

/** Devuelve true si la version esta registrada. */
export function isKnownVersion(code: string): boolean {
    return normalizeVersion(code) in VERSIONS
}

export function getVersion(code: string): VersionInfo | undefined {
    return VERSIONS[normalizeVersion(code)]
}
