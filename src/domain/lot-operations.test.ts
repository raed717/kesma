import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import { geometryAreaM2 } from "./geometry/measure";
import {
  collectEdges,
  collectVertices,
  coordKey,
  insertVertexOnEdge,
  moveVertex,
  removeVertex,
} from "./geometry/topology";
import type { LineString, Polygon, Position } from "./model/geojson";
import type { Lot } from "./model/project";
import { addDrawnLot, mergeLots, splitLots } from "./lot-operations";
import {
  createLot,
  duplicateScenario,
  createScenario,
  lotsFromParcels,
  nextLotLabel,
} from "./scenarios";

// ~316 m square ≈ 10 ha near Tunis.
const PROPERTY = squarePolygon(316.23);
const [[x0, y0], [x1], [, y1]] = [
  PROPERTY.coordinates[0][0],
  PROPERTY.coordinates[0][1],
  PROPERTY.coordinates[0][2],
];
const W = x1 - x0;
const H = y1 - y0;
const at = (fx: number, fy: number): Position => [x0 + fx * W, y0 + fy * H];
const line = (...pts: Position[]): LineString => ({ type: "LineString", coordinates: pts });

const total = (lots: Lot[]) => lots.reduce((s, l) => s + geometryAreaM2(l.geometry), 0);
const PROPERTY_M2 = geometryAreaM2(PROPERTY);
const relErr = (a: number, b: number) => Math.abs(a - b) / b;

function baseLots(): Lot[] {
  return [createLot({ label: "Lot 1", geometry: PROPERTY })];
}

/** 10 ha → 4 lots: vertical cut, then a horizontal cut across both halves. */
function fourLots(): Lot[] {
  const a = splitLots(baseLots(), line(at(0.5, -0.1), at(0.5, 1.1)), "Lot");
  if (!a.ok) throw new Error(a.reason);
  const b = splitLots(a.lots, line(at(-0.1, 0.4), at(1.1, 0.4)), "Lot");
  if (!b.ok) throw new Error(b.reason);
  return b.lots;
}

describe("splitLots", () => {
  it("splits 10 ha into 4 lots whose areas sum to 10 ha (±0.01%)", () => {
    const lots = fourLots();
    expect(lots).toHaveLength(4);
    expect(relErr(total(lots), PROPERTY_M2)).toBeLessThan(1e-4);
    expect(new Set(lots.map((l) => l.label)).size).toBe(4);
  });

  it("keeps boundaries shared: the centre vertex belongs to all 4 lots", () => {
    const lots = fourLots();
    const centre = collectVertices(lots).find((v) => v.lotIds.length === 4);
    expect(centre).toBeDefined();
    expect(centre!.position[0]).toBeCloseTo(at(0.5, 0.4)[0], 9);
  });

  it("repairs T-junctions in neighbours (a later cut through one lot only)", () => {
    const halves = splitLots(baseLots(), line(at(0.5, -0.1), at(0.5, 1.1)), "Lot");
    if (!halves.ok) throw new Error();
    // Cut only the left half horizontally, ending exactly on the shared middle edge.
    const r = splitLots(halves.lots, line(at(-0.1, 0.3), at(0.5, 0.3)), "Lot");
    if (!r.ok) throw new Error(r.reason);
    const junction = collectVertices(r.lots).find(
      (v) =>
        Math.abs(v.position[0] - at(0.5, 0.3)[0]) < 1e-9 &&
        Math.abs(v.position[1] - at(0.5, 0.3)[1]) < 1e-9,
    );
    // The right half (untouched by the cut) now also has the junction vertex.
    expect(junction?.lotIds).toHaveLength(3);
  });

  it("returns noCut when the line does not cross a lot", () => {
    expect(splitLots(baseLots(), line(at(1.2, 0), at(1.3, 1)), "Lot")).toEqual({
      ok: false,
      reason: "noCut",
    });
    expect(splitLots(baseLots(), line(at(0.2, 0.2), at(0.8, 0.8)), "Lot")).toEqual({
      ok: false,
      reason: "noCut",
    });
  });

  it("never cuts locked lots", () => {
    const locked = baseLots().map((l) => ({ ...l, locked: true }));
    expect(splitLots(locked, line(at(0.5, -0.1), at(0.5, 1.1)), "Lot")).toEqual({
      ok: false,
      reason: "locked",
    });
  });
});

describe("moving shared vertices (the 'move the boundary' workflow)", () => {
  it("moving the centre vertex changes each lot but keeps the total area constant", () => {
    const lots = fourLots();
    const centre = collectVertices(lots).find((v) => v.lotIds.length === 4)!;
    const moved = moveVertex(lots, centre.key, at(0.6, 0.5));
    expect(relErr(total(moved), total(lots))).toBeLessThan(1e-9); // no gap, no overlap
    const before = lots.map((l) => geometryAreaM2(l.geometry));
    const after = moved.map((l) => geometryAreaM2(l.geometry));
    expect(after.some((a, i) => Math.abs(a - before[i]) > 100)).toBe(true);
  });

  it("does not move vertices of locked lots", () => {
    const lots = fourLots();
    const centre = collectVertices(lots).find((v) => v.lotIds.length === 4)!;
    const withLock = lots.map((l, i) => (i === 0 ? { ...l, locked: true } : l));
    const moved = moveVertex(withLock, centre.key, at(0.6, 0.5));
    expect(moved[0]).toBe(withLock[0]);
    expect(collectVertices(withLock).find((v) => v.key === centre.key)?.locked).toBe(true);
  });

  it("inserting a vertex on a shared edge adds it to both lots, keeping the total", () => {
    const halves = splitLots(baseLots(), line(at(0.5, -0.1), at(0.5, 1.1)), "Lot");
    if (!halves.ok) throw new Error();
    const shared = collectEdges(halves.lots).find((e) => e.lotIds.length === 2)!;
    const withVertex = insertVertexOnEdge(halves.lots, shared.a, shared.b, shared.midpoint);
    const bent = moveVertex(withVertex, coordKey(shared.midpoint), at(0.7, 0.5));
    expect(relErr(total(bent), PROPERTY_M2)).toBeLessThan(1e-9);
    expect(
      collectVertices(bent).find((v) => v.key === coordKey(at(0.7, 0.5)))?.lotIds,
    ).toHaveLength(2);
  });

  it("removing a vertex never degenerates a ring", () => {
    const tri: Polygon = {
      type: "Polygon",
      coordinates: [[at(0, 0), at(1, 0), at(0, 1), at(0, 0)]],
    };
    const lots = [createLot({ label: "T", geometry: tri })];
    expect(removeVertex(lots, coordKey(at(1, 0)))[0]).toBe(lots[0]);
  });
});

