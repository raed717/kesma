import { describe, expect, it } from "vitest";
import { fixedDeps, sampleProject } from "@/test/fixtures";
import { createProject, duplicateProject, DEFAULT_SETTINGS } from "./factories";
import { CURRENT_SCHEMA_VERSION, ProjectSchema } from "./project";
import { summarizeProject } from "./summary";

describe("createProject", () => {
  it("creates a valid, empty project with defaults", () => {
    const p = createProject({ name: "  Test  ", description: " " }, fixedDeps);
    expect(ProjectSchema.parse(p)).toEqual(p);
    expect(p.name).toBe("Test");
    expect(p.description).toBeUndefined();
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(p.createdAt).toBe("2026-09-30T10:00:00.000Z");
    expect(p.scenarios).toEqual([]);
  });

  it("merges custom settings", () => {
    const p = createProject({ name: "X", settings: { areaUnit: "m2" } }, fixedDeps);
    expect(p.settings.areaUnit).toBe("m2");
    expect(p.settings.currency).toBe("TND");
  });
});

describe("duplicateProject", () => {
  it("deep-copies with a new id and name", () => {
    const source = sampleProject();
    const copy = duplicateProject(source, "Copy", fixedDeps);
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe("Copy");
    expect(copy.property).toEqual(source.property);
    expect(copy.property).not.toBe(source.property);
  });
});

describe("ProjectSchema", () => {
  it("accepts the sample project", () => {
    expect(ProjectSchema.safeParse(sampleProject()).success).toBe(true);
  });

  it("rejects projected (non-WGS84) coordinates", () => {
    const p = sampleProject();
    p.property.parcels[0].geometry = {
      type: "Polygon",
      coordinates: [
        [
          [512000, 4070000],
          [512100, 4070000],
          [512100, 4070100],
          [512000, 4070000],
        ],
      ],
    };
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });

  it("rejects an invalid share", () => {
    const p = sampleProject();
    p.beneficiaries[0].share = { mode: "fraction", numerator: 1, denominator: 0 };
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });
});

describe("summarizeProject", () => {
  it("computes counts and property area", () => {
    const s = summarizeProject(sampleProject());
    expect(s.parcelCount).toBe(1);
    expect(s.beneficiaryCount).toBe(1);
    expect(s.scenarioCount).toBe(0);
    expect(s.propertyAreaM2).toBeGreaterThan(9_900);
    expect(s.propertyAreaM2).toBeLessThan(10_100);
  });
});
