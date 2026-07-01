import { describe, it, expect, beforeEach } from "vitest"
import { openDatabase, type DB } from "../src/core/db/database.js"
import { VersesCacheRepository } from "../src/core/db/repositories/VersesCacheRepository.js"
import { ConfigRepository } from "../src/core/db/repositories/ConfigRepository.js"
import { FavoritesRepository } from "../src/core/db/repositories/FavoritesRepository.js"
import { RecentProjectsRepository } from "../src/core/db/repositories/RecentProjectsRepository.js"

describe("repositorios SQLite (en memoria)", () => {
    let db: DB
    beforeEach(() => {
        db = openDatabase(":memory:")
    })

    it("VersesCacheRepository guarda y recupera rango; null si incompleto", () => {
        const repo = new VersesCacheRepository(db)
        repo.saveMany("RVR1909", "JHN", 3, [
            { verse: 16, text: "a" },
            { verse: 17, text: "b" },
        ])
        expect(repo.getRange("RVR1909", "JHN", 3, 16, 17)).toHaveLength(2)
        expect(repo.getRange("RVR1909", "JHN", 3, 16, 18)).toBeNull() // falta el 18
        expect(repo.getChapter("RVR1909", "JHN", 3)).toHaveLength(2)
    })

    it("VersesCacheRepository hace upsert sin duplicar", () => {
        const repo = new VersesCacheRepository(db)
        repo.saveMany("RVR1909", "JHN", 3, [{ verse: 16, text: "viejo" }])
        repo.saveMany("RVR1909", "JHN", 3, [{ verse: 16, text: "nuevo" }])
        const rows = repo.getRange("RVR1909", "JHN", 3, 16, 16)
        expect(rows).toHaveLength(1)
        expect(rows![0].text).toBe("nuevo")
    })

    it("ConfigRepository get/set", () => {
        const repo = new ConfigRepository(db)
        expect(repo.get("template")).toBeUndefined()
        repo.set("template", "Juvenil")
        expect(repo.get("template")).toBe("Juvenil")
        repo.set("template", "Default")
        expect(repo.get("template")).toBe("Default")
    })

    it("FavoritesRepository agrega sin duplicar y elimina", () => {
        const repo = new FavoritesRepository(db)
        repo.add("Juan 3:16")
        repo.add("Juan 3:16")
        expect(repo.list()).toHaveLength(1)
        repo.remove("Juan 3:16")
        expect(repo.list()).toHaveLength(0)
    })

    it("RecentProjectsRepository registra y lista", () => {
        const repo = new RecentProjectsRepository(db)
        repo.add("id1", "Juan 3:16 RVR1960", 1)
        repo.add("id2", "Salmos 23:1-6 RVR1960", 6)
        const list = repo.recent()
        expect(list).toHaveLength(2)
        expect(list[0].name).toBe("Salmos 23:1-6 RVR1960") // mas reciente primero
    })
})
