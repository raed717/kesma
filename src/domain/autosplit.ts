// Automatic division into parallel strips (JSTS-based: import lazily from the UI).
import { interiorPoint, intersectionPolygons, unionPolygons } from "./geometry/jsts";
import { geometryAreaM2 } from "./geometry/measure";
import type { AreaGeometry, LineString, Polygon, Position } from "./model/geojson";
import type { Lot } from "./model/project";
import { splitLots } from "./lot-operations";
import { createLot } from "./scenarios";
import { computeLotValues, type ValueModel } from "./value";

/**
 * Cuts the property into parallel strips, one per beneficiary (in the given order), whose
 * area — or estimated value — matches each beneficiary's part.
 *
 * The cut lines run along `bearingDeg` (0° = north–south lines, 90° = east–west lines).
 * Strips are swept perpendicular to the lines; each cut position is found by binary
 * search on the measured area/value on one side. Cuts use the regular topology-preserving
 * split, so neighbouring lots share their boundaries exactly.
 */

export type AutoSplitInput = {
  parcels: AreaGeometry[];
  bearingDeg: number;
  /** Ordered along the sweep; parts are relative (normalised internally). */
  parts: { beneficiaryId: string; part: number }[];
  mode: "area" | "value";
  model?: ValueModel;
  lotPrefix: string;
};

export type AutoSplitResult =
  | {
      ok: true;
      lots: Lot[];
      achieved: { beneficiaryId: string; measure: number; target: number }[];
    }
  | { ok: false; reason: "noProperty" | "noParts" | "noValueModel" };

const ITERATIONS = 60;

export function autoSplit(input: AutoSplitInput): AutoSplitResult {
  const pieces = unionPolygons(input.parcels);
  if (pieces.length === 0) return { ok: false, reason: "noProperty" };
  const parts = input.parts.filter((p) => p.part > 0);
  if (parts.length === 0) return { ok: false, reason: "noParts" };
  if (input.mode === "value" && !input.model) return { ok: false, reason: "noValueModel" };

  const frame = makeFrame(pieces, input.bearingDeg);
  const measureOf = (polys: Polygon[]): number =>
    input.mode === "area"
      ? polys.reduce((s, p) => s + geometryAreaM2(p), 0)
      : [
          ...computeLotValues(
            input.model!,
            polys.map((geometry, i) => ({ id: `m${i}`, geometry })),
          ).values(),
        ].reduce((s, v) => s + v.total, 0);
  const measureBelow = (s: number) =>
    measureOf(pieces.flatMap((p) => intersectionPolygons(p, frame.halfPlane(s))));

  const total = measureOf(pieces);
  const totalParts = parts.reduce((s, p) => s + p.part, 0);

  // Cut positions: cumulative targets along the sweep.
  const cuts: number[] = [];
  let lo = frame.min;
  let cumulative = 0;
  for (let k = 0; k < parts.length - 1; k++) {
    cumulative += parts[k].part;
    const target = (total * cumulative) / totalParts;
    let a = lo;
    let b = frame.max;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (a + b) / 2;
      if (measureBelow(mid) < target) a = mid;
      else b = mid;
    }
    const s = (a + b) / 2;
    cuts.push(s);
    lo = s;
  }

  // Apply the cuts with the regular split (shared boundaries, T-junction repair).
  let lots: Lot[] = pieces.map((geometry, i) =>
    createLot({ label: `${input.lotPrefix} ${i + 1}`, geometry }),
  );
  for (const s of cuts) {
    const r = splitLots(lots, frame.cutLine(s), input.lotPrefix);
    if (r.ok) lots = r.lots;
  }

  // Assign each lot to the strip (band between cuts) containing its interior point.
  // (A robust interior point: centroids/vertices can sit exactly on a cut line.)
  const at = new Map(lots.map((l) => [l.id, frame.project(interiorPoint(l.geometry))]));
  const bandOf = (lot: Lot) => {
    const s = at.get(lot.id)!;
    const i = cuts.findIndex((c) => s < c);
    return i === -1 ? parts.length - 1 : i;
  };
  lots = lots.map((l) => ({ ...l, beneficiaryId: parts[bandOf(l)].beneficiaryId }));

  // Stable, readable labels following the sweep order.
  lots.sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  lots = lots.map((l, i) => ({ ...l, label: `${input.lotPrefix} ${i + 1}` }));

  const achieved = parts.map((p) => ({
    beneficiaryId: p.beneficiaryId,
    measure: measureOf(
      lots.filter((l) => l.beneficiaryId === p.beneficiaryId).map((l) => l.geometry),
    ),
    target: (total * p.part) / totalParts,
  }));
  return { ok: true, lots, achieved };
}

/**
 * Local planar frame: `project` gives the position of a point along the sweep direction
 * (perpendicular to the cut lines), in metre-like units (x scaled by cos(latitude)).
 */
function makeFrame(pieces: Polygon[], bearingDeg: number) {
  const pts = pieces.flatMap((p) => p.coordinates[0]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = Math.cos((cy * Math.PI) / 180);
  const rad = (d: number) => (d * Math.PI) / 180;
  // Line direction v (along bearing) and sweep direction u (bearing + 90°), as (east, north).
  const v = [Math.sin(rad(bearingDeg)), Math.cos(rad(bearingDeg))];
  const u = [Math.sin(rad(bearingDeg + 90)), Math.cos(rad(bearingDeg + 90))];
  const project = ([x, y]: Position) => (x - cx) * k * u[0] + (y - cy) * u[1];
  const toLngLat = (a: number, t: number): Position => [
    cx + (a * u[0] + t * v[0]) / k,
    cy + a * u[1] + t * v[1],
  ];
  const projected = pts.map(project);
  const span =
    Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 4 + 1e-6;
  return {
    min: Math.min(...projected),
    max: Math.max(...projected),
    project,
    /** Everything on the "before" side of position s. */
    halfPlane: (s: number): Polygon => ({
      type: "Polygon",
      coordinates: [
        [
          toLngLat(s - span, -span),
          toLngLat(s, -span),
          toLngLat(s, span),
          toLngLat(s - span, span),
          toLngLat(s - span, -span),
        ],
      ],
    }),
    cutLine: (s: number): LineString => ({
      type: "LineString",
      coordinates: [toLngLat(s, -span), toLngLat(s, span)],
    }),
  };
}

export { longestEdgeBearing, perpendicularBearing } from "./geometry/bearing";
