import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import { clampToAreas, isInsideAreas, nearestOnBoundary } from "./geometry/containment";
import { collectVertices, coordKey, moveVertex } from "./geometry/topology";
import type { LineString, Polygon, Position } from "./model/geojson";
import type { Lot } from "./model/project";
import { exitsProperty, outsideAreaM2, splitLots } from "./lot-operations";
import { createLot } from "./scenarios";

const SQUARE = squarePolygon(316.23);
const [x0, y0] = SQUARE.coordinates[0][0];
const W = SQUARE.coordinates[0][1][0] - x0;
const H = SQUARE.coordinates[0][2][1] - y0;
const at = (fx: number, fy: number): Position => [x0 + fx * W, y0 + fy * H];
const poly = (...pts: Position[]): Polygon => ({
  type: "Polygon",
  coordinates: [[...pts, pts[0]]],
});
const line = (...pts: Position[]): LineString => ({ type: "LineString", coordinates: pts });

/** L-shaped property: the square minus its top-right quarter. */
const L_SHAPE = poly(at(0, 0), at(1, 0), at(1, 0.5), at(0.5, 0.5), at(0.5, 1), at(0, 1));

describe("containment", () => {
  it("detects inside / outside / boundary points", () => {
    expect(isInsideAreas(at(0.25, 0.25), [L_SHAPE])).toBe(true);
    expect(isInsideAreas(at(0.75, 0.75), [L_SHAPE])).toBe(false); // the notch
    expect(isInsideAreas(at(1.2, 0.2), [L_SHAPE])).toBe(false);
    expect(isInsideAreas(at(0, 0.3), [L_SHAPE])).toBe(true); // on the boundary
  });

  it("clamps outside points onto the nearest boundary point", () => {
    const p = clampToAreas(at(1.3, 0.2), [SQUARE]);
    expect(p[0]).toBeCloseTo(at(1, 0)[0], 12);
    expect(p[1]).toBeCloseTo(at(0, 0.2)[1], 12);
    // Inside points are untouched.
    expect(clampToAreas(at(0.3, 0.3), [SQUARE])).toEqual(at(0.3, 0.3));
    // Outside a corner → the corner itself.
    expect(clampToAreas(at(1.5, 1.5), [SQUARE])).toEqual(at(1, 1));
    // A point in the notch goes to the nearest notch edge.
    const q = clampToAreas(at(0.6, 0.9), [L_SHAPE]);
    expect(q[0]).toBeCloseTo(at(0.5, 0)[0], 12);
    expect(nearestOnBoundary(at(0.6, 0.9), [])).toBeNull();
  });

  it("does nothing without a property", () => {
    expect(clampToAreas(at(5, 5), [])).toEqual(at(5, 5));
  });
});

describe("exitsProperty", () => {
  function halves(property: Polygon): Lot[] {
    const r = splitLots(
      [createLot({ label: "Lot 1", geometry: property })],
      line(at(0.3, -0.1), at(0.3, 1.1)),
      "Lot",
    );
    if (!r.ok) throw new Error(r.reason);
    return r.lots;
  }

  it("rejects moving a boundary corner outside, accepts moving it along/inside", () => {
    const lots = halves(SQUARE);
    // The shared corner on the bottom edge (x = 0.3, y = 0).
    const corner = collectVertices(lots).find(
      (v) => v.lotIds.length === 2 && Math.abs(v.position[1] - y0) < 1e-12,
    )!;
    const out = moveVertex(lots, corner.key, at(0.3, -0.2));
    expect(exitsProperty(lots, out, [SQUARE])).toBe(true);
    const along = moveVertex(lots, corner.key, at(0.5, 0));
    expect(exitsProperty(lots, along, [SQUARE])).toBe(false);
    const inside = moveVertex(lots, corner.key, at(0.3, 0.1));
    expect(exitsProperty(lots, inside, [SQUARE])).toBe(false);
  });

  it("catches edges crossing a concave notch even when the corner stays inside", () => {
    // Triangle inside the L; moving its corner (0.9, 0.2) up to (0.9, 0.45) keeps that
    // corner inside, but the edge to (0.2, 0.9) then cuts across the notch.
    const tri = createLot({ label: "T", geometry: poly(at(0.1, 0.1), at(0.9, 0.2), at(0.2, 0.9)) });
    const baseline = outsideAreaM2(tri.geometry, [L_SHAPE]);
    const moved = moveVertex([tri], coordKey(at(0.9, 0.2)), at(0.9, 0.45));
    expect(isInsideAreas(at(0.9, 0.45), [L_SHAPE])).toBe(true); // the corner itself is inside…
    expect(outsideAreaM2(moved[0].geometry, [L_SHAPE])).toBeGreaterThan(baseline); // …but the edge exits
    expect(exitsProperty([tri], moved, [L_SHAPE])).toBe(true);
  });

  it("lets a lot that is already partly outside move back in", () => {
    const outside = createLot({
      label: "O",
      geometry: poly(at(0.5, 0.2), at(1.2, 0.2), at(1.2, 0.4), at(0.5, 0.4)),
    });
    const back = moveVertex([outside], coordKey(at(1.2, 0.2)), at(1.1, 0.2));
    expect(exitsProperty([outside], back, [SQUARE])).toBe(false);
    const further = moveVertex([outside], coordKey(at(1.2, 0.2)), at(1.4, 0.2));
    expect(exitsProperty([outside], further, [SQUARE])).toBe(true);
  });

  it("ignores unchanged lots and works without a property", () => {
    const lots = halves(SQUARE);
    expect(exitsProperty(lots, lots, [SQUARE])).toBe(false);
    const any = moveVertex(lots, collectVertices(lots)[0].key, at(5, 5));
    expect(exitsProperty(lots, any, [])).toBe(false);
  });
});
