import Dexie, { type EntityTable } from "dexie";
import type { Project } from "@/domain/model/project";
import { summarizeProject } from "@/domain/model/summary";
import { migrateProject, validateProject } from "./migrations";
import type { ProjectRepository } from "./repository";

type StoredProject = Project;

class KesmaDatabase extends Dexie {
  projects!: EntityTable<StoredProject, "id">;

  constructor(name: string) {
    super(name);
    // Dexie schema versions are about indexes, not the project shape (see migrations.ts).
    this.version(1).stores({ projects: "id, updatedAt, name" });
  }
}

export class DexieProjectRepository implements ProjectRepository {
  private readonly db: KesmaDatabase;

  constructor(dbName = "kesma") {
    this.db = new KesmaDatabase(dbName);
  }

  async list() {
    const rows = await this.db.projects.orderBy("updatedAt").reverse().toArray();
    return rows.flatMap((row) => {
      try {
        return [summarizeProject(migrateProject(row))];
      } catch (error) {
        console.error(`[kesma] Skipping unreadable project ${row.id}`, error);
        return [];
      }
    });
  }

  async get(id: string) {
    const row = await this.db.projects.get(id);
    return row ? migrateProject(row) : undefined;
  }

  async exists(id: string) {
    return (await this.db.projects.where("id").equals(id).count()) > 0;
  }

  async save(project: Project) {
    await this.db.projects.put(validateProject(project));
  }

  async delete(id: string) {
    await this.db.projects.delete(id);
  }

  close() {
    this.db.close();
  }
}
