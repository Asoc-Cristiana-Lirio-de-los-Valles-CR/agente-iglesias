/**
 * Logger con niveles. Escribe a consola y, opcionalmente, a un "sink"
 * (por ejemplo la tabla `logs` en SQLite). El sink se inyecta para evitar
 * acoplar el logger a la base de datos.
 */

export type LogLevel = "error" | "warn" | "info" | "debug"

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }

export interface LogEntry {
    timestamp: number
    level: LogLevel
    scope: string
    message: string
    meta?: unknown
}

export type LogSink = (entry: LogEntry) => void

export class Logger {
    private sinks: LogSink[] = []

    constructor(private level: LogLevel = "info", private scope = "app") {}

    /** Crea un logger hijo con un scope mas especifico (comparte sinks y nivel). */
    child(scope: string): Logger {
        const c = new Logger(this.level, scope)
        c.sinks = this.sinks
        return c
    }

    /** Agrega un destino adicional (ej. persistencia en SQLite). */
    addSink(sink: LogSink): void {
        this.sinks.push(sink)
    }

    setLevel(level: LogLevel): void {
        this.level = level
    }

    error(message: string, meta?: unknown): void {
        this.log("error", message, meta)
    }
    warn(message: string, meta?: unknown): void {
        this.log("warn", message, meta)
    }
    info(message: string, meta?: unknown): void {
        this.log("info", message, meta)
    }
    debug(message: string, meta?: unknown): void {
        this.log("debug", message, meta)
    }

    private log(level: LogLevel, message: string, meta?: unknown): void {
        if (LEVEL_ORDER[level] > LEVEL_ORDER[this.level]) return
        const entry: LogEntry = { timestamp: Date.now(), level, scope: this.scope, message, meta }

        const prefix = `[${new Date(entry.timestamp).toISOString()}] ${level.toUpperCase().padEnd(5)} (${this.scope})`
        const line = meta !== undefined ? `${prefix} ${message}` : `${prefix} ${message}`
        const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log
        if (meta !== undefined) consoleFn(line, meta)
        else consoleFn(line)

        for (const sink of this.sinks) {
            try {
                sink(entry)
            } catch {
                // Nunca dejar que un fallo de persistencia rompa el logging.
            }
        }
    }
}
