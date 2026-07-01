import type { AIProvider, AICompletionOptions } from "../AIProvider.js"

/**
 * Proveedor de IA usando Ollama (modelos locales). No requiere clave.
 * Por defecto apunta a http://localhost:11434.
 */
export class OllamaProvider implements AIProvider {
    readonly name = "ollama"

    constructor(
        private host = "http://localhost:11434",
        private defaultModel = "llama3.1",
        private fetchFn: typeof fetch = fetch,
    ) {}

    async complete(prompt: string, opts: AICompletionOptions = {}): Promise<string> {
        const res = await this.fetchFn(`${this.host}/api/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                model: opts.model ?? this.defaultModel,
                prompt,
                system: opts.system,
                stream: false,
                options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 1024 },
            }),
        })
        if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { response?: string }
        return json.response ?? ""
    }
}
