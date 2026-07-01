import { randomUUID } from "node:crypto"

/**
 * Genera un id unico estilo FreeShow (alfanumerico corto).
 * FreeShow usa ids cortos; usamos un UUID sin guiones recortado para legibilidad.
 */
export function uid(length = 12): string {
    return randomUUID().replace(/-/g, "").slice(0, length)
}
