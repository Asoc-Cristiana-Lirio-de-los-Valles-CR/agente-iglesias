/**
 * Reglas de segmentacion: una diapositiva por versiculo.
 *
 * Para rangos explicitos, expande [inicio..fin]. Para capitulos completos, el
 * numero real de versiculos lo determina el proveedor (no se conoce aqui).
 */

/** Expande un rango inclusivo a la lista de numeros de versiculo. */
export function expandRange(start: number, end: number): number[] {
    if (end < start) throw new Error(`Rango invalido: ${start}-${end}`)
    const out: number[] = []
    for (let v = start; v <= end; v++) out.push(v)
    return out
}

/** Numero de diapositivas para un rango explicito (= numero de versiculos). */
export function slideCount(start: number, end: number): number {
    return expandRange(start, end).length
}
