// Lot editing operations built on JSTS. Kept separate so the UI can import them lazily.
import { feature, length as turfLength } from "@turf/turf";
import {
  differencePolygons,
  fitNewLot,
  intersectionWithAreas,
  mergePolygons,
  repairPolygon,
  sharedBoundary,
  splitPolygonByLine,
} from "./geometry/jsts";
import { geometryAreaM2 } from "./geometry/measure";
import { insertPointsOnEdges, verticesOf } from "./geometry/topology";
import type { AreaGeometry, LineString, Polygon } from "./model/geojson";
import type { Lot, Scenario } from "./model/project";
import { createLot, nextLotLabel } from "./scenarios";

export type LotOpResult =
  | { ok: true; lots: Lot[]; affectedIds: string[] }
  | { ok: false; reason: "noCut" | "notAdjacent" | "locked" | "empty" | "tooFew" | "notFound" };

/**
 * Cuts every unlocked lot crossed by `line`. The first piece keeps the lot's id, label
 * and assignment; other pieces become new lots. New boundary points are inserted into
 * neighbouring lots so shared edges stay shared.
 */
export function splitLots(lots: Lot[], line: LineString, lotPrefix: string): LotOpResult {
  const out: Lot[] = [];
  const created: Lot[] = [];
  const affectedIds: string[] = [];
  let lockedHit = false;

  for (const lot of lots) {
    const pieces = splitPolygonByLine(lot.geometry, line);
    if (!pieces) {
      out.push(lot);
      continue;
    }
    if (lot.locked) {
      lockedHit = true;
      out.push(lot);
      continue;
    }
    // Largest piece keeps the identity: least surprising for the user.
    pieces.sort((a, b) => ringArea(b) - ringArea(a));
    out.push({ ...lot, geometry: pieces[0] });
    affectedIds.push(lot.id);
    for (const geometry of pieces.slice(1)) {
      const newLot = createLot({
        label: nextLotLabel([...lots, ...created], lotPrefix),
        geometry,
        beneficiaryId: null,
      });
      created.push(newLot);
      affectedIds.push(newLot.id);
    }
  }

  if (affectedIds.length === 0) return { ok: false, reason: lockedHit ? "locked" : "noCut" };
  const all = [...out, ...created];
  const changedGeometries = all.filter((l) => affectedIds.includes(l.id)).map((l) => l.geometry);
  return { ok: true, lots: insertPointsOnEdges(all, verticesOf(changedGeometries)), affectedIds };
}

/** Merges the given adjacent lots into the first one (keeps its id, label and assignment). */
export function mergeLots(lots: Lot[], ids: string[]): LotOpResult {
  const selected = ids.map((id) => lots.find((l) => l.id === id)).filter((l): l is Lot => !!l);
  if (selected.length < 2) return { ok: false, reason: "tooFew" };
  if (selected.some((l) => l.locked)) return { ok: false, reason: "locked" };
  const merged = mergePolygons(selected.map((l) => l.geometry));
  if (!merged) return { ok: false, reason: "notAdjacent" };
  const [keep, ...removed] = selected;
  const removedIds = new Set(removed.map((l) => l.id));
  const next = lots
    .filter((l) => !removedIds.has(l.id))
    .map((l) => (l.id === keep.id ? { ...l, geometry: merged } : l));
  return { ok: true, lots: next, affectedIds: [keep.id] };
}

/**
 * Adds a drawn polygon as new lot(s): clipped to the property and to the free space
 * between existing lots, with shared boundaries repaired.
 */
export function addDrawnLot(
  lots: Lot[],
  drawn: Polygon,
  property: AreaGeometry[],
  lotPrefix: string,
): LotOpResult {
  const pieces = fitNewLot(
    drawn,
    property,
    lots.map((l) => l.geometry),
  );
  if (pieces.length === 0) return { ok: false, reason: "empty" };
  const created = pieces.map((geometry, i) =>
    createLot({ label: nextLotLabel(lots, lotPrefix, i), geometry }),
  );
  const all = [...lots, ...created];
  return {
    ok: true,
    lots: insertPointsOnEdges(all, verticesOf(pieces)),
    affectedIds: created.map((l) => l.id),
  };
}

function ringArea(p: Polygon): number {
  const ring = p.coordinates[0];
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++)
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(s) / 2;
}

// ---------- validation fixes ----------

