import { describe, expect, it } from "vitest";
import { analyzeProject, bestIndices } from "./compare";
import { buildDemoProject, type DemoLabels } from "./demo";
import { ProjectSchema } from "./model/project";

const LABELS: DemoLabels = {
  projectName: "Demo",
  description: "Sample",
  parcels: ["North", "East"],
  heirs: [
    { name: "Fatma", notes: "1/8" },
    { name: "Ahmed", notes: "×2" },
    { name: "Youssef", notes: "×2" },
    { name: "Amira", notes: "×1" },
  ],
  zone: "Irrigated",
  well: "Well",
  orchard: "Olives",
  road: "Road",
  lotPrefix: "Lot",
  scenarios: { area: "By area", value: "By value", parcels: "Parcels" },
};

describe("demo project", () => {
  const project = buildDemoProject(LABELS);
  const analysis = analyzeProject(project);
  const [byArea, byValue, parcels] = analysis.scenarios;

  it("is a valid, complete project", () => {
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.property.parcels).toHaveLength(2);
    expect(project.beneficiaries).toHaveLength(4);
    expect(analysis.shares.status).toBe("complete");
    expect(analysis.scenarios.map((s) => s.scenario.name)).toEqual([
      "By area",
      "By value",
      "Parcels",
    ]);
    // ~3.3 ha + ~1.9 ha.
    expect(analysis.propertyAreaM2).toBeGreaterThan(40_000);
    expect(analysis.propertyAreaM2).toBeLessThan(60_000);
  });

  it("auto-split scenarios are valid and balanced, with road access for everyone", () => {
    for (const s of [byArea, byValue]) {
      expect(s.validation.status).toBe("valid");
      expect(s.indicators.lotCount).toBe(4);
      expect(s.indicators.roadAccess).toEqual({ count: 4, total: 4 });
    }
    expect(byArea.indicators.maxAreaDeviation).toBeLessThan(0.001);
    expect(byValue.indicators.maxValueDeviation!).toBeLessThan(0.001);
    // Balancing value moves the cuts: areas are then off target (zone, well, orchard).
    expect(byValue.indicators.maxAreaDeviation).toBeGreaterThan(0.01);
  });

  it("the parcels scenario is geometrically valid but far from the targets", () => {
    expect(parcels.validation.status).toBe("valid");
    // Two heirs get nothing at all (−100 %).
    expect(parcels.indicators.maxAreaDeviation).toBeCloseTo(1, 6);
    expect(parcels.indicators.withinTolerance).toBeLessThan(2);
    const best = bestIndices(analysis.scenarios.map((s) => s.indicators.maxAreaDeviation));
    expect(best).toEqual([0]);
  });
});

describe("bestIndices", () => {
  it("picks the lowest (or highest) values, all of them on a tie, ignoring nulls", () => {
    expect(bestIndices([0.3, 0.1, null, 0.2])).toEqual([1]);
    expect(bestIndices([1, 3, 2], true)).toEqual([1]);
    expect(bestIndices([4, 4, 2], true)).toEqual([0, 1]);
  });
  it("returns nothing when there is nothing to distinguish", () => {
    expect(bestIndices([0.2, 0.2])).toEqual([]);
    expect(bestIndices([0.2, null])).toEqual([]);
    expect(bestIndices([])).toEqual([]);
  });
});
