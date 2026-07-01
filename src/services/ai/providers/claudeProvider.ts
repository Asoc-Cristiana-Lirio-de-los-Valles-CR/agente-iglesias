import type { AIProvider, AICompletionOptions } from "../AIProvider.js"

/** Proveedor de IA usando la API de Claude (Anthropic). */
export class ClaudeProvider implements AIProvider {
    readonly name = "claude"
    private endpoint = "https://api.anthropic.com/v1/messages"

    constructor(
        private apiKey: string,
        private defaultModel = "claude-opus-4-8",
        private fetchFn: typeof fetch = fetch,
    ) {}

    async complete(prompt: string, opts: AICompletionOptions = {}): Promise<string> {
        if (!this.apiKey) throw new Error("Claude: falta AI_API_KEY")
        const res = await this.fetchFn(this.endpoint, {
            method: "POST",
            headers: {
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: opts.model ?? this.defaultModel,
                max_tokens: opts.maxTokens ?? 1024,
                temperature: opts.temperature ?? 0.7,
                system: opts.system,
                messages: [{ role: "user", content: prompt }],
            }),
        })
        if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { content?: { text?: string }[] }
        return json.content?.map((c) => c.text ?? "").join("") ?? ""
    }
}
