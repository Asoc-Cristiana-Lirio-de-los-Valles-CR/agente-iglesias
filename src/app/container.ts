import type { AppConfig } from "../config/ConfigService.js"
import { openDatabase, type DB } from "../core/db/database.js"
import { Logger } from "../core/logger/Logger.js"
import { VersesCacheRepository } from "../core/db/repositories/VersesCacheRepository.js"
import { HistoryRepository } from "../core/db/repositories/HistoryRepository.js"
import { RecentProjectsRepository } from "../core/db/repositories/RecentProjectsRepository.js"
import { FavoritesRepository } from "../core/db/repositories/FavoritesRepository.js"
import { ConfigRepository } from "../core/db/repositories/ConfigRepository.js"
import { TranslationsRepository } from "../core/db/repositories/TranslationsRepository.js"
import { LogsRepository } from "../core/db/repositories/LogsRepository.js"
import { CacheService } from "../services/cache/CacheService.js"
import { BibleService } from "../services/bible/BibleService.js"
import { buildBibleProviders } from "../services/bible/providerFactory.js"
import { FreeShowBibleProvider } from "../services/bible/providers/freeshowBibleProvider.js"
import { AIService } from "../services/ai/AIService.js"
import { buildAIProvider } from "../services/ai/providerFactory.js"
import { TemplateService } from "../services/templates/TemplateService.js"
import { FreeShowService } from "../services/freeshow/FreeShowService.js"
import { ProjectSynchronizer } from "../services/freeshow/ProjectSynchronizer.js"
import { ModuleRegistry } from "./moduleRegistry.js"
import { ScriptureModule } from "../modules/scripture/ScriptureModule.js"

/**
 * Contenedor de servicios: arma el grafo de dependencias a partir de la
 * configuracion. Es el unico lugar que conoce como se conectan las piezas.
 */
export interface Container {
    config: AppConfig
    db: DB
    logger: Logger
    freeshow: FreeShowService
    bible: BibleService
    ai: AIService
    templates: TemplateService
    registry: ModuleRegistry
    repositories: {
        verses: VersesCacheRepository
        history: HistoryRepository
        recentProjects: RecentProjectsRepository
        favorites: FavoritesRepository
        config: ConfigRepository
        translations: TranslationsRepository
        logs: LogsRepository
    }
    close(): void
}

export function createContainer(config: AppConfig): Container {
    const logger = new Logger(config.LOG_LEVEL, "app")
    const db = openDatabase(config.DB_PATH)

    // Repositorios
    const repositories = {
        verses: new VersesCacheRepository(db),
        history: new HistoryRepository(db),
        recentProjects: new RecentProjectsRepository(db),
        favorites: new FavoritesRepository(db),
        config: new ConfigRepository(db),
        translations: new TranslationsRepository(db),
        logs: new LogsRepository(db),
    }

    // Persistir logs en SQLite ademas de la consola.
    logger.addSink((entry) => repositories.logs.add(entry))

    // Servicios
    const cache = new CacheService(repositories.verses)
    const freeshowBible = new FreeShowBibleProvider(config.FREESHOW_DATA_PATH)
    const bible = new BibleService(
        buildBibleProviders(config, freeshowBible),
        cache,
        repositories.history,
        logger.child("bible"),
    )
    const ai = new AIService(buildAIProvider(config))
    const templates = new TemplateService(config.TEMPLATES_PATH)
    const freeshow = new FreeShowService(config, logger.child("freeshow"))
    const projectSync = new ProjectSynchronizer(freeshow, logger.child("projectSync"))

    // Modulos
    const registry = new ModuleRegistry(logger)
    registry.register(
        new ScriptureModule({
            config,
            logger: logger.child("scripture"),
            bible,
            freeshow,
            templates,
            recentProjects: repositories.recentProjects,
            configRepo: repositories.config,
            projectSync,
            freeshowBible,
        }),
    )

    return {
        config,
        db,
        logger,
        freeshow,
        bible,
        ai,
        templates,
        registry,
        repositories,
        close: () => {
            freeshow.disconnect()
            db.close()
        },
    }
}
