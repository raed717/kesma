import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import { computeValueAllocation } from "./allocation";
import { autoSplit, longestEdgeBearing, perpendicularBearing } from "./autosplit";
import { geometryAreaM2 } from "./geometry/measure";
import { createBeneficiary, DEFAULT_SETTINGS } from "./model/factories";
import type { Polygon, Position } from "./model/geojson";
import type { Asset, Beneficiary, FrontageLine, ValueZone } from "./model/project";
import { createLot } from "./scenarios";
import { resolveShares } from "./shares";
import { validateScenario } from "./validation";
import { buildValueModel, computeLotValues, hasValueModel, propertyValue } from "./value";

const SQUARE = squarePolygon(316.23); // ≈ 10 ha
const [x0, y0] = SQUARE.coordinates[0][0];
const W = SQUARE.coordinates[0][1][0] - x0;
const H = SQUARE.coordinates[0][2][1] - y0;
const at = (fx: number, fy: number): Position => [x0 + fx * W, y0 + fy * H];
const rect = (a: number, b: number, c: number, d: number): Polygon => ({
  type: "Polygon",
  coordinates: [[at(a, b), at(c, b), at(c, d), at(a, d), at(a, b)]],
});
const AREA = geometryAreaM2(SQUARE);
const rel = (a: number, b: number) => Math.abs(a - b) / b;

const settings = (base: number | null) => ({ ...DEFAULT_SETTINGS, baseValuePerM2: base });
const zone = (
  geometry: Polygon,
  mode: "perM2" | "multiplier",
  value: number,
  id = "z",
): ValueZone => ({
  id,
  name: id,
  color: "#16a34a",
  geometry,
  mode,
  value,
});
const heirs = (n: number): Beneficiary[] =>
  Array.from({ length: n }, (_, i) =>
    createBeneficiary({ name: `H${i + 1}`, color: "#2563eb" }, { id: () => `h${i + 1}` }),
  );

describe("value model", () => {
  it("base value × area", () => {
    const m = buildValueModel(settings(10), [], [], []);
    const v = computeLotValues(m, [{ id: "a", geometry: SQUARE }]).get("a")!;
    expect(rel(v.total, AREA * 10)).toBeLessThan(1e-9);
  });

  it("zones replace the base on their area; multipliers scale the base", () => {
    const east = rect(0.5, 0, 1, 1);
    const m = buildValueModel(settings(10), [zone(east, "multiplier", 3)], [], []);
    const v = computeLotValues(m, [{ id: "a", geometry: SQUARE }]).get("a")!;
    // half at 10, half at 30 → average 20
    expect(rel(v.total, AREA * 20)).toBeLessThan(1e-3);
  });

  it("overlapping zones do not double count (first zone wins)", () => {
    const m = buildValueModel(
      settings(0),
      [zone(rect(0, 0, 0.6, 1), "perM2", 10, "z1"), zone(rect(0.4, 0, 1, 1), "perM2", 20, "z2")],
      [],
      [],
    );
    const v = computeLotValues(m, [{ id: "a", geometry: SQUARE }]).get("a")!;
    expect(rel(v.total, AREA * (0.6 * 10 + 0.4 * 20))).toBeLessThan(1e-3);
  });

  it("point assets go to exactly one lot; area assets are shared by area", () => {
    const well: Asset = {
      id: "well",
      name: "Well",
      kind: "well",
      value: 15_000,
      geometry: { type: "Point", coordinates: at(0.5, 0.5) },
    };
    const grove: Asset = {
      id: "grove",
      name: "Olives",
      kind: "trees",
      value: 40_000,
      geometry: rect(0.25, 0, 0.75, 1),
    };
    const m = buildValueModel(settings(0), [], [well, grove], []);
    const lots = [
      { id: "w", geometry: rect(0, 0, 0.5, 1) },
      { id: "e", geometry: rect(0.5, 0, 1, 1) },
    ];
    const v = computeLotValues(m, lots);
    // The well sits on the shared edge: counted once only.
    const wellCount = [...v.values()].filter((x) => x.assetIds.includes("well")).length;
    expect(wellCount).toBe(1);
    const total = v.get("w")!.total + v.get("e")!.total;
    expect(total).toBeCloseTo(55_000, 0);
    expect(
      v.get("w")!.assetValue - (v.get("w")!.assetIds.includes("well") ? 15_000 : 0),
    ).toBeCloseTo(20_000, 0);
  });

  it("measures road frontage per lot", () => {
    const road: FrontageLine = {
      id: "r",
      name: "Road",
      geometry: { type: "LineString", coordinates: [at(-0.1, 0), at(0.5, 0)] },
    };
    const m = buildValueModel(settings(1), [], [], [road]);
    const v = computeLotValues(m, [
      { id: "w", geometry: rect(0, 0, 0.5, 1) },
      { id: "e", geometry: rect(0.5, 0, 1, 1) },
    ]);
    expect(v.get("w")!.frontageM).toBeGreaterThan(155);
    expect(v.get("w")!.roadAccess).toBe(true);
    expect(v.get("e")!.roadAccess).toBe(false);
  });

  it("property value equals the sum over a full division", () => {
    const m = buildValueModel(settings(10), [zone(rect(0.5, 0, 1, 1), "perM2", 25)], [], []);
    const whole = propertyValue(m, [SQUARE]);
    const v = computeLotValues(m, [
      { id: "a", geometry: rect(0, 0, 0.3, 1) },
      { id: "b", geometry: rect(0.3, 0, 1, 1) },
    ]);
    expect(rel(v.get("a")!.total + v.get("b")!.total, whole)).toBeLessThan(1e-6);
  });

  it("knows when there is no value information", () => {
    expect(hasValueModel(settings(null), [], [])).toBe(false);
    expect(hasValueModel(settings(5), [], [])).toBe(true);
  });
});

