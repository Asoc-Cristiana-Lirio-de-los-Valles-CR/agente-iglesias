/**
 * Catalogo de libros de la Biblia (66) con su id canonico (codigo USFM/API.Bible),
 * nombre para mostrar en espanol y alias/abreviaturas comunes.
 *
 * El parser usa este catalogo para reconocer el libro al inicio de una
 * referencia, eligiendo SIEMPRE el alias mas largo que coincida (para que
 * "1 Juan" no se confunda con "Juan").
 */

export interface BookDef {
    /** Id canonico (ej. "JHN", "PSA", "1CO"). */
    id: string
    /** Nombre para mostrar (ej. "Juan", "1 Corintios"). */
    name: string
    /** Abreviatura oficial en espanol para usar en titulos de diapositivas (ej. "Jn", "Sal"). */
    short: string
    /** Alias y abreviaturas (sin normalizar; el parser los normaliza). */
    aliases: string[]
}

export const BOOKS: BookDef[] = [
    { id: "GEN", name: "Génesis",        short: "Gén",   aliases: ["genesis", "gen", "gn"] },
    { id: "EXO", name: "Éxodo",          short: "Éx",    aliases: ["exodo", "exo", "ex"] },
    { id: "LEV", name: "Levítico",       short: "Lv",    aliases: ["levitico", "lev", "lv"] },
    { id: "NUM", name: "Números",        short: "Nm",    aliases: ["numeros", "num", "nm"] },
    { id: "DEU", name: "Deuteronomio",   short: "Dt",    aliases: ["deuteronomio", "deu", "dt"] },
    { id: "JOS", name: "Josué",          short: "Jos",   aliases: ["josue", "jos"] },
    { id: "JDG", name: "Jueces",         short: "Jue",   aliases: ["jueces", "jue", "jc"] },
    { id: "RUT", name: "Rut",            short: "Rt",    aliases: ["rut", "rt"] },
    { id: "1SA", name: "1 Samuel",       short: "1 S",   aliases: ["1 samuel", "1samuel", "1 sa", "1sa", "1 sam", "1sam", "primera de samuel", "i samuel"] },
    { id: "2SA", name: "2 Samuel",       short: "2 S",   aliases: ["2 samuel", "2samuel", "2 sa", "2sa", "2 sam", "2sam", "segunda de samuel", "ii samuel"] },
    { id: "1KI", name: "1 Reyes",        short: "1 R",   aliases: ["1 reyes", "1reyes", "1 re", "1re", "1 r", "primera de reyes", "i reyes"] },
    { id: "2KI", name: "2 Reyes",        short: "2 R",   aliases: ["2 reyes", "2reyes", "2 re", "2re", "2 r", "segunda de reyes", "ii reyes"] },
    { id: "1CH", name: "1 Crónicas",     short: "1 Cr",  aliases: ["1 cronicas", "1cronicas", "1 cro", "1cro", "1 cr", "1cr", "primera de cronicas", "i cronicas"] },
    { id: "2CH", name: "2 Crónicas",     short: "2 Cr",  aliases: ["2 cronicas", "2cronicas", "2 cro", "2cro", "2 cr", "2cr", "segunda de cronicas", "ii cronicas"] },
    { id: "EZR", name: "Esdras",         short: "Esd",   aliases: ["esdras", "esd", "esr"] },
    { id: "NEH", name: "Nehemías",       short: "Neh",   aliases: ["nehemias", "neh", "ne"] },
    { id: "EST", name: "Ester",          short: "Est",   aliases: ["ester", "est"] },
    { id: "JOB", name: "Job",            short: "Job",   aliases: ["job", "jb"] },
    { id: "PSA", name: "Salmos",         short: "Sal",   aliases: ["salmos", "salmo", "sal", "sl", "slm"] },
    { id: "PRO", name: "Proverbios",     short: "Pr",    aliases: ["proverbios", "proverbio", "pro", "pr", "prov"] },
    { id: "ECC", name: "Eclesiastés",    short: "Ec",    aliases: ["eclesiastes", "ecl", "ec"] },
    { id: "SNG", name: "Cantares",       short: "Cnt",   aliases: ["cantares", "cantar de los cantares", "cantar", "cnt", "cant", "ct"] },
    { id: "ISA", name: "Isaías",         short: "Is",    aliases: ["isaias", "isa", "is"] },
    { id: "JER", name: "Jeremías",       short: "Jer",   aliases: ["jeremias", "jer", "jr"] },
    { id: "LAM", name: "Lamentaciones",  short: "Lm",    aliases: ["lamentaciones", "lam", "lm"] },
    { id: "EZK", name: "Ezequiel",       short: "Ez",    aliases: ["ezequiel", "eze", "ez"] },
    { id: "DAN", name: "Daniel",         short: "Dn",    aliases: ["daniel", "dan", "dn"] },
    { id: "HOS", name: "Oseas",          short: "Os",    aliases: ["oseas", "os"] },
    { id: "JOL", name: "Joel",           short: "Jl",    aliases: ["joel", "jl"] },
    { id: "AMO", name: "Amós",           short: "Am",    aliases: ["amos", "am"] },
    { id: "OBA", name: "Abdías",         short: "Abd",   aliases: ["abdias", "abd", "ab"] },
    { id: "JON", name: "Jonás",          short: "Jon",   aliases: ["jonas", "jon", "jns"] },
    { id: "MIC", name: "Miqueas",        short: "Mi",    aliases: ["miqueas", "miq", "mi"] },
    { id: "NAM", name: "Nahúm",          short: "Nah",   aliases: ["nahum", "nah", "na"] },
    { id: "HAB", name: "Habacuc",        short: "Hab",   aliases: ["habacuc", "hab", "hb"] },
    { id: "ZEP", name: "Sofonías",       short: "Sof",   aliases: ["sofonias", "sof", "so"] },
    { id: "HAG", name: "Hageo",          short: "Hag",   aliases: ["hageo", "hag", "ag"] },
    { id: "ZEC", name: "Zacarías",       short: "Zac",   aliases: ["zacarias", "zac", "za"] },
    { id: "MAL", name: "Malaquías",      short: "Mal",   aliases: ["malaquias", "mal", "ml"] },
    { id: "MAT", name: "Mateo",          short: "Mt",    aliases: ["mateo", "mat", "mt"] },
    { id: "MRK", name: "Marcos",         short: "Mr",    aliases: ["marcos", "mar", "mc", "mr"] },
    { id: "LUK", name: "Lucas",          short: "Lc",    aliases: ["lucas", "luc", "lc", "lk"] },
    { id: "JHN", name: "Juan",           short: "Jn",    aliases: ["juan", "jn", "jhn"] },
    { id: "ACT", name: "Hechos",         short: "Hch",   aliases: ["hechos", "hch", "he", "hch."] },
    { id: "ROM", name: "Romanos",        short: "Ro",    aliases: ["romanos", "rom", "ro", "rm"] },
    { id: "1CO", name: "1 Corintios",    short: "1 Co",  aliases: ["1 corintios", "1corintios", "1 co", "1co", "1 cor", "1cor", "primera de corintios", "i corintios"] },
    { id: "2CO", name: "2 Corintios",    short: "2 Co",  aliases: ["2 corintios", "2corintios", "2 co", "2co", "2 cor", "2cor", "segunda de corintios", "ii corintios"] },
    { id: "GAL", name: "Gálatas",        short: "Gá",    aliases: ["galatas", "gal", "ga"] },
    { id: "EPH", name: "Efesios",        short: "Ef",    aliases: ["efesios", "efe", "ef"] },
    { id: "PHP", name: "Filipenses",     short: "Fil",   aliases: ["filipenses", "fil", "flp", "fp"] },
    { id: "COL", name: "Colosenses",     short: "Col",   aliases: ["colosenses", "col", "co"] },
    { id: "1TH", name: "1 Tesalonicenses", short: "1 Ts", aliases: ["1 tesalonicenses", "1tesalonicenses", "1 tes", "1tes", "1 ts", "1ts", "primera de tesalonicenses", "i tesalonicenses"] },
    { id: "2TH", name: "2 Tesalonicenses", short: "2 Ts", aliases: ["2 tesalonicenses", "2tesalonicenses", "2 tes", "2tes", "2 ts", "2ts", "segunda de tesalonicenses", "ii tesalonicenses"] },
    { id: "1TI", name: "1 Timoteo",      short: "1 Ti",  aliases: ["1 timoteo", "1timoteo", "1 tim", "1tim", "1 ti", "1ti", "primera de timoteo", "i timoteo"] },
    { id: "2TI", name: "2 Timoteo",      short: "2 Ti",  aliases: ["2 timoteo", "2timoteo", "2 tim", "2tim", "2 ti", "2ti", "segunda de timoteo", "ii timoteo"] },
    { id: "TIT", name: "Tito",           short: "Tit",   aliases: ["tito", "tit", "ti"] },
    { id: "PHM", name: "Filemón",        short: "Flm",   aliases: ["filemon", "flm", "fm"] },
    { id: "HEB", name: "Hebreos",        short: "He",    aliases: ["hebreos", "heb", "he"] },
    { id: "JAS", name: "Santiago",       short: "Stg",   aliases: ["santiago", "stg", "snt", "sant", "jas"] },
    { id: "1PE", name: "1 Pedro",        short: "1 P",   aliases: ["1 pedro", "1pedro", "1 pe", "1pe", "1 ped", "1ped", "primera de pedro", "i pedro"] },
    { id: "2PE", name: "2 Pedro",        short: "2 P",   aliases: ["2 pedro", "2pedro", "2 pe", "2pe", "2 ped", "2ped", "segunda de pedro", "ii pedro"] },
    { id: "1JN", name: "1 Juan",         short: "1 Jn",  aliases: ["1 juan", "1juan", "1 jn", "1jn", "primera de juan", "i juan"] },
    { id: "2JN", name: "2 Juan",         short: "2 Jn",  aliases: ["2 juan", "2juan", "2 jn", "2jn", "segunda de juan", "ii juan"] },
    { id: "3JN", name: "3 Juan",         short: "3 Jn",  aliases: ["3 juan", "3juan", "3 jn", "3jn", "tercera de juan", "iii juan"] },
    { id: "JUD", name: "Judas",          short: "Jud",   aliases: ["judas", "jud", "jds"] },
    { id: "REV", name: "Apocalipsis",    short: "Ap",    aliases: ["apocalipsis", "apoc", "ap", "apc", "revelacion"] },
]

/** Quita acentos y pasa a minusculas, colapsando espacios. */
export function normalize(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Indice de alias normalizado -> definicion de libro, ordenado por longitud
 * descendente para que el parser pruebe primero las coincidencias mas largas.
 */
export interface AliasEntry {
    alias: string
    book: BookDef
}

export const ALIAS_INDEX: AliasEntry[] = (() => {
    const entries: AliasEntry[] = []
    for (const book of BOOKS) {
        const all = new Set<string>([normalize(book.name), ...book.aliases.map(normalize)])
        for (const alias of all) entries.push({ alias, book })
    }
    // Mas largos primero (por numero de caracteres).
    return entries.sort((a, b) => b.alias.length - a.alias.length)
})()

/** Busca un libro por id canonico. */
export function getBookById(id: string): BookDef | undefined {
    return BOOKS.find((b) => b.id === id)
}
