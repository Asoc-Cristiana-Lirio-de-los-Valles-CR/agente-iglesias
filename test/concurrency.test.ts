import { describe, it, expect } from "vitest"
import { mapWithConcurrency } from "../src/core/utils/concurrency.js"

describe("mapWithConcurrency", () => {
    it("devuelve los resultados en el orden original", async () => {
        const results = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
            await new Promise((r) => setTimeout(r, n * 5))
            return n * 10
        })
        expect(results).toEqual([30, 10, 20])
    })

    it("nunca ejecuta mas tareas simultaneas que el limite", async () => {
        let running = 0
        let peak = 0
        await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
            running++
            peak = Math.max(peak, running)
            await new Promise((r) => setTimeout(r, 5))
            running--
        })
        expect(peak).toBeLessThanOrEqual(2)
    })

    it("propaga el primer error (semantica Promise.all)", async () => {
        await expect(
            mapWithConcurrency([1, 2, 3], 2, async (n) => {
                if (n === 2) throw new Error("fallo-2")
                return n
            }),
        ).rejects.toThrow("fallo-2")
    })

    it("funciona con lista vacia", async () => {
        expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([])
    })

    it("tras un fallo los workers no procesan items nuevos de la cola (no solo los ya en vuelo)", async () => {
        let calls = 0
        await expect(
            mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
                calls++
                if (n === 2) throw new Error("fallo-abort")
                return n
            }),
        ).rejects.toThrow("fallo-abort")
        // Con limit=2: worker0 toma item1, worker1 toma item2 (falla), worker0 toma item3 antes de saber del fallo.
        // Sin abort flag: worker0 sigue y procesa items 3,4,5 → calls=5.
        // Con abort flag: workers dejan de tomar items nuevos tras el fallo → calls<=3.
        expect(calls).toBeLessThanOrEqual(3)
    })
})
