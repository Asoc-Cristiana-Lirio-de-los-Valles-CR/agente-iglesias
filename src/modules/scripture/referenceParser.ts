import type { BibleReference } from "../../types/index.js"
import { ALIAS_INDEX, normalize } from "./bookNames.js"
import { normalizeVersion, isKnownVersion } from "../../services/bible/versions.js"

/** Error de parseo de una linea de referencia. */
export class ReferenceParseError extends Error {}

/**
 * Parser flexible y DETERMINISTA (sin IA). Reconoce, entre otras formas:
 *   Jn 3:16 · Juan 3:16 · juan 3 16 · JUAN 3:16 · 1 Co 13 · 1 Corintios 13
 *   Sal 23 · Salmos 23 · Ap 21 · Apocalipsis 21 · Mt 5:3-12 · Mateo 5 3-12
 *   Mateo capitulo 5 versiculos 3 al 12 · Juan 3:16-18 NTV
 *
 * Estrategia:
 *   1. Separar la version (token final conocido, ej. "NTV").
 *   2. Limpiar palabras de relleno ("capitulo", "versiculos", "al"->"-").
 *   3. Detectar el libro por el alias mas largo que sea prefijo del texto.
 *   4. Parsear capitulo y (opcionalmente) versiculo/rango del resto.
 */
export function parseReference(input: string, defaultVersion: string): BibleReference {
    const raw = input.trim()
    if (!raw) throw new ReferenceParseError("Linea vacia")

    // 1. Version: ultimo token si es una version conocida.
    let working = raw
    // No normalizar el default: puede ser el nombre real de un archivo .fsb de
    // FreeShow (espacios/tildes/mayusculas mixtas, ej. "Reina-Valera 1960"), y
    // normalizeVersion (mayusculas + sin espacios) lo corromperia. normalizeVersion
    // solo aplica a codigos cortos detectados inline (ver mas abajo).
    let version = defaultVersion.trim()
    const tokens = raw.split(/\s+/)
    const lastToken = tokens[tokens.length - 1]
    if (tokens.length >= 2 && isKnownVersion(lastToken)) {
        version = normalizeVersion(lastToken)
        working = tokens.slice(0, -1).join(" ")
    }

    // 2. Limpiar relleno y normalizar separadores.
    let cleaned = normalize(working)
    cleaned = cleaned
        .replace(/\bcapitulos?\b/g, " ")
        .replace(/\bversiculos?\b/g, " ")
        .replace(/\bversos?\b/g, " ")
        .replace(/\bdel\b/g, " ")
        .replace(/\ba\b/g, "-") // "del 3 a 12"
        .replace(/\bal\b/g, "-") // "3 al 12"
        .replace(/\s+/g, " ")
        .trim()

    // 3. Detectar libro (alias mas largo que sea prefijo).
    const match = ALIAS_INDEX.find((entry) => {
        return cleaned === entry.alias || cleaned.startsWith(entry.alias + " ") || cleaned.startsWith(entry.alias + ":")
    })
    if (!match) {
        throw new ReferenceParseError(`No se reconocio el libro en "${raw}"`)
    }

    const rest = cleaned.slice(match.alias.length).trim()

    // 4. Parsear capitulo y versiculos.
    const { chapter, verseStart, verseEnd, wholeChapter } = parseNumbers(rest, raw)

    return {
        raw,
        bookId: match.book.id,
        bookName: match.book.name,
        chapter,
        verseStart,
        verseEnd,
        wholeChapter,
        version,
    }
}

interface ParsedNumbers {
    chapter: number
    verseStart?: number
    verseEnd?: number
    wholeChapter: boolean
}

/**
 * Parsea la parte numerica tras el libro. Acepta:
 *   "3:16"  "3:16-18"  "3 16"  "3 16-18"  "5:3-12"  "23"  "13"
 *   (los ":" o espacios separan capitulo de versiculo; "-" indica rango)
 */
function parseNumbers(rest: string, raw: string): ParsedNumbers {
    if (!rest) {
        throw new ReferenceParseError(`Falta el capitulo en "${raw}"`)
    }

    // Normaliza separadores: ":" -> " : ", "-" -> " - "
    const normalized = rest.replace(/[:.]/g, " : ").replace(/-/g, " - ").replace(/\s+/g, " ").trim()
    const parts = normalized.split(" ")

    // Extrae numeros y simbolos en orden.
    const chapter = toInt(parts[0], raw)
    let idx = 1

    // Si lo siguiente es ":" lo saltamos.
    if (parts[idx] === ":") idx++

    // Si no hay mas, es capitulo completo.
    if (idx >= parts.length) {
        return { chapter, wholeChapter: true }
    }

    const verseStart = toInt(parts[idx], raw)
    idx++

    // Rango?
    if (parts[idx] === "-") {
        idx++
        const verseEnd = toInt(parts[idx], raw)
        if (verseEnd < verseStart) {
            throw new ReferenceParseError(`Rango invalido (${verseStart}-${verseEnd}) en "${raw}"`)
        }
        return { chapter, verseStart, verseEnd, wholeChapter: false }
    }

    return { chapter, verseStart, verseEnd: verseStart, wholeChapter: false }
}

function toInt(token: string | undefined, raw: string): number {
    const n = Number(token)
    if (!token || !Number.isInteger(n) || n <= 0) {
        throw new ReferenceParseError(`Numero invalido ("${token ?? ""}") en "${raw}"`)
    }
    return n
}

/**
 * Parsea varias lineas (una referencia por linea). Devuelve referencias OK y
 * errores por separado, para que una linea mala no rompa el lote.
 */
export function parseReferences(
    text: string,
    defaultVersion: string,
): { references: BibleReference[]; errors: { raw: string; error: string }[] } {
    const references: BibleReference[] = []
    const errors: { raw: string; error: string }[] = []

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
            references.push(parseReference(trimmed, defaultVersion))
        } catch (err) {
            errors.push({ raw: trimmed, error: (err as Error).message })
        }
    }

    return { references, errors }
}
