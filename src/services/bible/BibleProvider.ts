import type { BibleReference, Verse } from "../../types/index.js"

/**
 * Contrato que todo proveedor biblico debe cumplir.
 *
 * Implementados: apiBible, json, sqlite.
 * Futuros (solo documentados, sin archivo aun): mysql, postgres.
 * Para anadir uno, crea una clase que implemente esta interfaz y registrala
 * en `providerFactory.ts` — el resto del sistema no cambia.
 */
export interface BibleProvider {
    /** Nombre corto del proveedor (para logs). */
    readonly name: string

    /**
     * Devuelve los versiculos del rango indicado por la referencia.
     * Debe devolver un array ordenado por numero de versiculo.
     * Si no puede resolver la referencia (version no disponible, etc.)
     * debe devolver un array vacio (no lanzar), para permitir el fallback.
     */
    getVerses(ref: BibleReference): Promise<Verse[]>
}
