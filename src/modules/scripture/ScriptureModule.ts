import type { Router, Request, Response } from "express"
import type { PlatformModule } from "../../app/moduleRegistry.js"
import type { AppConfig } from "../../config/ConfigService.js"
import type { Logger } from "../../core/logger/Logger.js"
import type { BibleService } from "../../services/bible/BibleService.js"
import type { FreeShowService } from "../../services/freeshow/FreeShowService.js"
import type { TemplateService } from "../../services/templates/TemplateService.js"
import type { RecentProjectsRepository } from "../../core/db/repositories/RecentProjectsRepository.js"
import type { ConfigRepository } from "../../core/db/repositories/ConfigRepository.js"
import type { FreeShowBibleProvider } from "../../services/bible/providers/freeshowBibleProvider.js"
import type { GenerationResult, GenerationItemResult } from "../../types/index.js"
import { parseReferences } from "./referenceParser.js"
import { buildShow } from "./showBuilder.js"
import { ProjectSynchronizer, type SyncItem } from "../../services/freeshow/ProjectSynchronizer.js"

export interface ScriptureModuleDeps {
    config: AppConfig
    logger: Logger
    bible: BibleService
    freeshow: FreeShowService
    templates: TemplateService
    recentProjects: RecentProjectsRepository
    configRepo: ConfigRepository
    projectSync: ProjectSynchronizer
    freeshowBible: FreeShowBibleProvider
}

export interface GenerateOptions {
    version?: string
    template?: string
}

export interface InstalledVersionInfo {
    id: string
    name: string
    code: string
    enabled: boolean
}

/** Proyecto fijo de FreeShow administrado exclusivamente por este modulo. */
const VERSES_PROJECT_NAME = "Versiculos"

/**
 * MODULO 1: generador de presentaciones biblicas en FreeShow.
 *
 * Orquesta: parsear -> obtener versiculos (cache-first) -> construir Show
 * (con plantilla) -> crear proyecto/show en FreeShow -> vincular.
 */
export class ScriptureModule implements PlatformModule {
    readonly id = "scripture"
    readonly name = "Generador de versiculos"

    constructor(private deps: ScriptureModuleDeps) {}

    registerRoutes(router: Router): void {
        router.post("/scripture/generate", (req, res) => this.handleGenerate(req, res))
        router.get("/scripture/templates", (_req, res) => {
            res.json({ templates: this.deps.templates.list(), active: this.activeTemplateName() })
        })
        router.get("/scripture/versions", (_req, res) => {
            res.json({ versions: this.getVersions() })
        })
        router.put("/scripture/versions/preferences", (req, res) => {
            const body = req.body as { disabled?: unknown }
            const disabled = Array.isArray(body?.disabled)
                ? body.disabled.filter((x): x is string => typeof x === "string")
                : []
            res.json({ versions: this.setDisabledVersions(disabled) })
        })
    }

    private async handleGenerate(req: Request, res: Response): Promise<void> {
        const body = req.body as { references?: string; version?: string; template?: string }
        const text = body?.references ?? ""
        if (!text.trim()) {
            res.status(400).json({ error: "No se recibieron referencias." })
            return
        }
        try {
            const result = await this.generate(text, { version: body.version, template: body.template })
            res.json(result)
        } catch (err) {
            this.deps.logger.error("Fallo en generacion", err)
            res.status(500).json({ error: (err as Error).message })
        }
    }

    private activeTemplateName(): string {
        return this.deps.configRepo.get("template") ?? this.deps.config.TEMPLATE
    }

    private static readonly DISABLED_VERSIONS_KEY = "disabledBibleVersions"

    /** Ids de versiones ocultas de los chips (persistido en config). Vacio = todas activas. */
    private getDisabledVersionIds(): string[] {
        const raw = this.deps.configRepo.get(ScriptureModule.DISABLED_VERSIONS_KEY)
        if (!raw) return []
        try {
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
        } catch {
            return []
        }
    }

    /** Versiones instaladas + flag `enabled` segun las preferencias guardadas. */
    getVersions(): InstalledVersionInfo[] {
        const disabled = new Set(this.getDisabledVersionIds())
        return this.deps.freeshowBible.listAvailableVersions().map((v) => ({ ...v, enabled: !disabled.has(v.id) }))
    }

