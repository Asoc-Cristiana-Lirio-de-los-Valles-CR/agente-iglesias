import { describe, it, expect, vi, beforeEach } from "vitest"
import { ProjectSynchronizer, SYNC_TAG, type SyncItem } from "../src/services/freeshow/ProjectSynchronizer.js"
import type { FreeShowService } from "../src/services/freeshow/FreeShowService.js"
import type { FsShow } from "../src/services/freeshow/showFormat.js"
import { Logger } from "../src/core/logger/Logger.js"

function fakeShow(name: string, contentSeed = name, managed = true): FsShow {
    return {
        name,
        category: "scripture",
        settings: { activeLayout: "l1", template: null },
        timestamps: { created: 0, modified: 0, used: null },
        meta: managed ? { title: contentSeed, createdBy: SYNC_TAG } : { title: contentSeed },
        slides: {},
        layouts: {},
        media: {},
    }
}

function item(name: string, contentSeed = name): SyncItem {
    return { name, show: fakeShow(name, contentSeed), fallbackText: name }
}

describe("ProjectSynchronizer (estrategia: reutilizar shows administrados, ignorar contenido del usuario)", () => {
    let freeshow: { [K in keyof FreeShowService]?: ReturnType<typeof vi.fn> }
    let logger: Logger

    beforeEach(() => {
        logger = new Logger("error")
        freeshow = {
            findProjectByName: vi.fn(),
            getProjects: vi.fn().mockResolvedValue([]),
            getShows: vi.fn().mockResolvedValue([]),
            getShow: vi.fn().mockResolvedValue(null),
            createProject: vi.fn(),
            removeProjectItem: vi.fn(),
            selectProject: vi.fn(),
            getProjectShowIds: vi.fn().mockResolvedValueOnce([]).mockResolvedValue(["show-1"]),
            createShow: vi.fn(),
            findShowIdByName: vi.fn(),
            setShow: vi.fn(),
            addToProject: vi.fn(),
        }
    })

    function sync() {
        return new ProjectSynchronizer(freeshow as unknown as FreeShowService, logger)
    }

    /** Configura un proyecto existente con shows dados (mock de getProjects + findProjectByName + get_shows global). */
    function withProjectShows(shows: { id: string; name: string; type?: string }[]) {
        freeshow.findProjectByName!.mockResolvedValue({ id: "proj-1", name: "Versiculos", shows })
        freeshow.getProjects!.mockResolvedValue([{ id: "proj-1", name: "Versiculos", shows }])
        // get_shows global: por defecto, todos los items tipo show del proyecto existen.
        freeshow.getShows!.mockResolvedValue(shows.filter((s) => !s.type || s.type === "show").map((s) => ({ id: s.id, name: s.name })))
    }

    it("crea el proyecto si no existe", async () => {
        freeshow.findProjectByName!.mockResolvedValue(null)
        freeshow.createShow!.mockResolvedValue("show-1")

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.createProject).toHaveBeenCalledTimes(1)
        expect(result.created).toBe(1)
        expect(result.updated).toBe(0)
        expect(result.unchanged).toBe(0)
        expect(result.unlinked).toBe(0)
        expect(result.ignoredUserShows).toBe(0)
    })

    it("reutiliza el proyecto existente por nombre exacto (no crea uno nuevo)", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue("show-1")

        const result = await sync().syncProject("Versiculos", [item("Salmos 23:1 RVR1960")])

        expect(freeshow.createProject).not.toHaveBeenCalled()
        expect(result.projectId).toBe("proj-1")
    })

    it("reutiliza un show ADMINISTRADO existente con el mismo nombre via set_show, sin crear uno nuevo", async () => {
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960", "texto viejo"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960", "texto nuevo")])

        expect(freeshow.createShow).not.toHaveBeenCalled()
        expect(freeshow.setShow).toHaveBeenCalledWith("old-show", expect.objectContaining({ name: "Juan 3:16 RVR1960" }))
        expect(result.created).toBe(0)
        expect(result.updated).toBe(1)
        expect(result.unlinked).toBe(0)
    })

    it("no llama set_show si el contenido reutilizado es identico (unchanged)", async () => {
        const storedShow = fakeShow("Juan 3:16 RVR1960", "mismo texto")
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(storedShow)

        const result = await sync().syncProject("Versiculos", [
            { name: "Juan 3:16 RVR1960", show: fakeShow("Juan 3:16 RVR1960", "mismo texto"), fallbackText: "x" },
        ])

        expect(freeshow.setShow).not.toHaveBeenCalled()
        expect(result.unchanged).toBe(1)
        expect(result.updated).toBe(0)
    })

    it("considera 'unchanged' contenido identico aunque las claves de objetos anidados (meta) vengan en otro orden (FreeShow puede devolver el JSON reordenado)", async () => {
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        // FreeShow devuelve meta con las claves en orden distinto al que nosotros enviamos.
        const stored = fakeShow("Juan 3:16 RVR1960", "mismo texto")
        stored.meta = { createdBy: SYNC_TAG, title: "mismo texto" } // orden invertido vs fakeShow()
        freeshow.getShow!.mockResolvedValue(stored)

        const result = await sync().syncProject("Versiculos", [
            { name: "Juan 3:16 RVR1960", show: fakeShow("Juan 3:16 RVR1960", "mismo texto"), fallbackText: "x" },
        ])

        expect(freeshow.setShow).not.toHaveBeenCalled()
        expect(result.unchanged).toBe(1)
        expect(result.updated).toBe(0)
    })

    it("crea solo los shows adicionales cuando hoy hay mas que ayer", async () => {
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))
        freeshow.createShow!.mockResolvedValue("show-new")

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960"), item("Salmos 23:1 RVR1960")])

        expect(freeshow.createShow).toHaveBeenCalledTimes(1)
        expect(freeshow.createShow).toHaveBeenCalledWith("Salmos 23:1 RVR1960", "Salmos 23:1 RVR1960")
        expect(result.created).toBe(1)
        expect(result.unlinked).toBe(0)
    })

    it("desvincula solo los shows ADMINISTRADOS sobrantes, en orden descendente de indice", async () => {
        const shows = [
            { id: "keep", name: "Juan 3:16 RVR1960" },
            { id: "drop-1", name: "Salmos 23:1 RVR1960" },
            { id: "drop-2", name: "Mateo 1:1 RVR1960" },
        ]
        withProjectShows(shows)
        freeshow.getShow!.mockImplementation((id: string) => Promise.resolve(fakeShow(shows.find((s) => s.id === id)!.name)))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).toHaveBeenCalledTimes(2)
        expect(freeshow.removeProjectItem).toHaveBeenNthCalledWith(1, "proj-1", 2) // drop-2
        expect(freeshow.removeProjectItem).toHaveBeenNthCalledWith(2, "proj-1", 1) // drop-1
        expect(result.unlinked).toBe(2)
        expect(result.created).toBe(0)
    })

    it("REGLA DE SEGURIDAD: nunca toca un show sin meta.createdBy === SYNC_TAG (contenido del usuario)", async () => {
        const shows = [
            { id: "manual-1", name: "Bienvenida del pastor" }, // sin tag: agregado a mano en FreeShow
            { id: "manual-2", name: "Anuncio especial" }, // tag distinto
        ]
        withProjectShows(shows)
        freeshow.getShow!.mockImplementation((id: string) => {
            if (id === "manual-1") return Promise.resolve(fakeShow("Bienvenida del pastor", "x", false))
            if (id === "manual-2") return Promise.resolve({ ...fakeShow("Anuncio especial", "x", false), meta: { createdBy: "OtraApp" } })
            return Promise.resolve(null)
        })
        freeshow.createShow!.mockResolvedValue("show-nuevo")

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        // No se desvincula, no se sobrescribe, no se cuenta como manejado.
        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(freeshow.setShow).not.toHaveBeenCalledWith("manual-1", expect.anything())
        expect(freeshow.setShow).not.toHaveBeenCalledWith("manual-2", expect.anything())
        expect(result.ignoredUserShows).toBe(2)
        expect(result.unlinked).toBe(0)
        // El item de hoy, al no encontrar un show ADMINISTRADO con ese nombre, se crea (no reutiliza el ajeno).
        expect(result.created).toBe(1)
        expect(freeshow.createShow).toHaveBeenCalledWith("Juan 3:16 RVR1960", "Juan 3:16 RVR1960")
    })

    it("si getShow no puede leer un show (id obsoleto), lo trata como NO administrado (no lo toca)", async () => {
        withProjectShows([{ id: "id-raro", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(null)
        freeshow.createShow!.mockResolvedValue("show-nuevo")

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(freeshow.setShow).not.toHaveBeenCalledWith("id-raro", expect.anything())
        expect(result.ignoredUserShows).toBe(1)
        expect(result.created).toBe(1)
    })

    it("nunca toca un proyecto distinto al sincronizado", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue("show-1")

        await sync().syncProject("Versiculos", [item("Juan 1:1 RVR1960")])

        for (const call of (freeshow.removeProjectItem as ReturnType<typeof vi.fn>).mock.calls) {
            expect(call[0]).toBe("proj-1")
        }
        for (const call of (freeshow.addToProject as ReturnType<typeof vi.fn>).mock.calls) {
            expect(call[0]).toBe("proj-1")
        }
    })

    it("etiqueta cada show creado o reutilizado con meta.createdBy = SYNC_TAG", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue("show-1")

        await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        const [, sentShow] = (freeshow.setShow as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(sentShow.meta.createdBy).toBe(SYNC_TAG)
    })

    it("obtiene el id del show nuevo via snapshot del proyecto (create_show no devuelve id — comportamiento real de FreeShow)", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue(null)
        // getProjectShowIds: [] antes de create_show, ["show-snapshot"] despues.
        freeshow.getProjectShowIds!.mockResolvedValueOnce([]).mockResolvedValue(["show-snapshot"])

        await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.setShow).toHaveBeenCalledWith("show-snapshot", expect.objectContaining({ meta: expect.objectContaining({ createdBy: SYNC_TAG }) }))
        expect(freeshow.addToProject).toHaveBeenCalledWith("proj-1", "show-snapshot", "Juan 3:16 RVR1960")
    })

    it("lanza si el show no aparece en el proyecto despues de crearlo", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue(null)
        // getProjectShowIds siempre devuelve [] — show nunca aparece (simula timeout).
        freeshow.getProjectShowIds!.mockResolvedValue([])

        await expect(sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])).rejects.toThrow()
    }, 10000)

    // -------------------- Optimizaciones de rendimiento --------------------

    it("hace una sola llamada get_projects por sincronizacion (sin creaciones) y no usa findProjectByName", async () => {
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.getProjects).toHaveBeenCalledTimes(1)
        expect(freeshow.findProjectByName).not.toHaveBeenCalled()
    })

    it("si un getShow rechaza, ese show se trata como del usuario y el sync no aborta", async () => {
        const shows = [
            { id: "roto", name: "Show ilegible" },
            { id: "sano", name: "Juan 3:16 RVR1960" },
        ]
        withProjectShows(shows)
        freeshow.getShow!.mockImplementation((id: string) =>
            id === "roto" ? Promise.reject(new Error("boom")) : Promise.resolve(fakeShow("Juan 3:16 RVR1960")),
        )

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(result.ignoredUserShows).toBe(1)
        expect(result.unchanged).toBe(1)
        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(freeshow.setShow).not.toHaveBeenCalledWith("roto", expect.anything())
    })

    it("si un set_show de actualizacion falla, syncProject lanza (semantica Promise.all preservada)", async () => {
        withProjectShows([{ id: "old-show", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960", "texto viejo"))
        freeshow.setShow!.mockRejectedValue(new Error("set_show fallo"))

        await expect(sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960", "texto nuevo")])).rejects.toThrow("set_show fallo")
    })

    it("resuelve el id del show nuevo en el primer sondeo sin esperar delays", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue(null)
        freeshow.getProjectShowIds!.mockReset()
        freeshow.getProjectShowIds!.mockResolvedValueOnce([]).mockResolvedValue(["show-rapido"])

        const start = Date.now()
        await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])
        const elapsed = Date.now() - start

        // Snapshot + primer sondeo = 2 llamadas; sin pasar por ningun delay del backoff.
        expect(freeshow.getProjectShowIds).toHaveBeenCalledTimes(2)
        expect(elapsed).toBeLessThan(200)
        expect(freeshow.setShow).toHaveBeenCalledWith("show-rapido", expect.anything())
    })

    it("nunca llama get_show para items de video/imagen del proyecto (los cuenta como contenido del usuario)", async () => {
        withProjectShows([
            { id: "D:\\videos\\intro.mp4", name: "intro", type: "video" },
            { id: "C:\\fotos\\anuncio.jpg", name: "anuncio", type: "image" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
        ])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.getShow).toHaveBeenCalledTimes(1)
        expect(freeshow.getShow).toHaveBeenCalledWith("s1")
        expect(result.ignoredUserShows).toBe(2)
        expect(result.unchanged).toBe(1)
        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
    })

    it("limpia automaticamente una referencia colgante (id que ya no existe en get_shows) sin llamar get_show sobre ella", async () => {
        withProjectShows([
            { id: "huerfano", name: "Show borrado" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
        ])
        // get_shows global solo conoce s1: "huerfano" apunta a un .show eliminado.
        // withProjectShows deja mockResolvedValue persistente: la reconfirmacion (2da lectura) devuelve lo mismo.
        freeshow.getShows!.mockResolvedValue([{ id: "s1", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.getShow).toHaveBeenCalledTimes(1)
        expect(freeshow.getShow).toHaveBeenCalledWith("s1")
        expect(result.unchanged).toBe(1)
        expect(result.ignoredUserShows).toBe(0) // ya no cuenta como "contenido de usuario": es un puntero roto, se limpia
        expect(result.danglingRemoved).toBe(1)
        expect(freeshow.removeProjectItem).toHaveBeenCalledTimes(1)
        expect(freeshow.removeProjectItem).toHaveBeenCalledWith("proj-1", 0) // indice de "huerfano"
    })

    it("limpia solo la referencia colgante cuando coexiste con un show administrado y un show de usuario real", async () => {
        const shows = [
            { id: "huerfano", name: "Show borrado" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
            { id: "manual-1", name: "Bienvenida del pastor" },
        ]
        withProjectShows(shows)
        freeshow.getShows!.mockResolvedValue([
            { id: "s1", name: "Juan 3:16 RVR1960" },
            { id: "manual-1", name: "Bienvenida del pastor" },
        ])
        freeshow.getShow!.mockImplementation((id: string) => {
            if (id === "s1") return Promise.resolve(fakeShow("Juan 3:16 RVR1960"))
            if (id === "manual-1") return Promise.resolve(fakeShow("Bienvenida del pastor", "x", false))
            return Promise.resolve(null)
        })

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).toHaveBeenCalledTimes(1)
        expect(freeshow.removeProjectItem).toHaveBeenCalledWith("proj-1", 0) // solo "huerfano"
        expect(result.danglingRemoved).toBe(1)
        expect(result.ignoredUserShows).toBe(1) // manual-1: contenido real de usuario, nunca tocado
        expect(result.unchanged).toBe(1)
    })

    it("si la reconfirmacion de get_shows ya no muestra la referencia como colgante (aparecio entre lecturas), no la elimina", async () => {
        withProjectShows([
            { id: "recien-creado", name: "Show en proceso" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
        ])
        freeshow.getShows!
            .mockReset()
            .mockResolvedValueOnce([{ id: "s1", name: "Juan 3:16 RVR1960" }]) // 1ra lectura: aun no aparece
            .mockResolvedValueOnce([
                { id: "s1", name: "Juan 3:16 RVR1960" },
                { id: "recien-creado", name: "Show en proceso" },
            ]) // reconfirmacion: ya aparecio
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(result.danglingRemoved).toBe(0)
    })

    it("si la reconfirmacion de get_shows falla, no elimina nada ese ciclo", async () => {
        withProjectShows([
            { id: "huerfano", name: "Show borrado" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
        ])
        freeshow.getShows!
            .mockReset()
            .mockResolvedValueOnce([{ id: "s1", name: "Juan 3:16 RVR1960" }]) // 1ra lectura
            .mockRejectedValueOnce(new Error("api caida")) // reconfirmacion falla
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(result.danglingRemoved).toBe(0)
    })

    it("nunca cuenta multimedia como colgante aunque su ruta no este en get_shows", async () => {
        withProjectShows([
            { id: "D:\\videos\\intro.mp4", name: "intro", type: "video" },
            { id: "s1", name: "Juan 3:16 RVR1960" },
        ])
        // get_shows global solo lista shows reales: el .mp4 nunca aparece aqui (no es un show).
        freeshow.getShows!.mockResolvedValue([{ id: "s1", name: "Juan 3:16 RVR1960" }])
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.removeProjectItem).not.toHaveBeenCalled()
        expect(result.danglingRemoved).toBe(0)
        expect(result.ignoredUserShows).toBe(1) // el video: contenido de usuario, no colgante
    })

    it("si get_shows falla, clasifica igual leyendo cada show con get_show (fallback al comportamiento anterior)", async () => {
        withProjectShows([{ id: "s1", name: "Juan 3:16 RVR1960" }])
        freeshow.getShows!.mockRejectedValue(new Error("api caida"))
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(result.unchanged).toBe(1)
    })

    it("si get_shows devuelve lista vacia (respuesta anomala), no filtra refs y lee cada show con get_show (evita crear duplicados)", async () => {
        // get_shows vacio pero exitoso puede ocurrir si FreeShow esta inicializando
        // o la respuesta se parsea mal. Con un Set vacio, knownShowIds.has() siempre falla
        // y TODOS los shows del proyecto se tratan como colgantes — ninguno se lee, todos
        // se recrean, generando duplicados. El fallback correcto es null (leer todos).
        withProjectShows([{ id: "s1", name: "Juan 3:16 RVR1960" }])
        freeshow.getShows!.mockResolvedValue([]) // exito pero vacio
        freeshow.getShow!.mockResolvedValue(fakeShow("Juan 3:16 RVR1960"))

        const result = await sync().syncProject("Versiculos", [item("Juan 3:16 RVR1960")])

        expect(freeshow.getShow).toHaveBeenCalledWith("s1")
        expect(result.unchanged).toBe(1) // reutilizado, no duplicado
        expect(result.created).toBe(0)
    })

    it("respeta el limite de sondeos con delays inyectados [0, 0] y lanza al agotarlos", async () => {
        withProjectShows([])
        freeshow.createShow!.mockResolvedValue(null)
        freeshow.getProjectShowIds!.mockReset()
        freeshow.getProjectShowIds!.mockResolvedValue([]) // nunca aparece

        const s = new ProjectSynchronizer(freeshow as unknown as FreeShowService, logger, { createPollDelaysMs: [0, 0] })

        await expect(s.syncProject("Versiculos", [item("Juan 3:16 RVR1960")])).rejects.toThrow()
        // Snapshot (1) + sondeo inmediato (1) + 2 sondeos tras cada delay = 4.
        expect(freeshow.getProjectShowIds).toHaveBeenCalledTimes(4)
    })
})
