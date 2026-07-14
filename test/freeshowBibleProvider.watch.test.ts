import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { FreeShowBibleProvider } from "../src/services/bible/providers/freeshowBibleProvider.js"
import type { BibleReference } from "../src/types/index.js"

function fsb(text: string): string {
    return JSON.stringify([
        "id-test",
        { name: "Test", books: [{ number: 43, name: "Juan", chapters: [{ number: 3, verses: [{ number: 16, text }] }] }] },
    ])
}

function ref(version: string): BibleReference {
    return { raw: "Juan 3:16", bookId: "JHN", bookName: "Juan", chapter: 3, wholeChapter: false, version, verseStart: 16, verseEnd: 16 }
}

describe("FreeShowBibleProvider — invalidacion y watcher (biblias instaladas en caliente)", () => {
    const cleanups: (() => void)[] = []

    afterEach(() => {
        for (const fn of cleanups.splice(0)) fn()
    })

    function tempProvider(): { provider: FreeShowBibleProvider; biblesDir: string } {
        const root = mkdtempSync(join(tmpdir(), "agente-biblias-"))
        const biblesDir = join(root, "Bibles")
        mkdirSync(biblesDir)
        const provider = new FreeShowBibleProvider(root)
        cleanups.push(() => {
            provider.stopWatching()
            rmSync(root, { recursive: true, force: true })
        })
        return { provider, biblesDir }
    }

    it("invalidate() fuerza re-escaneo: una biblia instalada despues aparece en listAvailableVersions", () => {
        const { provider, biblesDir } = tempProvider()
        writeFileSync(join(biblesDir, "UNA.fsb"), fsb("v1"))

        expect(provider.listAvailableVersions().map((v) => v.id)).toEqual(["UNA"])

        writeFileSync(join(biblesDir, "OTRA.fsb"), fsb("v2"))
        expect(provider.listAvailableVersions().map((v) => v.id)).toEqual(["UNA"]) // memoizado

        provider.invalidate()
        expect(provider.listAvailableVersions().map((v) => v.id).sort()).toEqual(["OTRA", "UNA"])
    })

    it("invalidate() limpia el cache de biblias cargadas (texto actualizado se relee)", async () => {
        const { provider, biblesDir } = tempProvider()
        writeFileSync(join(biblesDir, "UNA.fsb"), fsb("texto viejo"))

        expect((await provider.getVerses(ref("UNA")))[0].text).toBe("texto viejo")

        writeFileSync(join(biblesDir, "UNA.fsb"), fsb("texto nuevo"))
        expect((await provider.getVerses(ref("UNA")))[0].text).toBe("texto viejo") // cacheado

        provider.invalidate()
        expect((await provider.getVerses(ref("UNA")))[0].text).toBe("texto nuevo")
    })

    it("invalidate() permite recuperarse de un .fsb corrupto cacheado como null", async () => {
        const { provider, biblesDir } = tempProvider()
        writeFileSync(join(biblesDir, "UNA.fsb"), "{json roto")

        expect(await provider.getVerses(ref("UNA"))).toEqual([])

        writeFileSync(join(biblesDir, "UNA.fsb"), fsb("ya sano"))
        provider.invalidate()
        expect((await provider.getVerses(ref("UNA")))[0].text).toBe("ya sano")
    })

    it("listAvailableVersions() deriva el codigo corto desde los aliases conocidos (para chips y referencias inline)", () => {
        const { provider, biblesDir } = tempProvider()
        writeFileSync(join(biblesDir, "Nueva Traducción Viviente.fsb"), fsb("v"))
        writeFileSync(join(biblesDir, "Reina-Valera 1960.fsb"), fsb("v"))
        writeFileSync(join(biblesDir, "MiBibliaRara.fsb"), fsb("v"))

        const byId = new Map(provider.listAvailableVersions().map((v) => [v.id, v.code]))
        expect(byId.get("Nueva Traducción Viviente")).toBe("NTV")
        expect(byId.get("Reina-Valera 1960")).toBe("RVR1960")
        expect(byId.get("MiBibliaRara")).toBeUndefined() // sin alias conocido: sin codigo
    })

    it("startWatching() sobre carpeta inexistente no lanza y es idempotente", () => {
        const provider = new FreeShowBibleProvider(join(tmpdir(), "no-existe-" + Date.now()))
        cleanups.push(() => provider.stopWatching())

        expect(() => provider.startWatching()).not.toThrow()
        expect(() => provider.startWatching()).not.toThrow()
    })

    it("stopWatching() es seguro sin haber iniciado y llamado dos veces", () => {
        const { provider } = tempProvider()
        expect(() => provider.stopWatching()).not.toThrow()
        provider.startWatching()
        provider.stopWatching()
        expect(() => provider.stopWatching()).not.toThrow()
    })
})
