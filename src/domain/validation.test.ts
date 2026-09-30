import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import { allocationStatus, computeAllocation } from "./allocation";
import { geometryAreaM2 } from "./geometry/measure";
import { createBeneficiary } from "./model/factories";
import type { LineString, Polygon, Position } from "./model/geojson";
import type { Beneficiary, Lot } from "./model/project";
import {
  absorbGap,
  clipLotToProperty,
  repairLot,
  resolveOverlap,
  splitLots,
} from "./lot-operations";
import { createLot } from "./scenarios";
import { resolveShares } from "./shares";
import { validateScenario } from "./validation";

const PROPERTY = squarePolygon(316.23); // ≈ 10 ha
const ring = PROPERTY.coordinates[0];
const [x0, y0] = ring[0];
const W = ring[1][0] - x0;
const H = ring[2][1] - y0;
const at = (fx: number, fy: number): Position => [x0 + fx * W, y0 + fy * H];
const rect = (fx0: number, fy0: number, fx1: number, fy1: number): Polygon => ({
  type: "Polygon",
  coordinates: [[at(fx0, fy0), at(fx1, fy0), at(fx1, fy1), at(fx0, fy1), at(fx0, fy0)]],
});
const line = (...pts: Position[]): LineString => ({ type: "LineString", coordinates: pts });
const PROPERTY_M2 = geometryAreaM2(PROPERTY);

const heirs = (n: number): Beneficiary[] =>
  Array.from({ length: n }, (_, i) =>
    createBeneficiary({ name: `H${i + 1}`, color: "#2563eb" }, { id: () => `h${i + 1}` }),
  );

/** Property cut into 4 vertical strips, assigned to h1..h4. */
function fourStrips(): Lot[] {
  let lots: Lot[] = [createLot({ label: "Lot 1", geometry: PROPERTY })];
  for (const fx of [0.25, 0.5, 0.75]) {
    const r = splitLots(lots, line(at(fx, -0.1), at(fx, 1.1)), "Lot");
    if (!r.ok) throw new Error(r.reason);
    lots = r.lots;
  }
  const byX = [...lots].sort(
    (a, b) => a.geometry.coordinates[0][0][0] - b.geometry.coordinates[0][0][0],
  );
  return byX.map((l, i) => ({ ...l, beneficiaryId: `h${i + 1}` }));
}

const kinds = (lots: Lot[], hs = heirs(4)) =>
  validateScenario(lots, [PROPERTY], hs).issues.map((i) => i.kind);