describe("mergeLots", () => {
  it("merging the 4 lots back gives the whole property", () => {
    const lots = fourLots();
    const r = mergeLots(
      lots,
      lots.map((l) => l.id),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0].id).toBe(lots[0].id);
    expect(relErr(total(r.lots), PROPERTY_M2)).toBeLessThan(1e-9);
  });

  it("refuses non-adjacent lots and locked lots", () => {
    const lots = fourLots();
    // Find two diagonal lots (share only the centre point).
    const byCentroid = (l: Lot) => {
      const ring = l.geometry.coordinates[0];
      return [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ];
    };
    const sw = lots.find(
      (l) => byCentroid(l)[0] < at(0.5, 0)[0] && byCentroid(l)[1] < at(0, 0.4)[1],
    )!;
    const ne = lots.find(
      (l) => byCentroid(l)[0] > at(0.5, 0)[0] && byCentroid(l)[1] > at(0, 0.4)[1],
    )!;
    expect(mergeLots(lots, [sw.id, ne.id])).toEqual({ ok: false, reason: "notAdjacent" });
    const locked = lots.map((l) => (l.id === sw.id ? { ...l, locked: true } : l));
    expect(
      mergeLots(
        locked,
        lots.map((l) => l.id),
      ),
    ).toEqual({ ok: false, reason: "locked" });
    expect(mergeLots(lots, [sw.id])).toEqual({ ok: false, reason: "tooFew" });
  });
});

describe("addDrawnLot", () => {
  it("clips to the property and to free space, and shares boundaries with neighbours", () => {
    const halves = splitLots(baseLots(), line(at(0.5, -0.1), at(0.5, 1.1)), "Lot");
    if (!halves.ok) throw new Error();
    // Keep only the left half; draw a lot overlapping it and spilling outside the property.
    const left = [
      halves.lots.find(
        (l) =>
          geometryAreaM2(l.geometry) > 0 &&
          l.geometry.coordinates[0].every((p) => p[0] <= at(0.5, 0)[0] + 1e-12),
      )!,
    ];
    const drawn: Polygon = {
      type: "Polygon",
      coordinates: [[at(0.3, 0.2), at(1.3, 0.2), at(1.3, 0.6), at(0.3, 0.6), at(0.3, 0.2)]],
    };
    const r = addDrawnLot(left, drawn, [PROPERTY], "Lot");
    if (!r.ok) throw new Error(r.reason);
    expect(r.lots).toHaveLength(2);
    const added = r.lots.find((l) => l.id === r.affectedIds[0])!;
    // Only the part inside the property and outside the left half: 0.5 W × 0.4 H.
    expect(relErr(geometryAreaM2(added.geometry), PROPERTY_M2 * 0.5 * 0.4)).toBeLessThan(1e-3);
    // No overlap with the existing lot.
    expect(relErr(total(r.lots), PROPERTY_M2 * 0.5 + PROPERTY_M2 * 0.2)).toBeLessThan(1e-3);
    // The new lot's corners on the shared edge were inserted into the left lot (T-junction repair).
    const shared = collectVertices(r.lots).filter((v) => v.lotIds.length === 2);
    expect(shared.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty when drawn fully outside the property", () => {
    const outside: Polygon = {
      type: "Polygon",
      coordinates: [[at(2, 2), at(3, 2), at(3, 3), at(2, 2)]],
    };
    expect(addDrawnLot([], outside, [PROPERTY], "Lot")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("scenario factories", () => {
  it("creates lots from parcels (exploding multipolygons) and duplicates with new ids", () => {
    const parcels = [
      {
        id: "p",
        label: "P",
        attributes: {},
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [PROPERTY.coordinates, squarePolygon(50, [10.3, 36.9]).coordinates],
        },
      },
    ];
    const lots = lotsFromParcels(parcels, "Lot");
    expect(lots.map((l) => l.label)).toEqual(["Lot 1", "Lot 2"]);
    const s = createScenario({ name: " Scénario 1 ", lots });
    expect(s.name).toBe("Scénario 1");
    const copy = duplicateScenario(s, "Copie");
    expect(copy.id).not.toBe(s.id);
    expect(copy.lots.map((l) => l.id)).not.toEqual(s.lots.map((l) => l.id));
    expect(copy.lots.map((l) => l.geometry)).toEqual(s.lots.map((l) => l.geometry));
    expect(nextLotLabel(lots, "Lot")).toBe("Lot 3");
  });
});
