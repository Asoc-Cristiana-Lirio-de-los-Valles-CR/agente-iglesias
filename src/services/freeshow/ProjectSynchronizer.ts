import type { FreeShowService } from "./FreeShowService.js"
import type { FsShow } from "./showFormat.js"
import type { Logger } from "../../core/logger/Logger.js"
import { uid } from "../../core/utils/ids.js"

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
export class ProjectSynchronizer {
    constructor(private freeshow: FreeShowService, private logger: Logger) {}

    async syncProject(projectName: string, items: SyncItem[]): Promise<SyncResult> {
        const projectId = await this.findOrCreateProject(projectName)
        const { managed, ignoredUserShows } = await this.classifyExistingShows(projectId)

        const existingByName = new Map(managed.map((m) => [m.name, m]))
        const desiredNames = new Set(items.map((i) => i.name))

        let created = 0
        let updated = 0
        let unchanged = 0

        for (const item of items) {
            const existing = existingByName.get(item.name)
            const desired = this.tagged(item.show)

            if (existing) {
                if (this.sameContent(existing.show, desired)) {
                    unchanged++
                } else {
                    await this.freeshow.setShow(existing.id, desired)
                    updated++
                }
            } else {
                await this.createAndLink(projectId, item, desired)
                created++
            }
        }

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

    private async findOrCreateProject(name: string): Promise<string> {
        const existing = await this.freeshow.findProjectByName(name)
        if (existing?.id) return existing.id

        const projectId = uid()
        await this.freeshow.createProject(name, projectId)
        return projectId
    }

    /**
     * Lee cada show actual del proyecto y lo clasifica por `meta.createdBy`.
     * Si no se puede leer el contenido (id obsoleto, etc.) se trata como NO
     * administrado por seguridad (nunca se toca algo que no se pudo verificar).
     */
    private async classifyExistingShows(
        projectId: string,
    ): Promise<{ managed: { id: string; name: string; index: number; show: FsShow }[]; ignoredUserShows: number }> {
        const refs = await this.currentShows(projectId)
        const managed: { id: string; name: string; index: number; show: FsShow }[] = []
        let ignoredUserShows = 0

        for (let index = 0; index < refs.length; index++) {
            const ref = refs[index]
            const show = await this.freeshow.getShow(ref.id)
            if (show && show.meta?.createdBy === SYNC_TAG) {
                managed.push({ id: ref.id, name: show.name, index, show })
            } else {
                ignoredUserShows++
            }
        }

        return { managed, ignoredUserShows }
    }

    private async currentShows(projectId: string): Promise<{ id: string; name?: string }[]> {
        const projects = await this.freeshow.getProjects()
        return projects.find((p) => p.id === projectId)?.shows ?? []
    }

    private async createAndLink(projectId: string, item: SyncItem, taggedShow: FsShow): Promise<void> {
        // 1. Activar el proyecto: garantiza que create_show auto-vincule el show nuevo aqui.
        await this.freeshow.selectProject(projectId)

        // 2. Capturar ids actuales del proyecto ANTES de crear (snapshot).
        const idsBefore = new Set(await this.freeshow.getProjectShowIds(projectId))

        // 3. Crear el show (FreeShow no devuelve el id via REST; usamos snapshot para obtenerlo).
        await this.freeshow.createShow(item.name, item.fallbackText)

        // 4. Esperar a que el nuevo show aparezca en el proyecto (FreeShow lo vincula async).
        let showId: string | null = null
        for (let attempt = 0; attempt < 8; attempt++) {
            const idsAfter = await this.freeshow.getProjectShowIds(projectId)
            const newIds = idsAfter.filter((id) => !idsBefore.has(id))
            if (newIds.length > 0) {
                showId = newIds[newIds.length - 1]
                break
            }
            await new Promise((r) => setTimeout(r, 300))
        }
        if (!showId) throw new Error(`No se pudo obtener el id del show "${item.name}" tras crearlo.`)

        // 5. set_show aplica el JSON completo (nombre correcto con ':', tag, slides, layouts).
        await this.freeshow.setShow(showId, taggedShow)
        // add_to_project es idem-potente: si ya esta vinculado no hace nada, pero garantiza consistencia.
        await this.freeshow.addToProject(projectId, showId, item.name)
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
