import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { ScriptureModule, type ScriptureModuleDeps } from "../src/modules/scripture/ScriptureModule.js"
import { Logger } from "../src/core/logger/Logger.js"
import type { BibleReference, Verse } from "../src/types/index.js"

const template = JSON.parse(readFileSync("plantillas/Default.json", "utf8"))

function makeModule(getVerses: (ref: BibleReference) => Promise<Verse[]>) {
    const deps = {
        config: { DEFAULT_VERSION: "RVR1960", DRY_RUN: true, ON_DUPLICATE: "skip", TEMPLATE: "Default" },
        logger: new Logger("error"),
        bible: { getVerses: vi.fn(getVerses) },
        freeshow: { connect: vi.fn() },
        templates: { get: () => template, list: () => ["Default"] },
        recentProjects: { add: vi.fn() },
        configRepo: { get: () => null },
        projectSync: { syncProject: vi.fn() },
        freeshowBible: { listAvailableVersions: () => [] },
    }
    return { module: new ScriptureModule(deps as unknown as ScriptureModuleDeps), deps }
}

function verseFor(ref: BibleReference): Verse[] {
    return [{ verse: ref.verseStart, text: `texto ${ref.raw}` } as Verse]
}

describe("ScriptureModule.generate (busqueda de versiculos en paralelo)", () => {
    it("lanza todas las consultas de versiculos en paralelo (no espera una para iniciar la siguiente)", async () => {
        const resolvers: (() => void)[] = []
        const { module, deps } = makeModule(
            (ref) =>
                new Promise<Verse[]>((resolve) => {
                    resolvers.push(() => resolve(verseFor(ref)))
                }),
        )

        const promise = module.generate("Juan 3:16\nSalmos 23:1\nMateo 5:3")

        // Con busqueda paralela, las 3 consultas arrancan sin resolver ninguna.
        await vi.waitFor(() => expect(deps.bible.getVerses).toHaveBeenCalledTimes(3), { timeout: 1000 })

        for (const r of resolvers) r()
        const result = await promise
        expect(result.failed).toBe(0)
        expect(result.created).toBe(3)
    })

    it("una referencia que falla no rompe el lote y el orden de salida se preserva", async () => {
        const { module } = makeModule((ref) =>
            ref.raw.startsWith("Juan") ? Promise.reject(new Error("sin datos")) : Promise.resolve(verseFor(ref)),
        )

        const result = await module.generate("Juan 3:16\nSalmos 23:1")

        expect(result.items).toHaveLength(2)
        expect(result.items[0].raw).toBe("Juan 3:16")
        expect(result.items[0].ok).toBe(false)
        expect(result.items[0].error).toBe("sin datos")
        expect(result.items[1].raw).toBe("Salmos 23:1")
        expect(result.items[1].ok).toBe(true)
        expect(result.failed).toBe(1)
    })

    it("deduplicacion 'skip': el primero del lote gana, el repetido se marca skipped", async () => {
        const { module } = makeModule((ref) => Promise.resolve(verseFor(ref)))

        const result = await module.generate("Juan 3:16\nJuan 3:16")

        expect(result.created).toBe(1)
        expect(result.skipped).toBe(1)
        expect(result.items[0].skipped).toBeUndefined()
        expect(result.items[1].skipped).toBe(true)
    })
})

describe("ScriptureModule.getVersions / setDisabledVersions (preferencias de chips)", () => {
    function makePrefsModule(versions: { id: string; name: string; code: string }[]) {
        const store = new Map<string, string>()
        const configRepo = {
            get: (key: string) => store.get(key),
            set: (key: string, value: string) => { store.set(key, value) },
        }
        const deps = { configRepo, freeshowBible: { listAvailableVersions: () => versions } }
        return { module: new ScriptureModule(deps as unknown as ScriptureModuleDeps), store }
    }

    const sample = [
        { id: "Reina-Valera 1960", name: "Reina-Valera 1960", code: "RVR1960" },
        { id: "Biblia Jerusalén", name: "Biblia Jerusalén", code: "BJ" },
    ]

    it("todas las versiones vienen enabled:true por defecto (sin preferencias guardadas)", () => {
        const { module } = makePrefsModule(sample)
        expect(module.getVersions()).toEqual([
            { id: "Reina-Valera 1960", name: "Reina-Valera 1960", code: "RVR1960", enabled: true },
            { id: "Biblia Jerusalén", name: "Biblia Jerusalén", code: "BJ", enabled: true },
        ])
    })

    it("setDisabledVersions persiste y refleja enabled:false solo en las deshabilitadas", () => {
        const { module } = makePrefsModule(sample)
        const updated = module.setDisabledVersions(["Biblia Jerusalén"])
        expect(updated.find((v) => v.id === "Biblia Jerusalén")?.enabled).toBe(false)
        expect(updated.find((v) => v.id === "Reina-Valera 1960")?.enabled).toBe(true)
        expect(module.getVersions().find((v) => v.id === "Biblia Jerusalén")?.enabled).toBe(false)
    })

    it("JSON invalido en config no rompe: cae a todas activas", () => {
        const { module, store } = makePrefsModule(sample)
        store.set("disabledBibleVersions", "{not-json")
        expect(module.getVersions().every((v) => v.enabled)).toBe(true)
    })
})
