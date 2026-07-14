import type { FreeShowService, FsProject } from "./FreeShowService.js"
import type { FsShow } from "./showFormat.js"
import type { Logger } from "../../core/logger/Logger.js"
import { uid } from "../../core/utils/ids.js"
import { mapWithConcurrency } from "../../core/utils/concurrency.js"

/** Marca los shows administrados por este sistema. Es tambien el guardrail de seguridad: nunca se toca un show sin este tag. */
export const SYNC_TAG = "AgenteIglesias"

export interface SyncItem {
    /** Nombre del show deseado (tambien usado como texto de respaldo para create_show). */
    name: string
    /** JSON completo del show ya construido (showBuilder, etc.). */
    show: FsShow
    /** Texto plano de respaldo para create_show (antes de aplicar el formato preciso). */
    fallbackText: string
}

export interface SyncResult {
    projectId: string
    /** Shows nuevos creados y vinculados al proyecto. */
    created: number
    /** Shows administrados reutilizados cuyo contenido se sobrescribio (set_show). */
    updated: number
    /** Shows administrados reutilizados cuyo contenido ya era identico (sin tocar). */
    unchanged: number
    /** Shows administrados sobrantes desvinculados del proyecto (no se borran fisicamente, ver docs/ARQUITECTURA.md). */
    unlinked: number
    /** Shows del proyecto SIN el tag de esta app (contenido del usuario): nunca tocados. */
    ignoredUserShows: number
}

/**
 * Sincroniza un proyecto de FreeShow para que la PARTE ADMINISTRADA POR ESTA
 * APP contenga exclusivamente el conjunto de shows dado en cada ejecucion,
 * REUTILIZANDO al maximo los shows existentes en vez de borrar y recrear todo.
 *
 * Generico y desacoplado de cualquier dominio (no sabe que son "versiculos"):
 * cualquier modulo futuro que necesite un proyecto fijo en FreeShow puede
 * reutilizar este servicio.
 *
 * REGLA DE SEGURIDAD (obligatoria): el proyecto puede contener shows
 * agregados manualmente por el usuario. Esta clase SOLO puede leer,
 * sobrescribir, crear o desvincular shows cuyo `meta.createdBy === SYNC_TAG`.
 * Cualquier show sin ese tag exacto (o con otro valor) se considera contenido
 * del usuario: nunca se actualiza, nunca se desvincula, nunca se sobrescribe,
 * nunca se elimina del proyecto. Para clasificar un show hay que leer su
 * contenido (`get_show`) — el listado de shows del proyecto (`get_projects`)
 * no trae `meta`.
 *
 * Estrategia (ver docs/ARQUITECTURA.md "Limites de la API de FreeShow"):
 * FreeShow no expone borrado fisico de shows via REST/WS, solo desvinculacion
 * (`remove_project_item`). Por eso, en cada sincronizacion, SOLO sobre los
 * shows administrados (tageados):
 *   - los que coinciden por `name` con un item deseado se REUTILIZAN (mismo
 *     id, `set_show` solo si el contenido cambio);
 *   - los items deseados sin show administrado existente se CREAN;
 *   - los shows administrados que ya no corresponden a ningun item se
 *     DESVINCULAN (`remove_project_item`), nunca se borran fisicamente.
 *
 * El proyecto sincronizado debe ser, ademas, de uso EXCLUSIVO para esta
 * funcionalidad a nivel de PROYECTO (nunca se tocan otros proyectos del
 * usuario — eso se garantiza localizando siempre por `projectId` exacto).
 */
export interface ProjectSynchronizerOptions {
    /** Esperas entre sondeos al detectar el show nuevo (inyectable en tests). El primer sondeo es siempre inmediato. */
    createPollDelaysMs?: number[]
    /** Maximo de escrituras set_show simultaneas (FreeShow procesa REST en su hilo principal). */
    updateConcurrency?: number
}

/** Backoff por defecto: sondeos tempranos frecuentes (caso tipico: FreeShow vincula en 100-300ms), total ≈2.4s como antes. */
const DEFAULT_CREATE_POLL_DELAYS_MS = [50, 100, 150, 250, 350, 450, 550, 500]
const DEFAULT_UPDATE_CONCURRENCY = 5

export class ProjectSynchronizer {
    private createPollDelaysMs: number[]
    private updateConcurrency: number

