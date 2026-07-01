import type { AppConfig } from "../../config/ConfigService.js"
import type { AIProvider } from "./AIProvider.js"
import { ClaudeProvider } from "./providers/claudeProvider.js"
import { OpenAIProvider } from "./providers/openaiProvider.js"
import { GeminiProvider } from "./providers/geminiProvider.js"
import { DeepSeekProvider } from "./providers/deepseekProvider.js"
import { OllamaProvider } from "./providers/ollamaProvider.js"

/** Construye el proveedor de IA segun la configuracion. */
export function buildAIProvider(config: AppConfig): AIProvider {
    switch (config.AI_PROVIDER) {
        case "openai":
            return new OpenAIProvider(config.AI_API_KEY)
        case "gemini":
            return new GeminiProvider(config.AI_API_KEY)
        case "deepseek":
            return new DeepSeekProvider(config.AI_API_KEY)
        case "ollama":
            return new OllamaProvider()
        case "claude":
        default:
            return new ClaudeProvider(config.AI_API_KEY)
    }
}
