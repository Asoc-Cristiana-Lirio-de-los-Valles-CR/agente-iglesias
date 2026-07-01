import type { AIProvider, AICompletionOptions } from "../AIProvider.js"

/** Proveedor de IA usando la API de OpenAI (Chat Completions). */
export class OpenAIProvider implements AIProvider {
    readonly name = "openai"
    private endpoint = "https://api.openai.com/v1/chat/completions"

    constructor(
        private apiKey: string,
        private defaultModel = "gpt-4o",
        private fetchFn: typeof fetch = fetch,
    ) {}

    async complete(prompt: string, opts: AICompletionOptions = {}): Promise<string> {
        if (!this.apiKey) throw new Error("OpenAI: falta AI_API_KEY")
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
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        return json.choices?.[0]?.message?.content ?? ""
    }
}