    constructor(private freeshow: FreeShowService, private logger: Logger, options: ProjectSynchronizerOptions = {}) {
        this.createPollDelaysMs = options.createPollDelaysMs ?? DEFAULT_CREATE_POLL_DELAYS_MS
        this.updateConcurrency = options.updateConcurrency ?? DEFAULT_UPDATE_CONCURRENCY
    }

    async syncProject(projectName: string, items: SyncItem[]): Promise<SyncResult> {
        // Una sola lectura de get_projects por sincronizacion; se reutiliza abajo.
        const projects = await this.freeshow.getProjects()
        const projectId = await this.findOrCreateProject(projectName, projects)
        const { managed, ignoredUserShows } = await this.classifyExistingShows(projectId, projects)

        const existingByName = new Map(managed.map((m) => [m.name, m]))
        const desiredNames = new Set(items.map((i) => i.name))

        // Fase 1: particionar sin awaits.
        const toUpdate: { id: string; desired: FsShow }[] = []
        const toCreate: { item: SyncItem; desired: FsShow }[] = []
        let unchanged = 0

        for (const item of items) {
            const existing = existingByName.get(item.name)
            const desired = this.tagged(item.show)

            if (existing) {
                if (this.sameContent(existing.show, desired)) {
                    unchanged++
                } else {
                    toUpdate.push({ id: existing.id, desired })
                }
            } else {
                toCreate.push({ item, desired })
            }
        }

        // Fase 2: actualizaciones en paralelo (ids conocidos y distintos; un fallo lanza, como antes).
        await mapWithConcurrency(toUpdate, this.updateConcurrency, (u) => this.freeshow.setShow(u.id, u.desired))
        const updated = toUpdate.length

        // Fase 3: creaciones SECUENCIALES — NO paralelizar: el id del show nuevo
        // se obtiene por diferencia de snapshot del proyecto y creaciones
        // concurrentes harian ambigua la asignacion id↔item.
        for (const { item, desired } of toCreate) {
            await this.createAndLink(projectId, item, desired)
        }
        const created = toCreate.length

        const toRemove = managed.filter((m) => !desiredNames.has(m.name)).sort((a, b) => b.index - a.index) // descendente: remove_project_item hace splice por indice

        for (const m of toRemove) {
            await this.freeshow.removeProjectItem(projectId, m.index)
        }

        this.logger.info(
            `Proyecto "${projectName}" sincronizado: ${created} creados, ${updated} actualizados, ` +
                `${unchanged} sin cambios, ${toRemove.length} desvinculados, ${ignoredUserShows} ignorados (contenido del usuario)`,
        )
        return { projectId, created, updated, unchanged, unlinked: toRemove.length, ignoredUserShows }
    }

    private async findOrCreateProject(name: string, projects: FsProject[]): Promise<string> {
        const existing = projects.find((p) => (p.name ?? "").trim() === name.trim())
        if (existing?.id) return existing.id

        const projectId = uid()
        await this.freeshow.createProject(name, projectId)
        return projectId
    }

    /**
     * Lee cada show actual del proyecto (en paralelo) y lo clasifica por
     * `meta.createdBy`. Si no se puede leer el contenido (id obsoleto, error
     * de lectura, etc.) se trata como NO administrado por seguridad (nunca se
     * toca algo que no se pudo verificar).
     * Un proyecto recien creado no aparece en `projects`: refs vacias, correcto.
     *
     * Antes de leer contenido se descartan sin get_show (van directo a
     * "contenido del usuario"):
     *   - items de media (`type` video/imagen…): no son shows;
     *   - referencias colgantes (id ausente en get_shows: el .show fue
     *     borrado del disco). En ambos casos get_show de FreeShow no responde
     *     y cuelga ~10s, verificado contra FreeShow real.
     */
    private async classifyExistingShows(
        projectId: string,
        projects: FsProject[],
    ): Promise<{ managed: { id: string; name: string; index: number; show: FsShow }[]; ignoredUserShows: number }> {
        const refs = projects.find((p) => p.id === projectId)?.shows ?? []

        // Ids de shows que existen de verdad (1 llamada barata). Si la lectura
        // falla O devuelve vacio con refs en el proyecto (respuesta anomala: FreeShow
        // inicializando, parseo fallido…), se degrada al comportamiento anterior
        // (get_show para todos). Un Set vacio seria truthy y filtraria TODO,
        // convirtiendo shows administrados en colgantes y generando duplicados.
        let knownShowIds: Set<string> | null = null
        if (refs.length > 0) {
            try {
                const allShows = await this.freeshow.getShows()
                knownShowIds = allShows.length > 0 ? new Set(allShows.map((s) => s.id)) : null
            } catch {
                knownShowIds = null
            }
        }

        const shows = await Promise.all(
            refs.map((ref) => {
                if (ref.type && ref.type !== "show") return Promise.resolve(null)
                if (knownShowIds && !knownShowIds.has(ref.id)) return Promise.resolve(null)
                return this.freeshow.getShow(ref.id).catch(() => null)
            }),
        )

        const managed: { id: string; name: string; index: number; show: FsShow }[] = []
        let ignoredUserShows = 0

        for (let index = 0; index < refs.length; index++) {
            const show = shows[index]
            if (show && show.meta?.createdBy === SYNC_TAG) {
                managed.push({ id: refs[index].id, name: show.name, index, show })
            } else {
                ignoredUserShows++
            }
        }

        return { managed, ignoredUserShows }
    }