/** Replaces one lot by pieces: the largest keeps its identity, others become new lots. */
function replaceLot(lots: Lot[], lotId: string, pieces: Polygon[], lotPrefix: string): LotOpResult {
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { ok: false, reason: "notFound" };
  if (lot.locked) return { ok: false, reason: "locked" };
  if (pieces.length === 0) return { ok: false, reason: "empty" };
  const sorted = [...pieces].sort((a, b) => geometryAreaM2(b) - geometryAreaM2(a));
  const extra = sorted.slice(1).map((geometry, i) =>
    createLot({
      label: nextLotLabel(lots, lotPrefix, i),
      geometry,
      beneficiaryId: lot.beneficiaryId,
    }),
  );
  const next = [...lots.map((l) => (l.id === lotId ? { ...l, geometry: sorted[0] } : l)), ...extra];
  return {
    ok: true,
    lots: insertPointsOnEdges(next, verticesOf(sorted)),
    affectedIds: [lotId, ...extra.map((l) => l.id)],
  };
}

function sharedLengthM(a: Polygon, b: Polygon): number {
  const shared = sharedBoundary(a, b);
  if (
    !shared ||
    (shared.type !== "LineString" &&
      shared.type !== "MultiLineString" &&
      shared.type !== "GeometryCollection")
  ) {
    return 0;
  }
  const lines: GeoJSON.Geometry[] =
    shared.type === "GeometryCollection" ? shared.geometries : [shared];
  return lines
    .filter(
      (g): g is GeoJSON.LineString | GeoJSON.MultiLineString =>
        g.type === "LineString" || g.type === "MultiLineString",
    )
    .reduce((s, g) => s + turfLength(feature(g), { units: "kilometers" }) * 1000, 0);
}

/**
 * Fills a gap: merged into the unlocked neighbour sharing the longest boundary with it,
 * or turned into a new (unassigned) lot when no neighbour can take it.
 */
export function absorbGap(lots: Lot[], gap: Polygon, lotPrefix: string): LotOpResult {
  const candidates = lots
    .filter((l) => !l.locked)
    .map((l) => ({ lot: l, shared: sharedLengthM(l.geometry, gap) }))
    .filter((c) => c.shared > 0.01)
    .sort((a, b) => b.shared - a.shared);
  for (const { lot } of candidates) {
    const merged = mergePolygons([lot.geometry, gap]);
    if (merged) return replaceLot(lots, lot.id, [merged], lotPrefix);
  }
  const created = createLot({ label: nextLotLabel(lots, lotPrefix), geometry: gap });
  const all = [...lots, created];
  return { ok: true, lots: insertPointsOnEdges(all, verticesOf([gap])), affectedIds: [created.id] };
}

/** Resolves an overlap in favour of `keepId`: the overlapping part is removed from `loseId`. */
export function resolveOverlap(
  lots: Lot[],
  keepId: string,
  loseId: string,
  lotPrefix: string,
): LotOpResult {
  const keep = lots.find((l) => l.id === keepId);
  const lose = lots.find((l) => l.id === loseId);
  if (!keep || !lose) return { ok: false, reason: "notFound" };
  return replaceLot(lots, loseId, differencePolygons([lose.geometry], [keep.geometry]), lotPrefix);
}

/** Cuts off the parts of a lot that lie outside the property. */
export function clipLotToProperty(
  lots: Lot[],
  lotId: string,
  property: AreaGeometry[],
  lotPrefix: string,
): LotOpResult {
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { ok: false, reason: "notFound" };
  const outside = differencePolygons([lot.geometry], property);
  const inside = outside.length ? differencePolygons([lot.geometry], outside) : [lot.geometry];
  return replaceLot(lots, lotId, inside, lotPrefix);
}

/** Repairs a self-intersecting lot into valid pieces (no area is dropped). */
export function repairLot(lots: Lot[], lotId: string, lotPrefix: string): LotOpResult {
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { ok: false, reason: "notFound" };
  return replaceLot(lots, lotId, repairPolygon(lot.geometry), lotPrefix);
}

// ---------- keeping lots inside the property ----------

/** Area of a lot lying outside the property, in m². */
export function outsideAreaM2(geometry: Polygon, property: AreaGeometry[]): number {
  if (property.length === 0) return 0;
  return differencePolygons([geometry], property).reduce((s, p) => s + geometryAreaM2(p), 0);
}

/** Growth below this (m²) is float noise from points clamped onto the boundary. */
const EXIT_TOLERANCE_M2 = 0.01;

/**
 * True if an edit makes any changed lot extend further outside the property than before.
 * Only lots whose geometry object changed are checked (edits keep untouched lots by
 * reference). Comparing with the "before" state lets a lot that is already partly outside
 * be moved back in. `cache` memoises the "before" areas during a drag.
 */
