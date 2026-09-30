import { createProject, duplicateProject, newId } from "@/domain/model/factories";
import type { Project } from "@/domain/model/project";
import { parseProjectFile } from "@/io/project-file";
import type { ProjectRepository } from "@/storage/repository";

export async function createAndSaveProject(
  repo: ProjectRepository,
  input: { name: string; description?: string },
): Promise<Project> {
  const project = createProject(input);
  await repo.save(project);
  return project;
}

export async function renameProject(repo: ProjectRepository, id: string, name: string) {
  const project = await repo.get(id);
  if (!project) throw new Error(`Project ${id} not found`);
  await repo.save({ ...project, name: name.trim(), updatedAt: new Date().toISOString() });
}

export async function duplicateAndSaveProject(
  repo: ProjectRepository,
  id: string,
  name: string,
): Promise<Project> {
  const source = await repo.get(id);
  if (!source) throw new Error(`Project ${id} not found`);
  const copy = duplicateProject(source, name);
  await repo.save(copy);
  return copy;
}

/**
 * Imports a `.kesma.json` file. If a project with the same id already exists locally,
 * the import becomes a new project instead of silently overwriting local work.
 */
export async function importProjectFile(
  repo: ProjectRepository,
  text: string,
): Promise<{ project: Project; renamed: boolean }> {
  const parsed = parseProjectFile(text);
  const collision = await repo.exists(parsed.id);
  const project = collision ? { ...parsed, id: newId() } : parsed;
  await repo.save(project);
  return { project, renamed: collision };
}