    private async createAndLink(projectId: string, item: SyncItem, taggedShow: FsShow): Promise<void> {
        // 1. Activar el proyecto: garantiza que create_show auto-vincule el show nuevo aqui.
        await this.freeshow.selectProject(projectId)

        // 2. Capturar ids actuales del proyecto ANTES de crear (snapshot).
        const idsBefore = new Set(await this.freeshow.getProjectShowIds(projectId))

        // 3. Crear el show (FreeShow no devuelve el id via REST; usamos snapshot para obtenerlo).
        await this.freeshow.createShow(item.name, item.fallbackText)

        // 4. Esperar a que el nuevo show aparezca en el proyecto (FreeShow lo vincula async).
        const showId = await this.waitForNewShowId(projectId, idsBefore)
        if (!showId) throw new Error(`No se pudo obtener el id del show "${item.name}" tras crearlo.`)

        // 5. set_show aplica el JSON completo (nombre correcto con ':', tag, slides, layouts).
        await this.freeshow.setShow(showId, taggedShow)
        // add_to_project es idem-potente: si ya esta vinculado no hace nada, pero garantiza consistencia.
        await this.freeshow.addToProject(projectId, showId, item.name)
    }

    /**
     * Sondea los ids del proyecto hasta detectar uno nuevo respecto al
     * snapshot. Primer sondeo inmediato; luego una espera por cada entrada de
     * `createPollDelaysMs` (backoff creciente, total ≈2.4s por defecto).
     */
    private async waitForNewShowId(projectId: string, idsBefore: Set<string>): Promise<string | null> {
        for (let attempt = 0; attempt <= this.createPollDelaysMs.length; attempt++) {
            const idsAfter = await this.freeshow.getProjectShowIds(projectId)
            const newIds = idsAfter.filter((id) => !idsBefore.has(id))
            if (newIds.length > 0) return newIds[newIds.length - 1]
            if (attempt < this.createPollDelaysMs.length) {
                await new Promise((r) => setTimeout(r, this.createPollDelaysMs[attempt]))
            }
        }
        return null
    }

    private tagged(show: FsShow): FsShow {
        return { ...show, meta: { ...show.meta, createdBy: SYNC_TAG } }
    }

    /**
     * Compara el contenido relevante (ignora timestamps, que siempre difieren).
     * `JSON.stringify` es sensible al orden de las claves en objetos anidados
     * (`meta`, `slides`, `layouts`); FreeShow puede devolver el JSON con un
     * orden distinto al que enviamos aunque el contenido sea identico. Se
     * normaliza recursivamente el orden de claves antes de comparar para
     * evitar sobrescrituras innecesarias (`set_show` de mas, no destructivo,
     * pero evitable).
     */
    private sameContent(a: FsShow, b: FsShow): boolean {
        const strip = (s: FsShow) => ({ name: s.name, category: s.category, meta: s.meta, slides: s.slides, layouts: s.layouts })
        return JSON.stringify(sortKeysDeep(strip(a))) === JSON.stringify(sortKeysDeep(strip(b)))
    }
}

/** Clona un valor recursivamente con las claves de cada objeto ordenadas alfabeticamente (arrays se mantienen en su orden, que sí es significativo). */
function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep)
    if (value && typeof value === "object") {
        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
        }
        return sorted
    }
    return value
}
