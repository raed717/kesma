import { z } from "zod";
import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Project } from "@/domain/model/project";

export class ProjectFormatError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

type RawProject = Record<string, unknown> & { schemaVersion: number };

/**
 * `migrations[n]` upgrades a project from schema version n to n + 1.
 * Never edit a released migration: add a new one and bump CURRENT_SCHEMA_VERSION.
 */
const migrations: Record<number, (raw: RawProject) => RawProject> = {};

/** Upgrades any persisted/imported project to the current schema, then validates it. */
export function migrateProject(raw: unknown): Project {
  if (typeof raw !== "object" || raw === null) {
    throw new ProjectFormatError("Project data is not an object");
  }
  let current = raw as RawProject;
  const version = current.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError("Missing or invalid schemaVersion");
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `This project was created by a newer version of KESMA (schema ${version})`,
    );
  }
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new ProjectFormatError(`No migration from schema ${v}`);
    current = { ...migrate(current), schemaVersion: v + 1 };
  }
  return validateProject(current);
}

export function validateProject(raw: unknown): Project {
  const result = ProjectSchema.safeParse(raw);
  if (!result.success) {
    throw new ProjectFormatError("Project data is invalid", formatIssues(result.error));
  }
  return result.data;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
