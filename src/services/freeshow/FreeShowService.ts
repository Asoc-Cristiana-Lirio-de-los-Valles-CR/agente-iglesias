import { io, type Socket } from "socket.io-client"
import type { AppConfig } from "../../config/ConfigService.js"
import type { Logger } from "../../core/logger/Logger.js"
import type { FsShow } from "./showFormat.js"

/** Error de comunicacion con FreeShow. */
export class FreeShowError extends Error {}

interface FsProjectShowRef {
    id: string
    name?: string
}
interface FsProject {
    id?: string
    name?: string
    shows?: FsProjectShowRef[]
}
interface FsShowSummary {
    id: string
    name?: string
}

/**
 * FreeShowService: ENCAPSULA toda la comunicacion con FreeShow.
 * Si FreeShow cambia su API, solo se toca este archivo.
 *
 * - Lecturas (get_*): siempre por REST (necesitan respuesta).
 * - Escrituras (create/set/add): por REST o, si FREESHOW_TRANSPORT=ws y hay
 *   conexion, por WebSocket (socket.io).
 *
 * Acciones usadas (ver docs/FREESHOW.md y https://freeshow.app/api):
 *   create_project, create_show, set_show, add_to_project, get_shows, get_projects,
 *   get_show, remove_project_item
 */
export class FreeShowService {
    private restUrl: string
    private socket: Socket | null = null
    private useWs: boolean

    constructor(private config: AppConfig, private logger: Logger) {
        this.restUrl = `http://${config.FREESHOW_HOST}:${config.FREESHOW_PORT}`
        this.useWs = config.FREESHOW_TRANSPORT === "ws"
    }

    /** Conecta el WebSocket si el transporte es ws (idempotente). */
    async connect(): Promise<void> {
        if (!this.useWs || this.socket?.connected) return
        const url = `http://${this.config.FREESHOW_HOST}:${this.config.FREESHOW_WS_PORT}`
        await new Promise<void>((resolve) => {
            const socket = io(url, { transports: ["websocket"], timeout: 5000, reconnection: false })
            socket.on("connect", () => {
                this.socket = socket
                this.logger.info(`Conectado a FreeShow por WebSocket: ${url}`)
                resolve()
            })
            socket.on("connect_error", (err) => {
                this.logger.warn(`No se pudo conectar por WebSocket (${url}); se usara REST`, err.message)
                this.useWs = false
                resolve() // degradar a REST en vez de fallar
            })
        })
    }

    disconnect(): void {
        this.socket?.disconnect()
        this.socket = null
    }

    /** Verifica si FreeShow responde (REST). */
    async ping(): Promise<boolean> {
        try {
            await this.request("get_projects", {})
            return true
        } catch {
            return false
        }
    }

    // -------------------- Acciones de alto nivel --------------------

    async createProject(name: string, id: string): Promise<void> {
        await this.send("create_project", { name, id })
    }

    /** Crea un show a partir de texto (diapositivas separadas por linea en blanco). */
    async createShow(name: string, text: string, category = "scripture"): Promise<string | null> {
        const res = await this.send("create_show", { name, text, category })
        // Algunas versiones devuelven el id; si no, se resuelve por nombre.
        const id = this.extractId(res)
        return id
    }

    /** Reemplaza el contenido de un show existente con el JSON completo. */
    async setShow(id: string, show: FsShow): Promise<void> {
        await this.send("set_show", { id, value: JSON.stringify(show) })
    }

    async addToProject(projectId: string, showId: string, name: string): Promise<void> {
        await this.send("add_to_project", { projectId, id: showId, data: { type: "show", name } })
    }

    /**
     * Activa el proyecto en la UI de FreeShow (necesario antes de create_show
     * para que el nuevo show se vincule automaticamente al proyecto correcto).
     */
    async selectProject(projectId: string): Promise<void> {
        await this.send("id_select_project", { id: projectId })
    }

    /**
     * Devuelve los ids de los shows actuales del proyecto dado.
     * Usado como snapshot antes/despues de create_show para identificar
     * el nuevo show por exclusion (sin depender del nombre, que FreeShow puede normalizar).
     */
    async getProjectShowIds(projectId: string): Promise<string[]> {
        const projects = await this.getProjects()
        return projects.find((p) => p.id === projectId)?.shows?.map((s) => s.id) ?? []
    }

    async getProjects(): Promise<FsProject[]> {
        const res = await this.request("get_projects", {})
        return this.toArray<FsProject>(res)
    }

    async getShows(): Promise<FsShowSummary[]> {
        const res = await this.request("get_shows", {})
        return this.toArray<FsShowSummary>(res)
    }

