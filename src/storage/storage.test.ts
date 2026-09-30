import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@/domain/model/project";
import { sampleProject } from "@/test/fixtures";
import { DexieProjectRepository } from "./dexie-repository";
import { migrateProject, ProjectFormatError } from "./migrations";

describe("migrateProject", () => {
  it("accepts a current-version project", () => {
    const p = sampleProject();
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });

  it.each([
    [null, "not an object"],
    [{}, "schemaVersion"],
    [{ schemaVersion: 0 }, "schemaVersion"],
    [{ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }, "newer version"],
  ])("rejects %j", (raw, message) => {
    expect(() => migrateProject(raw)).toThrow(ProjectFormatError);
    expect(() => migrateProject(raw)).toThrow(message);
  });

  it("reports validation issues with paths", () => {
    const bad = { ...sampleProject(), name: "" };
    try {
      migrateProject(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFormatError);
      expect((e as ProjectFormatError).issues[0]).toMatch(/^name:/);
    }
  });
});

describe("DexieProjectRepository", () => {
  let repo: DexieProjectRepository;
  let dbCounter = 0;

  beforeEach(() => {
    repo = new DexieProjectRepository(`kesma-test-${++dbCounter}`);
  });
  afterEach(() => repo.close());

  it("saves, reads, lists and deletes projects", async () => {
    const a = sampleProject({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" });
    const b = sampleProject({ id: "b", name: "B", updatedAt: "2026-02-01T00:00:00.000Z" });
    await repo.save(a);
    await repo.save(b);

    expect(await repo.get("a")).toEqual(a);
    expect(await repo.exists("a")).toBe(true);
    expect(await repo.exists("zzz")).toBe(false);

    const list = await repo.list();
    expect(list.map((s) => s.id)).toEqual(["b", "a"]); // most recently updated first
    expect(list[0].parcelCount).toBe(1);

    await repo.delete("a");
    expect(await repo.get("a")).toBeUndefined();
    expect((await repo.list()).map((s) => s.id)).toEqual(["b"]);
  });

  it("refuses to persist invalid data", async () => {
    await expect(repo.save({ ...sampleProject(), name: "" })).rejects.toThrow(ProjectFormatError);
  });
});
