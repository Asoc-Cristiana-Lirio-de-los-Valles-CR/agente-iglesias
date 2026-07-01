import type { AIProvider, AICompletionOptions } from "../AIProvider.js"

/**
 * Proveedor de IA usando la API de DeepSeek (compatible con el formato
 * Chat Completions de OpenAI).
 */
export class DeepSeekProvider implements AIProvider {
    readonly name = "deepseek"
    private endpoint = "https://api.deepseek.com/chat/completions"

    constructor(
        private apiKey: string,
        private defaultModel = "deepseek-chat",
        private fetchFn: typeof fetch = fetch,
    ) {}

    async complete(prompt: string, opts: AICompletionOptions = {}): Promise<string> {
        if (!this.apiKey) throw new Error("DeepSeek: falta AI_API_KEY")
        const messages: { role: string; content: string }[] = []
        if (opts.system) messages.push({ role: "system", content: opts.system })
        messages.push({ role: "user", content: prompt })

        const res = await this.fetchFn(this.endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
                model: opts.model ?? this.defaultModel,
                max_tokens: opts.maxTokens ?? 1024,
                temperature: opts.temperature ?? 0.7,
                messages,
            }),
        })
        if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        return json.choices?.[0]?.message?.content ?? ""
    }
}