export function exitsProperty(
  before: Lot[],
  after: Lot[],
  property: AreaGeometry[],
  cache?: Map<string, number>,
): boolean {
  if (property.length === 0) return false;
  const previous = new Map(before.map((l) => [l.id, l]));
  for (const lot of after) {
    const old = previous.get(lot.id);
    if (old && old.geometry === lot.geometry) continue;
    let baseline = 0;
    if (old) {
      baseline = cache?.get(lot.id) ?? outsideAreaM2(old.geometry, property);
      cache?.set(lot.id, baseline);
    }
    if (outsideAreaM2(lot.geometry, property) > baseline + EXIT_TOLERANCE_M2) return true;
  }
  return false;
}

// ---------- keeping scenarios in sync with the property ----------

/** Below this (m²), a difference between a lot and its clipped version is float noise. */
const CLIP_NOISE_M2 = 0.01;
/** Clipped leftovers smaller than this (m²) are slivers, not lots. */
const CLIP_MIN_PIECE_M2 = 1;
/** A lot keeping less than this share of its area is considered gone, not trimmed. */
const CLIP_MIN_KEPT_RATIO = 0.01;

/**
 * Clips lots to the property. Lots fully inside are returned untouched (same objects, so
 * shared vertices stay exact); lots partly outside are trimmed (the largest piece keeps the
 * lot's id, label and assignment); lots fully outside — or keeping under 1 % of their area,
 * e.g. a sliver where parcels overlapped — are dropped, as are leftover pieces under 1 m².
 */
export function clipLotsToProperty(
  lots: Lot[],
  property: AreaGeometry[],
  lotPrefix: string,
): { lots: Lot[]; changed: boolean } {
  if (property.length === 0) return { lots: [], changed: lots.length > 0 };
  const out: Lot[] = [];
  const newPieces: Polygon[] = [];
  let changed = false;
  for (const lot of lots) {
    const pieces = intersectionWithAreas(lot.geometry, property)
      .map((geometry) => ({ geometry, area: geometryAreaM2(geometry) }))
      .filter((p) => p.area > CLIP_NOISE_M2)
      .sort((a, b) => b.area - a.area);
    const original = geometryAreaM2(lot.geometry);
    const kept = pieces.reduce((s, p) => s + p.area, 0);
    if (pieces.length === 1 && Math.abs(kept - original) <= CLIP_NOISE_M2) {
      out.push(lot); // fully inside
      continue;
    }
    changed = true;
    if (kept < original * CLIP_MIN_KEPT_RATIO) continue; // (almost) fully outside: dropped
    const big = pieces.filter((p) => p.area >= CLIP_MIN_PIECE_M2);
    if (big.length === 0) continue;
    pieces.splice(0, pieces.length, ...big);
    out.push({ ...lot, geometry: pieces[0].geometry });
    newPieces.push(...pieces.map((p) => p.geometry));
    for (const p of pieces.slice(1)) {
      out.push(
        createLot({
          label: nextLotLabel([...lots, ...out], lotPrefix),
          geometry: p.geometry,
          beneficiaryId: lot.beneficiaryId,
        }),
      );
    }
  }
  return { lots: changed ? insertPointsOnEdges(out, verticesOf(newPieces)) : lots, changed };
}

/**
 * Brings scenarios in line with a changed property (e.g. a deleted parcel): every
 * scenario and saved version is clipped to the new property; scenarios left without lots
 * are removed, and all scenarios go when the property is empty.
 */
export function adaptScenariosToProperty(
  scenarios: Scenario[],
  property: AreaGeometry[],
  lotPrefix: string,
): { scenarios: Scenario[]; removed: number; changed: number } {
  if (property.length === 0) return { scenarios: [], removed: scenarios.length, changed: 0 };
  const now = new Date().toISOString();
  let removed = 0;
  let changed = 0;
  const next: Scenario[] = [];
  for (const s of scenarios) {
    const clipped = clipLotsToProperty(s.lots, property, lotPrefix);
    if (s.lots.length > 0 && clipped.lots.length === 0) {
      removed++;
      continue;
    }
    let versionsChanged = false;
    const versions = s.versions
      .map((v) => {
        const r = clipLotsToProperty(v.lots, property, lotPrefix);
        if (r.changed) versionsChanged = true;
        return r.changed ? { ...v, lots: r.lots } : v;
      })
      .filter((v) => v.lots.length > 0);
    if (clipped.changed || versionsChanged || versions.length !== s.versions.length) {
      changed++;
      next.push({ ...s, lots: clipped.lots, versions, updatedAt: now });
    } else {
      next.push(s);
    }
  }
  return { scenarios: next, removed, changed };
}
