/**
 * Ejecuta `fn` sobre cada item con un maximo de `limit` tareas simultaneas.
 * Resultados en el orden original. Semantica de error tipo Promise.all:
 * el primer rechazo se propaga (las tareas ya lanzadas terminan solas).
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    let aborted = false

    async function worker(): Promise<void> {
        while (!aborted && next < items.length) {
            const index = next++
            try {
                results[index] = await fn(items[index], index)
            } catch (e) {
                aborted = true
                throw e
            }
        }
    }

    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker())
    await Promise.all(workers)
    return results
}
