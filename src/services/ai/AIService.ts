import type { AIProvider, AICompletionOptions } from "./AIProvider.js"

/**
 * AIService: fachada sobre el proveedor de IA activo.
 *
 * IMPORTANTE: el Modulo 1 (versiculos) NO usa este servicio. Existe como punto
 * de extension para futuros modulos (busqueda semantica de pasajes, generacion
 * de sermones, anuncios, etc.). Cambiar de proveedor = una linea en .env.
 */
export class AIService {
    constructor(private provider: AIProvider) {}

    get providerName(): string {
        return this.provider.name
    }

    complete(prompt: string, opts?: AICompletionOptions): Promise<string> {
        return this.provider.complete(prompt, opts)
    }
}
