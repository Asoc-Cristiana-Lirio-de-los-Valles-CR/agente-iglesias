import { describe, it, expect, beforeEach } from "vitest"
import { openDatabase, type DB } from "../src/core/db/database.js"
import { VersesCacheRepository } from "../src/core/db/repositories/VersesCacheRepository.js"
import { HistoryRepository } from "../src/core/db/repositories/HistoryRepository.js"
import { CacheService } from "../src/services/cache/CacheService.js"
import { BibleService, VersesNotFoundError } from "../src/services/bible/BibleService.js"
import { Logger } from "../src/core/logger/Logger.js"
import type { BibleProvider } from "../src/services/bible/BibleProvider.js"
import type { BibleReference, Verse } from "../src/types/index.js"

function makeRef(over: Partial<BibleReference> = {}): BibleReference {
    return {
        raw: "Juan 3:16-17",
        bookId: "JHN",
        bookName: "Juan",
        chapter: 3,
        verseStart: 16,
        verseEnd: 17,
        wholeChapter: false,
        version: "RVR1909",
        ...over,
    }
}

/** Proveedor falso que cuenta cuantas veces se le llama. */
class CountingProvider implements BibleProvider {
    readonly name = "mock"
    calls = 0
    constructor(private verses: Verse[]) {}
    async getVerses(): Promise<Verse[]> {
        this.calls++
        return this.verses
    }
}

describe("BibleService (cache-first)", () => {
    let db: DB
    let logger: Logger

    beforeEach(() => {
        db = openDatabase(":memory:")
        logger = new Logger("error", "test")
    })

    it("1a vez consulta el proveedor; 2a vez sale de la cache", async () => {
        const provider = new CountingProvider([
            { verse: 16, text: "v16" },
            { verse: 17, text: "v17" },
        ])
        const cache = new CacheService(new VersesCacheRepository(db))
        const history = new HistoryRepository(db)
        const service = new BibleService([provider], cache, history, logger)

        const first = await service.getVerses(makeRef())
        expect(first).toHaveLength(2)
        expect(provider.calls).toBe(1)

        const second = await service.getVerses(makeRef())
        expect(second).toHaveLength(2)
        expect(provider.calls).toBe(1) // no se vuelve a llamar
    })

    it("usa el siguiente proveedor si el primero devuelve vacio", async () => {
        const empty = new CountingProvider([])
        const good = new CountingProvider([{ verse: 16, text: "v16" }])
        const cache = new CacheService(new VersesCacheRepository(db))
        const service = new BibleService([empty, good], cache, new HistoryRepository(db), logger)

        const verses = await service.getVerses(makeRef({ verseStart: 16, verseEnd: 16 }))
        expect(verses).toHaveLength(1)
        expect(empty.calls).toBe(1)
        expect(good.calls).toBe(1)
    })

    it("lanza VersesNotFoundError si ningun proveedor resuelve", async () => {
        const cache = new CacheService(new VersesCacheRepository(db))
        const service = new BibleService([new CountingProvider([])], cache, new HistoryRepository(db), logger)
        await expect(service.getVerses(makeRef())).rejects.toBeInstanceOf(VersesNotFoundError)
    })

    it("capitulo completo cachea y recupera todos los versiculos", async () => {
        const provider = new CountingProvider([
            { verse: 1, text: "a" },
            { verse: 2, text: "b" },
        ])
        const cache = new CacheService(new VersesCacheRepository(db))
        const service = new BibleService([provider], cache, new HistoryRepository(db), logger)
        const ref = makeRef({ wholeChapter: true, verseStart: undefined, verseEnd: undefined })

        expect(await service.getVerses(ref)).toHaveLength(2)
        expect(await service.getVerses(ref)).toHaveLength(2)
        expect(provider.calls).toBe(1)
    })
})
