import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import { geometryAreaM2 } from "./geometry/measure";
import type { Polygon, Position } from "./model/geojson";
import { adaptScenariosToProperty, clipLotsToProperty } from "./lot-operations";
import { createLot, createScenario } from "./scenarios";
import { validateScenario } from "./validation";

const SQUARE = squarePolygon(316.23);
const [x0, y0] = SQUARE.coordinates[0][0];
const W = SQUARE.coordinates[0][1][0] - x0;
const H = SQUARE.coordinates[0][2][1] - y0;
const at = (fx: number, fy: number): Position => [x0 + fx * W, y0 + fy * H];
const rect = (a: number, b: number, c: number, d: number): Polygon => ({
  type: "Polygon",
  coordinates: [[at(a, b), at(c, b), at(c, d), at(a, d), at(a, b)]],
});

// Property = two parcels side by side (west and east halves).
const WEST = rect(0, 0, 0.5, 1);
const EAST = rect(0.5, 0, 1, 1);

/** Three vertical lots: one in the west, one straddling the middle, one in the east. */
function lots() {
  return [
    createLot({ label: "Lot 1", geometry: rect(0, 0, 0.3, 1), beneficiaryId: "a" }),
    createLot({ label: "Lot 2", geometry: rect(0.3, 0, 0.7, 1), beneficiaryId: "b" }),
    createLot({ label: "Lot 3", geometry: rect(0.7, 0, 1, 1), beneficiaryId: "c" }),
  ];
}

describe("clipLotsToProperty", () => {
  it("keeps inside lots untouched, trims straddling ones, drops outside ones", () => {
    const original = lots();
    const r = clipLotsToProperty(original, [WEST], "Lot");
    expect(r.changed).toBe(true);
    expect(r.lots).toHaveLength(2);
    expect(r.lots[0]).toBe(original[0]); // same object: fully inside
    const trimmed = r.lots.find((l) => l.id === original[1].id)!;
    expect(trimmed.beneficiaryId).toBe("b");
    expect(geometryAreaM2(trimmed.geometry) / geometryAreaM2(SQUARE)).toBeCloseTo(0.2, 3);
    // Result is topologically clean against the remaining property.
    const issues = validateScenario(r.lots, [WEST], []).issues.filter(
      (i) => i.kind !== "unassigned",
    );
    expect(issues).toEqual([]);
  });

  it("drops a lot that would only keep a sliver (e.g. where parcels overlapped)", () => {
    // Lot almost entirely east of the remaining (west) parcel: keeps < 1 % of its area.
    const lot = createLot({ label: "L", geometry: rect(0.499, 0, 1, 1), beneficiaryId: "x" });
    const r = clipLotsToProperty([lot], [WEST], "Lot");
    expect(r).toEqual({ lots: [], changed: true });
  });

  it("reports no change when everything is inside", () => {
    const original = lots();
    const r = clipLotsToProperty(original, [WEST, EAST], "Lot");
    expect(r.changed).toBe(false);
    expect(r.lots).toBe(original);
  });
});

describe("adaptScenariosToProperty", () => {
  it("clips scenarios and their versions to the remaining property", () => {
    const s = { ...createScenario({ name: "S", lots: lots() }) };
    s.versions = [{ id: "v", name: "V", createdAt: s.createdAt, lots: lots() }];
    const r = adaptScenariosToProperty([s], [WEST], "Lot");
    expect(r).toMatchObject({ removed: 0, changed: 1 });
    expect(r.scenarios[0].lots).toHaveLength(2);
    expect(r.scenarios[0].versions[0].lots).toHaveLength(2);
  });

  it("removes scenarios left without lots", () => {
    const eastOnly = createScenario({
      name: "East",
      lots: [createLot({ label: "E", geometry: EAST })],
    });
    const r = adaptScenariosToProperty([eastOnly], [WEST], "Lot");
    expect(r).toMatchObject({ removed: 1, changed: 0, scenarios: [] });
  });

  it("removes every scenario when the property is gone", () => {
    const r = adaptScenariosToProperty([createScenario({ name: "S", lots: lots() })], [], "Lot");
    expect(r).toMatchObject({ removed: 1, scenarios: [] });
  });

  it("leaves untouched scenarios as the same objects (cheap undo history)", () => {
    const s = createScenario({ name: "S", lots: lots() });
    const r = adaptScenariosToProperty([s], [WEST, EAST], "Lot");
    expect(r.scenarios[0]).toBe(s);
    expect(r.changed).toBe(0);
  });
});