    /** Devuelve el contenido completo de un show (null si no existe). */
    async getShow(id: string): Promise<FsShow | null> {
        const res = await this.request("get_show", { id })
        if (!res || typeof res !== "object") return null
        const obj = res as Record<string, unknown>
        const content = (obj.data ?? obj) as FsShow
        return content ?? null
    }

    /** Devuelve true si ya existe un proyecto con ese nombre. */
    async projectExists(name: string): Promise<boolean> {
        const projects = await this.getProjects()
        return projects.some((p) => (p.name ?? "").trim() === name.trim())
    }

    /** Busca un proyecto por nombre exacto (no por carpeta: la API de FreeShow no expone carpetas). */
    async findProjectByName(name: string): Promise<FsProject | null> {
        const projects = await this.getProjects()
        return projects.find((p) => (p.name ?? "").trim() === name.trim()) ?? null
    }

    /**
     * Desvincula un show del proyecto por indice (no borra el archivo .show:
     * FreeShow no expone borrado fisico via REST/WS, ver docs/ARQUITECTURA.md).
     * `index` es 0-based (como el resto de este servicio); FreeShow espera
     * indices 1-based en su API publica, la conversion se hace aqui.
     */
    async removeProjectItem(projectId: string, index: number): Promise<void> {
        await this.send("remove_project_item", { id: projectId, index: index + 1 })
    }

    /**
     * Busca el id de un show por nombre (el mas reciente si hay varios).
     * Reintenta brevemente porque create_show puede tardar en reflejarse.
     */
    async findShowIdByName(name: string, retries = 5, delayMs = 200): Promise<string | null> {
        // FreeShow normaliza ':' a ',' en el nombre del show al crearlo via create_show.
        // La llamada a set_show posterior corrige el nombre, pero la busqueda aqui
        // ocurre ANTES de set_show, asi que buscamos las dos variantes.
        const nameComma = name.trim().replace(/:/g, ",")
        const nameOrig = name.trim()
        for (let i = 0; i < retries; i++) {
            const shows = await this.getShows()
            const matches = shows.filter((s) => {
                const n = (s.name ?? "").trim()
                return n === nameOrig || n === nameComma
            })
            if (matches.length > 0) return matches[matches.length - 1].id
            await new Promise((r) => setTimeout(r, delayMs))
        }
        return null
    }

    // -------------------- Transporte --------------------

    /** Envia una accion (escritura). Usa WS si esta disponible, si no REST. */
    private async send(action: string, data: Record<string, unknown>): Promise<unknown> {
        if (this.useWs && this.socket?.connected) {
            this.socket.emit("data", JSON.stringify({ action, ...data }))
            return null // socket.io es fire-and-forget para escrituras
        }
        return this.request(action, data)
    }

    /** Realiza una peticion REST y devuelve el cuerpo parseado. */
    private async request(action: string, data: Record<string, unknown>): Promise<unknown> {
        let res: Response
        try {
            res = await fetch(this.restUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action, ...data }),
            })
        } catch (err) {
            throw new FreeShowError(
                `No se pudo conectar con FreeShow en ${this.restUrl}. ` +
                    `Verifica que FreeShow este abierto y la API activada (Settings -> Connections). ` +
                    `Detalle: ${(err as Error).message}`,
            )
        }
        if (!res.ok) throw new FreeShowError(`FreeShow respondio ${res.status} a "${action}"`)
        const text = await res.text()
        if (!text) return null
        try {
            return JSON.parse(text)
        } catch {
            return text
        }
    }

    private extractId(res: unknown): string | null {
        if (res && typeof res === "object") {
            const obj = res as Record<string, unknown>
            if (typeof obj.id === "string") return obj.id
            if (obj.data && typeof obj.data === "object") {
                const d = obj.data as Record<string, unknown>
                if (typeof d.id === "string") return d.id
            }
        }
        return null
    }

    private toArray<T>(res: unknown): T[] {
        if (Array.isArray(res)) return res as T[]
        if (res && typeof res === "object") {
            const obj = res as Record<string, unknown>
            if (Array.isArray(obj.data)) return obj.data as T[]
            // FreeShow devuelve {action, data:{id:{...},...}} — extraer el objeto data.
            // Verificado con get_shows y get_projects reales: el wrapper siempre es {action, data:{...}}.
            if (obj.data && typeof obj.data === "object") {
                return Object.entries(obj.data as Record<string, unknown>).map(([id, v]) =>
                    v && typeof v === "object" ? ({ id, ...(v as object) } as T) : (v as T),
                )
            }
            // Fallback: objeto directo {id: {...}} sin wrapper data.
            const values = Object.entries(obj).map(([id, v]) =>
                v && typeof v === "object" ? ({ id, ...(v as object) } as T) : (v as T),
            )
            return values
        }
        return []
    }
}
