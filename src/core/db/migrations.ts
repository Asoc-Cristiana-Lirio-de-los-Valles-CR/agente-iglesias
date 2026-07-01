import type Database from "better-sqlite3"

/**
 * Migraciones idempotentes. Cada sentencia usa IF NOT EXISTS, asi que es
 * seguro ejecutarlas en cada arranque. Si en el futuro se necesitan cambios
 * de esquema con datos, se puede introducir una tabla `schema_version`.
 */
export function runMigrations(db: Database.Database): void {
    db.exec(`
    -- Cache de versiculos: evita reconsultar la API. Clave unica logica.
    CREATE TABLE IF NOT EXISTS verses_cache (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      version   TEXT NOT NULL,
      book_id   TEXT NOT NULL,
      chapter   INTEGER NOT NULL,
      verse     INTEGER NOT NULL,
      text      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (version, book_id, chapter, verse)
    );

    -- Historial de referencias consultadas/generadas.
    CREATE TABLE IF NOT EXISTS history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      raw       TEXT NOT NULL,
      version   TEXT,
      created_at INTEGER NOT NULL
    );

    -- Ultimos proyectos creados en FreeShow.
    CREATE TABLE IF NOT EXISTS recent_projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      slides      INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    -- Favoritos del usuario (referencias guardadas).
    CREATE TABLE IF NOT EXISTS favorites (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      raw       TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    -- Configuracion persistida por usuario (clave/valor).
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Versiones/traducciones disponibles o instaladas por proveedor.
    CREATE TABLE IF NOT EXISTS translations (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL,
      provider  TEXT NOT NULL,
      provider_id TEXT,
      installed INTEGER NOT NULL DEFAULT 0,
      UNIQUE (code, provider)
    );

    -- Logs persistidos.
    CREATE TABLE IF NOT EXISTS logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      level     TEXT NOT NULL,
      scope     TEXT NOT NULL,
      message   TEXT NOT NULL,
      meta      TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses_cache (version, book_id, chapter);
    CREATE INDEX IF NOT EXISTS idx_history_created ON history (created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON logs (created_at);
  `)
}
