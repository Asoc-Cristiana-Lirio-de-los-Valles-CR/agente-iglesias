import type { DB } from "../database.js"

export interface RecentProject {
    project_id: string
    name: string
    slides: number
    created_at: number
}

/** Acceso a la tabla `recent_projects`. */
export class RecentProjectsRepository {
    constructor(private db: DB) {}

    add(projectId: string, name: string, slides: number): void {
        this.db
            .prepare(`INSERT INTO recent_projects (project_id, name, slides, created_at) VALUES (?, ?, ?, ?)`)
            .run(projectId, name, slides, Date.now())
    }

    recent(limit = 50): RecentProject[] {
        return this.db
            .prepare(
                `SELECT project_id, name, slides, created_at FROM recent_projects ORDER BY created_at DESC, id DESC LIMIT ?`,
            )
            .all(limit) as RecentProject[]
    }
}
