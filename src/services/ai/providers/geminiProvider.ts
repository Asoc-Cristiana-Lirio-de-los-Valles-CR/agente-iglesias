import type { AIProvider, AICompletionOptions } from "../AIProvider.js"

/** Proveedor de IA usando la API de Google Gemini. */
export class GeminiProvider implements AIProvider {
    readonly name = "gemini"
    private base = "https://generativelanguage.googleapis.com/v1beta/models"

    constructor(
        private apiKey: string,
        private defaultModel = "gemini-1.5-pro",
        private fetchFn: typeof fetch = fetch,
    ) {}

    async complete(prompt: string, opts: AICompletionOptions = {}): Promise<string> {
        if (!this.apiKey) throw new Error("Gemini: falta AI_API_KEY")
        const model = opts.model ?? this.defaultModel
        const url = `${this.base}/${model}:generateContent?key=${this.apiKey}`
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: opts.maxTokens ?? 1024,
                    temperature: opts.temperature ?? 0.7,
                },
            }),
        })
        if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    }
}
