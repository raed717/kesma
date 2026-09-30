import type { Project } from "@/domain/model/project";
import { migrateProject, ProjectFormatError } from "@/storage/migrations";

export const PROJECT_FILE_FORMAT = "kesma-project";
export const PROJECT_FILE_EXTENSION = ".kesma.json";

type ProjectFileEnvelope = {
  format: typeof PROJECT_FILE_FORMAT;
  exportedAt: string;
  project: Project;
};

export function serializeProjectFile(project: Project, now = new Date()): string {
  const envelope: ProjectFileEnvelope = {
    format: PROJECT_FILE_FORMAT,
    exportedAt: now.toISOString(),
    project,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Parses and migrates a `.kesma.json` file. Throws `ProjectFormatError` on any problem. */
export function parseProjectFile(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("The file is not valid JSON");
  }
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { format?: unknown }).format !== PROJECT_FILE_FORMAT
  ) {
    throw new ProjectFormatError("This is not a KESMA project file");
  }
  return migrateProject((data as { project?: unknown }).project);
}

export function projectFileName(project: Project): string {
  const slug =
    project.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "project";
  return `${slug}${PROJECT_FILE_EXTENSION}`;
}
