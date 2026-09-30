import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseProjectFile, projectFileName, serializeProjectFile } from "@/io/project-file";
import { DexieProjectRepository } from "@/storage/dexie-repository";
import { ProjectFormatError } from "@/storage/migrations";
import { sampleProject } from "@/test/fixtures";
import {
  createAndSaveProject,
  duplicateAndSaveProject,
  importProjectFile,
  renameProject,
} from "./projects";

describe("project file", () => {
  it("round-trips a project exactly", () => {
    const p = sampleProject();
    expect(parseProjectFile(serializeProjectFile(p))).toEqual(p);
  });

  it.each([
    ["not json", "not valid JSON"],
    [JSON.stringify({ hello: 1 }), "not a KESMA project file"],
    [JSON.stringify({ format: "kesma-project", project: { schemaVersion: 1 } }), "invalid"],
  ])("rejects bad input %#", (text, message) => {
    expect(() => parseProjectFile(text)).toThrow(ProjectFormatError);
    expect(() => parseProjectFile(text)).toThrow(message);
  });

  it("builds a safe file name, keeping non-latin letters", () => {
    expect(projectFileName(sampleProject({ name: "Famille Ben Ali — Succession 2026" }))).toBe(
      "famille-ben-ali-succession-2026.kesma.json",
    );
    expect(projectFileName(sampleProject({ name: "تركة بن علي" }))).toBe("تركة-بن-علي.kesma.json");
    expect(projectFileName(sampleProject({ name: "///" }))).toBe("project.kesma.json");
  });
});

describe("project services", () => {
  let repo: DexieProjectRepository;
  let n = 0;
  beforeEach(() => {
    repo = new DexieProjectRepository(`kesma-services-${++n}`);
  });
  afterEach(() => repo.close());

  it("creates, renames and duplicates", async () => {
    const p = await createAndSaveProject(repo, { name: "Alpha" });
    await renameProject(repo, p.id, " Beta ");
    expect((await repo.get(p.id))?.name).toBe("Beta");
    const copy = await duplicateAndSaveProject(repo, p.id, "Beta (copy)");
    expect((await repo.list()).map((s) => s.name).sort()).toEqual(["Beta", "Beta (copy)"]);
    expect(copy.id).not.toBe(p.id);
  });

  it("export → delete → import gives the identical project", async () => {
    const p = sampleProject();
    await repo.save(p);
    const file = serializeProjectFile(p);
    await repo.delete(p.id);
    const { project, renamed } = await importProjectFile(repo, file);
    expect(renamed).toBe(false);
    expect(project).toEqual(p);
    expect(await repo.get(p.id)).toEqual(p);
  });

  it("imports as a new project when the id already exists", async () => {
    const p = sampleProject();
    await repo.save(p);
    const { project, renamed } = await importProjectFile(repo, serializeProjectFile(p));
    expect(renamed).toBe(true);
    expect(project.id).not.toBe(p.id);
    expect(await repo.list()).toHaveLength(2);
  });
});