describe("autoSplit", () => {
  const parts = (...ps: number[]) => ps.map((part, i) => ({ beneficiaryId: `h${i + 1}`, part }));

  it("4 equal strips by area within ±0.1 %, assigned west → east", () => {
    const r = autoSplit({
      parcels: [SQUARE],
      bearingDeg: 0,
      parts: parts(1, 1, 1, 1),
      mode: "area",
      lotPrefix: "Lot",
    });
    if (!r.ok) throw new Error(r.reason);
    for (const a of r.achieved) expect(rel(a.measure, AREA / 4)).toBeLessThan(1e-3);
    const westmost = [...r.lots].sort(
      (a, b) => a.geometry.coordinates[0][0][0] - b.geometry.coordinates[0][0][0],
    )[0];
    expect(westmost.beneficiaryId).toBe("h1");
    expect(validateScenario(r.lots, [SQUARE], heirs(4)).status).toBe("valid");
  });

  it("25/25/30/20 at 45° stays accurate and topologically clean", () => {
    const r = autoSplit({
      parcels: [SQUARE],
      bearingDeg: 45,
      parts: parts(25, 25, 30, 20),
      mode: "area",
      lotPrefix: "Lot",
    });
    if (!r.ok) throw new Error(r.reason);
    const expected = [0.25, 0.25, 0.3, 0.2];
    r.achieved.forEach((a, i) => expect(rel(a.measure, AREA * expected[i])).toBeLessThan(1e-3));
    const issues = validateScenario(r.lots, [SQUARE], heirs(4)).issues;
    expect(issues.filter((i) => i.kind === "gap" || i.kind === "overlap")).toEqual([]);
  });

  it("value mode: equal values give a smaller strip on the valuable side (≤ 1 %)", () => {
    const model = buildValueModel(
      settings(10),
      [zone(rect(0.5, 0, 1, 1), "multiplier", 3)],
      [],
      [],
    );
    const r = autoSplit({
      parcels: [SQUARE],
      bearingDeg: 0,
      parts: parts(1, 1),
      mode: "value",
      model,
      lotPrefix: "Lot",
    });
    if (!r.ok) throw new Error(r.reason);
    for (const a of r.achieved) expect(rel(a.measure, a.target)).toBeLessThan(0.01);
    const area = (id: string) =>
      r.lots
        .filter((l) => l.beneficiaryId === id)
        .reduce((s, l) => s + geometryAreaM2(l.geometry), 0);
    expect(area("h1")).toBeGreaterThan(area("h2")); // west (cheap) side is larger
    // Value allocation agrees.
    const hs = heirs(2);
    const values = computeLotValues(model, r.lots);
    const va = computeValueAllocation(
      r.lots,
      hs,
      resolveShares(hs, AREA),
      values,
      propertyValue(model, [SQUARE]),
      1,
    );
    expect(va.rows.every((row) => row.status === "ok")).toBe(true);
  });

  it("works on a concave (L-shaped) property", () => {
    const L: Polygon = {
      type: "Polygon",
      coordinates: [[at(0, 0), at(1, 0), at(1, 0.5), at(0.5, 0.5), at(0.5, 1), at(0, 1), at(0, 0)]],
    };
    const r = autoSplit({
      parcels: [L],
      bearingDeg: 90,
      parts: parts(1, 1, 1),
      mode: "area",
      lotPrefix: "Lot",
    });
    if (!r.ok) throw new Error(r.reason);
    const Larea = geometryAreaM2(L);
    for (const a of r.achieved) expect(rel(a.measure, Larea / 3)).toBeLessThan(1e-3);
  });

  it("rejects bad input", () => {
    expect(
      autoSplit({ parcels: [], bearingDeg: 0, parts: parts(1), mode: "area", lotPrefix: "Lot" }),
    ).toEqual({ ok: false, reason: "noProperty" });
    expect(
      autoSplit({
        parcels: [SQUARE],
        bearingDeg: 0,
        parts: parts(0),
        mode: "area",
        lotPrefix: "Lot",
      }),
    ).toEqual({ ok: false, reason: "noParts" });
    expect(
      autoSplit({
        parcels: [SQUARE],
        bearingDeg: 0,
        parts: parts(1),
        mode: "value",
        lotPrefix: "Lot",
      }),
    ).toEqual({ ok: false, reason: "noValueModel" });
  });

  it("helper bearings", () => {
    expect(longestEdgeBearing([rect(0, 0, 1, 0.2)])).toBeCloseTo(90, 0); // long edges run east–west
    expect(perpendicularBearing([at(0, 0), at(1, 0)])).toBeCloseTo(0, 0); // road E–W → cuts N–S
    void createLot;
  });
});
