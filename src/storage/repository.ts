import type { Project, ProjectSummary } from "@/domain/model/project";

/**
 * The only way the app reads or writes projects.
 * MVP: IndexedDB (Dexie). Later: a server/API implementation with the same contract.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | undefined>;
  exists(id: string): Promise<boolean>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}