    /** Reemplaza la lista completa de versiones ocultas y devuelve el estado actualizado. */
    setDisabledVersions(ids: string[]): InstalledVersionInfo[] {
        this.deps.configRepo.set(ScriptureModule.DISABLED_VERSIONS_KEY, JSON.stringify(ids))
        return this.getVersions()
    }

    /**
     * Genera las presentaciones para todas las referencias del texto y
     * sincroniza el proyecto fijo "Versiculos" en FreeShow para que
     * contenga EXCLUSIVAMENTE los versiculos de esta ejecucion.
     */
    async generate(input: string, opts: GenerateOptions = {}): Promise<GenerationResult> {
        const { config, logger, bible, freeshow, templates, recentProjects, projectSync } = this.deps

        const defaultVersion = opts.version ?? config.DEFAULT_VERSION
        const templateName = opts.template ?? this.activeTemplateName()
        const template = templates.get(templateName) // lanza si invalida

        const { references, errors } = parseReferences(input, defaultVersion)
        const items: GenerationItemResult[] = []

        // Errores de parseo -> items fallidos.
        for (const e of errors) items.push({ raw: e.raw, ok: false, error: e.error })

        // Conectar WS si aplica (degrada a REST si falla).
        if (!config.DRY_RUN) await freeshow.connect()

        const syncItems: SyncItem[] = []
        const pending: GenerationItemResult[] = []
        const seenNames = new Set<string>()

        // Busqueda de versiculos en paralelo (cache/archivo/red); el procesado
        // posterior es secuencial en el orden original para preservar el orden
        // de salida y la semantica "primero gana" de la deduplicacion.
        const verseResults = await Promise.allSettled(references.map((ref) => bible.getVerses(ref)))

        for (let i = 0; i < references.length; i++) {
            const ref = references[i]
            const settled = verseResults[i]
            try {
                if (settled.status === "rejected") throw settled.reason
                const verses = settled.value
                const { show, name, slides } = buildShow({
                    bookId: ref.bookId,
                    bookName: ref.bookName,
                    chapter: ref.chapter,
                    version: ref.version,
                    verses,
                    template,
                })

                // Evitar duplicados dentro del mismo lote (mismo libro/cap/version repetido).
                if (config.ON_DUPLICATE === "skip" && seenNames.has(name)) {
                    logger.info(`Omitido (duplicado en el lote): ${name}`)
                    items.push({ raw: ref.raw, ok: true, projectName: name, slides, skipped: true })
                    continue
                }
                seenNames.add(name)

                if (config.DRY_RUN) {
                    logger.info(`[DRY_RUN] ${name} (${slides} diapositivas)`, show)
                    items.push({ raw: ref.raw, ok: true, projectName: name, slides })
                    continue
                }

                syncItems.push({ name, show, fallbackText: verses.map((v) => v.text).join("\n\n") })
                pending.push({ raw: ref.raw, ok: true, projectName: name, slides })
            } catch (err) {
                logger.warn(`Fallo "${ref.raw}"`, err)
                items.push({ raw: ref.raw, ok: false, error: (err as Error).message })
            }
        }

        // Una sola sincronizacion para todo el lote: el proyecto "Versiculos"
        // termina conteniendo EXCLUSIVAMENTE los versiculos generados hoy.
        if (syncItems.length > 0) {
            try {
                const result = await projectSync.syncProject(VERSES_PROJECT_NAME, syncItems)
                recentProjects.add(result.projectId, VERSES_PROJECT_NAME, syncItems.length)
                items.push(...pending)
            } catch (err) {
                logger.warn(`Fallo sincronizando "${VERSES_PROJECT_NAME}"`, err)
                for (const p of pending) items.push({ ...p, ok: false, skipped: undefined, error: (err as Error).message })
            }
        }

        return this.summarize(items)
    }

    private summarize(items: GenerationItemResult[]): GenerationResult {
        const created = items.filter((i) => i.ok && !i.skipped).length
        const skipped = items.filter((i) => i.ok && i.skipped).length
        const failed = items.filter((i) => !i.ok).length
        return { total: items.length, created, skipped, failed, items }
    }
}
