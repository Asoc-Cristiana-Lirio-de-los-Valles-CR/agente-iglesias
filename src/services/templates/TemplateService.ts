import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import type { SlideTemplate } from "../../types/index.js"

/** Esquema de validacion de un cuadro de texto. */
const boxSchema = z.object({
    top: z.number(),
    left: z.number(),
    width: z.number(),
    height: z.number(),
    align: z.enum(["left", "center", "right"]),
    valign: z.enum(["top", "center", "bottom"]),
    fontFamily: z.string(),
    fontSize: z.number().positive(),
    color: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
})

/** Esquema de validacion de una plantilla completa. */
const templateSchema = z.object({
    name: z.string(),
    resolution: z.object({ width: z.number().positive(), height: z.number().positive() }),
    background: z.object({ type: z.enum(["color", "image"]), value: z.string() }),
    title: boxSchema,
    content: boxSchema,
    footer: boxSchema,
})

export class TemplateError extends Error {}

/**
 * TemplateService: carga, valida y resuelve plantillas visuales desde la
 * carpeta `plantillas/`. Cambiar el diseno = editar/agregar un .json, sin
 * recompilar. El showBuilder consume la plantilla activa.
 */
export class TemplateService {
    private cache = new Map<string, SlideTemplate>()

    constructor(private dir: string) {}

    /** Lista los nombres de plantilla disponibles (archivos .json en la carpeta). */
    list(): string[] {
        const path = resolve(this.dir)
        if (!existsSync(path)) return []
        return readdirSync(path)
            .filter((f) => f.toLowerCase().endsWith(".json"))
            .map((f) => f.replace(/\.json$/i, ""))
    }

    /** Carga y valida una plantilla por nombre (sin extension). */
    get(name: string): SlideTemplate {
        if (this.cache.has(name)) return this.cache.get(name)!

        const path = resolve(join(this.dir, `${name}.json`))
        if (!existsSync(path)) {
            throw new TemplateError(`Plantilla no encontrada: "${name}" (${path})`)
        }

        let raw: unknown
        try {
            raw = JSON.parse(readFileSync(path, "utf-8"))
        } catch (err) {
            throw new TemplateError(`Plantilla "${name}" no es JSON valido: ${(err as Error).message}`)
        }

        const parsed = templateSchema.safeParse(raw)
        if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            throw new TemplateError(`Plantilla "${name}" invalida: ${issues}`)
        }

        this.cache.set(name, parsed.data)
        return parsed.data
    }
}
