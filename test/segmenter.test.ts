import { describe, it, expect } from "vitest"
import { expandRange, slideCount } from "../src/modules/scripture/segmenter.js"

describe("segmenter", () => {
    it("Juan 3:16 -> 1 diapositiva", () => {
        expect(slideCount(16, 16)).toBe(1)
        expect(expandRange(16, 16)).toEqual([16])
    })

    it("Salmos 23:1-6 -> 6 diapositivas", () => {
        expect(slideCount(1, 6)).toBe(6)
        expect(expandRange(1, 6)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("Romanos 8:28-39 -> 12 diapositivas", () => {
        expect(slideCount(28, 39)).toBe(12)
    })

    it("rango invalido lanza error", () => {
        expect(() => expandRange(6, 1)).toThrow()
    })
})
