/**
 * Contrato de un proveedor de IA. El Modulo 1 NO usa IA; esta abstraccion
 * queda lista para futuros modulos (busqueda semantica, sermones, anuncios...).
 *
 * Para anadir un proveedor: implementa esta interfaz y registralo en
 * `providerFactory.ts`.
 */
export interface AICompletionOptions {
    system?: string
    maxTokens?: number
    temperature?: number
    model?: string
}

export interface AIProvider {
    readonly name: string
    /** Genera una respuesta de texto a partir de un prompt. */
    complete(prompt: string, opts?: AICompletionOptions): Promise<string>
}