describe("computeAllocation", () => {
  it("equal strips for 4 equal heirs are within tolerance", () => {
    const hs = heirs(4);
    const a = computeAllocation(fourStrips(), hs, resolveShares(hs, PROPERTY_M2), 1);
    expect(a.rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(a.maxAbsDeviation).toBeLessThan(1e-3);
    expect(a.unassigned.lotIds).toEqual([]);
    expect(a.beneficiariesWithinTolerance).toBe(4);
  });

  it("reports differences, lot counts and unassigned area", () => {
    const hs = heirs(2);
    const lots = fourStrips().map((l, i) => ({
      ...l,
      beneficiaryId: i < 3 ? "h1" : i === 3 ? null : "h2",
    }));
    const a = computeAllocation(lots, hs, resolveShares(hs, PROPERTY_M2), 1);
    const [h1, h2] = a.rows;
    expect(h1.lotIds).toHaveLength(3);
    expect(h1.diffRatio!).toBeCloseTo(0.5, 3); // 75 % received vs 50 % target
    expect(h1.status).toBe("off");
    expect(h2.allocatedM2).toBe(0);
    expect(h2.diffRatio!).toBeCloseTo(-1, 6);
    expect(a.unassigned.areaM2).toBeCloseTo(PROPERTY_M2 / 4, -1);
  });

  it("treats assignments to deleted beneficiaries as unassigned", () => {
    const lots = fourStrips();
    const a = computeAllocation(lots, heirs(2), resolveShares(heirs(2), PROPERTY_M2), 1);
    expect(a.unassigned.lotIds).toHaveLength(2);
  });

  it("maps deviations to ok / warn / off", () => {
    expect(allocationStatus(0.01, 1)).toBe("ok");
    expect(allocationStatus(-0.015, 1)).toBe("warn");
    expect(allocationStatus(0.03, 1)).toBe("off");
    expect(allocationStatus(null, 1)).toBe("noTarget");
  });
});

describe("validateScenario", () => {
  it("a clean, fully assigned division is valid", () => {
    const r = validateScenario(fourStrips(), [PROPERTY], heirs(4));
    expect(r.status).toBe("valid");
    expect(r.issues).toEqual([]);
  });

  it("an empty scenario is incomplete", () => {
    expect(validateScenario([], [PROPERTY], []).status).toBe("incomplete");
  });

  it("detects gaps (incomplete) with their area", () => {
    const lots = fourStrips().slice(0, 3);
    const r = validateScenario(lots, [PROPERTY], heirs(4));
    expect(r.status).toBe("incomplete");
    const gap = r.issues.find((i) => i.kind === "gap")!;
    expect(gap.areaM2! / PROPERTY_M2).toBeCloseTo(0.25, 3);
    expect(gap.sliver).toBe(false);
  });

  it("detects overlaps and duplicates (invalid)", () => {
    const lots = [
      createLot({ label: "A", geometry: rect(0, 0, 0.6, 1), beneficiaryId: "h1" }),
      createLot({ label: "B", geometry: rect(0.5, 0, 1, 1), beneficiaryId: "h2" }),
    ];
    const r = validateScenario(lots, [PROPERTY], heirs(2));
    expect(r.status).toBe("invalid");
    const overlap = r.issues.find((i) => i.kind === "overlap")!;
    expect(overlap.areaM2! / PROPERTY_M2).toBeCloseTo(0.1, 3);
    expect(overlap.lotIds).toEqual([lots[0].id, lots[1].id]);

    const dup = [lots[0], { ...lots[0], id: "copy" }];
    expect(kinds(dup)).toContain("duplicate");
  });

  it("detects lots extending outside the property", () => {
    const lots = [createLot({ label: "A", geometry: rect(0, 0, 1.2, 1), beneficiaryId: "h1" })];
    const r = validateScenario(lots, [PROPERTY], heirs(1));
    const out = r.issues.find((i) => i.kind === "outsideProperty")!;
    expect(out.areaM2! / PROPERTY_M2).toBeCloseTo(0.2, 3);
  });

  it("detects self-intersecting lots with the location", () => {
    const bowtie: Polygon = {
      type: "Polygon",
      coordinates: [[at(0, 0), at(1, 1), at(1, 0), at(0, 1), at(0, 0)]],
    };
    const r = validateScenario(
      [createLot({ label: "X", geometry: bowtie, beneficiaryId: "h1" })],
      [PROPERTY],
      heirs(1),
    );
    const issue = r.issues.find((i) => i.kind === "invalidGeometry")!;
    expect(issue.detail).toBe("selfIntersection");
    expect(issue.location![0]).toBeCloseTo(at(0.5, 0.5)[0], 9);
  });

  it("flags unassigned lots and tiny slivers", () => {
    const lots = fourStrips().map((l, i) => (i === 0 ? { ...l, beneficiaryId: null } : l));
    expect(kinds(lots)).toEqual(["unassigned"]);

    // Shrink the last strip by ~1 cm at the property edge → a sliver gap.
    const last = lots[3];
    const eps = 0.000005; // of width ≈ 1.6 mm → ≈ 0.5 m² over the property height
    const shrunk = { ...last, geometry: rect(0.75, 0, 1 - eps, 1) };
    const r = validateScenario([...lots.slice(0, 3), shrunk], [PROPERTY], heirs(4));
    const sliver = r.issues.find((i) => i.kind === "gap")!;
    expect(sliver.sliver).toBe(true);
  });
});

describe("fixes", () => {
  it("absorbGap merges a gap into its neighbour → valid again, same total", () => {
    const strips = fourStrips();
    const r0 = validateScenario(strips.slice(0, 3), [PROPERTY], heirs(4));
    const gap = r0.issues.find((i) => i.kind === "gap")!.geometry!;
    const fixed = absorbGap(strips.slice(0, 3), gap, "Lot");
    if (!fixed.ok) throw new Error(fixed.reason);
    expect(fixed.lots).toHaveLength(3);
    expect(kinds(fixed.lots)).toEqual([]);
    const total = fixed.lots.reduce((s, l) => s + geometryAreaM2(l.geometry), 0);
    expect(total / PROPERTY_M2).toBeCloseTo(1, 6);
  });

  it("absorbGap creates a new lot when no neighbour can take it", () => {
    const island = rect(0.4, 0.4, 0.6, 0.6);
    const r = absorbGap([], island, "Lot");
    if (!r.ok) throw new Error(r.reason);
    expect(r.lots).toHaveLength(1);
  });

  it("resolveOverlap keeps the overlap in one lot only", () => {
    const lots = [
      createLot({ label: "A", geometry: rect(0, 0, 0.6, 1), beneficiaryId: "h1" }),
      createLot({ label: "B", geometry: rect(0.5, 0, 1, 1), beneficiaryId: "h2" }),
    ];
    const r = resolveOverlap(lots, lots[0].id, lots[1].id, "Lot");
    if (!r.ok) throw new Error(r.reason);
    expect(kinds(r.lots, heirs(2))).toEqual([]);
    expect(geometryAreaM2(r.lots[1].geometry) / PROPERTY_M2).toBeCloseTo(0.4, 3);
    expect(
      resolveOverlap(
        lots.map((l) => ({ ...l, locked: true })),
        lots[0].id,
        lots[1].id,
        "Lot",
      ),
    ).toEqual({ ok: false, reason: "locked" });
  });

  it("clipLotToProperty removes the outside part", () => {
    const lots = [createLot({ label: "A", geometry: rect(0, 0, 1.2, 1), beneficiaryId: "h1" })];
    const r = clipLotToProperty(lots, lots[0].id, [PROPERTY], "Lot");
    if (!r.ok) throw new Error(r.reason);
    expect(geometryAreaM2(r.lots[0].geometry) / PROPERTY_M2).toBeCloseTo(1, 4);
  });

  it("repairLot splits a bow-tie into two valid lots without losing area", () => {
    const bowtie: Polygon = {
      type: "Polygon",
      coordinates: [[at(0, 0), at(1, 1), at(1, 0), at(0, 1), at(0, 0)]],
    };
    const lots = [createLot({ label: "X", geometry: bowtie, beneficiaryId: "h1" })];
    const r = repairLot(lots, lots[0].id, "Lot");
    if (!r.ok) throw new Error(r.reason);
    expect(r.lots).toHaveLength(2);
    const total = r.lots.reduce((s, l) => s + geometryAreaM2(l.geometry), 0);
    expect(total / PROPERTY_M2).toBeCloseTo(0.5, 3); // two triangles, each 1/4
    expect(r.lots.every((l) => l.beneficiaryId === "h1")).toBe(true);
  });
});

describe("performance", () => {
  it("validates 30 lots in well under a second", () => {
    let lots: Lot[] = [createLot({ label: "Lot 1", geometry: PROPERTY })];
    for (let i = 1; i < 30; i++) {
      const r = splitLots(lots, line(at(i / 30, -0.1), at(i / 30, 1.1)), "Lot");
      if (!r.ok) throw new Error(r.reason);
      lots = r.lots;
    }
    expect(lots).toHaveLength(30);
    const t0 = performance.now();
    const r = validateScenario(lots, [PROPERTY], []);
    const ms = performance.now() - t0;
    expect(r.issues.every((i) => i.kind === "unassigned")).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});
