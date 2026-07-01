import { z } from "zod"

/**
 * ConfigService: lee la configuracion desde variables de entorno (.env),
 * la valida y la expone tipada. Es la unica fuente de verdad para opciones
 * de ejecucion; ningun modulo lee `process.env` directamente.
 *
 * NO carga dotenv por si mismo: cada entry point (src/index.ts, src/electron/main.ts)
 * es responsable de cargar el .env correcto antes de llamar a loadConfig().
 * Esto permite a Electron apuntar al .env en %APPDATA% sin modificar este modulo.
 *
 * (La configuracion persistida por usuario en SQLite se gestiona aparte, en
 * el repositorio `config`; este servicio cubre el arranque del proceso.)
 */

const schema = z.object({
    WEB_PORT: z.coerce.number().int().positive().default(3000),

    FREESHOW_HOST: z.string().default("127.0.0.1"),
    FREESHOW_PORT: z.coerce.number().int().positive().default(5506),
    /** Puerto del WebSocket (socket.io) de FreeShow. */
    FREESHOW_WS_PORT: z.coerce.number().int().positive().default(5505),
    FREESHOW_TRANSPORT: z.enum(["rest", "ws"]).default("rest"),

    BIBLE_PROVIDER: z.enum(["local", "apibible", "json", "sqlite"]).default("local"),
    BIBLE_API_KEY: z.string().optional().default(""),
    LOCAL_BIBLE_PATH: z.string().default("./data/biblias"),
    /** Carpeta raiz de datos de FreeShow (contiene Bibles/, Shows/, etc.). Vacio = default de FreeShow (~/Documents/FreeShow). */
    FREESHOW_DATA_PATH: z.string().optional().default(""),
    DEFAULT_VERSION: z.string().default("RVR1960"),

    AI_PROVIDER: z.enum(["claude", "openai", "gemini", "deepseek", "ollama"]).default("claude"),
    AI_API_KEY: z.string().optional().default(""),

    TEMPLATE: z.string().default("Escritura"),
    /** Ruta absoluta a la carpeta de plantillas. En Electron empaquetado la inyecta main.ts; en dev usa el default. */
    TEMPLATES_PATH: z.string().default("./plantillas"),
    DB_PATH: z.string().default("./data/app.db"),

    /** Canal de actualizaciones automaticas: stable (releases oficiales) o beta. */
    UPDATE_CHANNEL: z.enum(["stable", "beta"]).default("stable"),

    ON_DUPLICATE: z.enum(["skip", "replace"]).default("skip"),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
    DRY_RUN: z
        .string()
        .optional()
        .transform((v) => v === "true")
        .pipe(z.boolean())
        .default("false"),
})

export type AppConfig = z.infer<typeof schema>

let cached: AppConfig | null = null

/** Carga y valida la configuracion (memoizada). Lanza error si es invalida. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    if (cached) return cached
    const parsed = schema.safeParse(env)
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
        throw new Error(`Configuracion invalida (.env):\n${issues}`)
    }
    cached = parsed.data
    return cached
}

/** Util para pruebas: reinicia la cache de configuracion. */
export function resetConfigCache(): void {
    cached = null
}
