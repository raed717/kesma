import type { Polygon, Position } from "../model/geojson";

/**
 * Topology helpers for lots that share boundaries.
 *
 * Lots are stored as independent polygons, but neighbouring lots share the *same*
 * vertices along common edges. Editing therefore works on vertex **keys**: moving a key
 * moves it in every lot that uses it, so boundaries stay shared (no gaps, no overlaps).
 */

export type TopoLot = { id: string; geometry: Polygon; locked?: boolean };

/** ~0.1 mm at Tunisian latitudes: tolerates float noise, never merges real vertices. */
const KEY_DECIMALS = 9;

export function coordKey([x, y]: Position): string {
  return `${x.toFixed(KEY_DECIMALS)},${y.toFixed(KEY_DECIMALS)}`;
}

export type VertexHandle = {
  key: string;
  position: Position;
  lotIds: string[];
  /** Part of a locked lot: cannot be moved without changing that lot. */
  locked: boolean;
};

export type EdgeHandle = {
  /** Unordered pair of vertex keys. */
  a: string;
  b: string;
  midpoint: Position;
  lotIds: string[];
  locked: boolean;
};

function openRing(ring: Position[]): Position[] {
  return ring.slice(0, -1); // GeoJSON rings repeat the first position at the end.
}

function closeRing(ring: Position[]): Position[] {
  return ring.length ? [...ring, ring[0]] : ring;
}

/** Unique vertices of the given lots (optionally only those touching `onlyLotIds`). */
export function collectVertices(lots: TopoLot[], onlyLotIds?: Set<string>): VertexHandle[] {
  const map = new Map<string, VertexHandle>();
  for (const lot of lots) {
    for (const ring of lot.geometry.coordinates) {
      for (const p of openRing(ring)) {
        const key = coordKey(p);
        let v = map.get(key);
        if (!v) {
          v = { key, position: [p[0], p[1]], lotIds: [], locked: false };
          map.set(key, v);
        }
        if (!v.lotIds.includes(lot.id)) v.lotIds.push(lot.id);
        if (lot.locked) v.locked = true;
      }
    }
  }
  const all = [...map.values()];
  return onlyLotIds ? all.filter((v) => v.lotIds.some((id) => onlyLotIds.has(id))) : all;
}

/** Unique edges (with midpoints) of the given lots. */
export function collectEdges(lots: TopoLot[], onlyLotIds?: Set<string>): EdgeHandle[] {
  const map = new Map<string, EdgeHandle>();
  for (const lot of lots) {
    for (const ring of lot.geometry.coordinates) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [p, q] = [ring[i], ring[i + 1]];
        const [a, b] = [coordKey(p), coordKey(q)];
        if (a === b) continue;
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        let e = map.get(id);
        if (!e) {
          e = {
            a: a < b ? a : b,
            b: a < b ? b : a,
            midpoint: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
            lotIds: [],
            locked: false,
          };
          map.set(id, e);
        }
        if (!e.lotIds.includes(lot.id)) e.lotIds.push(lot.id);
        if (lot.locked) e.locked = true;
      }
    }
  }
  const all = [...map.values()];
  return onlyLotIds ? all.filter((e) => e.lotIds.some((id) => onlyLotIds.has(id))) : all;
}

function mapRings<T extends TopoLot>(lots: T[], fn: (ring: Position[], lot: T) => Position[]): T[] {
  return lots.map((lot) => {
    let changed = false;
    const coordinates = lot.geometry.coordinates.map((ring) => {
      const next = fn(ring, lot);
      if (next !== ring) changed = true;
      return next;
    });
    return changed ? { ...lot, geometry: { type: "Polygon", coordinates } } : lot;
  });
}

/** Moves every occurrence of vertex `key` to `to`, in all unlocked lots. */
export function moveVertex<T extends TopoLot>(lots: T[], key: string, to: Position): T[] {
  return mapRings(lots, (ring, lot) => {
    if (lot.locked || !ring.some((p) => coordKey(p) === key)) return ring;
    return ring.map((p) => (coordKey(p) === key ? [to[0], to[1]] : p));
  });
}

/** Inserts `point` between vertices `a` and `b` wherever that edge exists (both lots of a shared edge). */
export function insertVertexOnEdge<T extends TopoLot>(
  lots: T[],
  a: string,
  b: string,
  point: Position,
): T[] {
  return mapRings(lots, (ring, lot) => {
    if (lot.locked) return ring;
    const open = openRing(ring);
    const out: Position[] = [];
    let changed = false;
    for (let i = 0; i < open.length; i++) {
      const p = open[i];
      const q = open[(i + 1) % open.length];
      out.push(p);
      const [kp, kq] = [coordKey(p), coordKey(q)];
      if ((kp === a && kq === b) || (kp === b && kq === a)) {
        out.push([point[0], point[1]]);
        changed = true;
      }
    }
    return changed ? closeRing(out) : ring;
  });
}

/**
 * Removes vertex `key` from every unlocked lot, unless that would leave a ring with fewer
 * than 3 distinct vertices (then that lot is left unchanged).
 */
export function removeVertex<T extends TopoLot>(lots: T[], key: string): T[] {
  return mapRings(lots, (ring, lot) => {
    if (lot.locked) return ring;
    const open = openRing(ring);
    const kept = open.filter((p) => coordKey(p) !== key);
    if (kept.length === open.length || kept.length < 3) return ring;
    return closeRing(kept);
  });
}

/**
 * Repairs T-junctions: every point that lies on an edge of another lot (but is not one
 * of its vertices) is inserted into that edge. Needed after splitting/clipping, which
 * create new vertices on boundaries shared with neighbours.
 */
export function insertPointsOnEdges<T extends TopoLot>(
  lots: T[],
  points: Position[],
  tolerance = 1e-10,
): T[] {
  if (points.length === 0) return lots;
  const unique = new Map(points.map((p) => [coordKey(p), p]));
  return mapRings(lots, (ring, lot) => {
    if (lot.locked) return ring;
    const own = new Set(ring.map(coordKey));
    const candidates = [...unique.entries()].filter(([k]) => !own.has(k));
    if (candidates.length === 0) return ring;
    const open = openRing(ring);
    const out: Position[] = [];
    let changed = false;
    for (let i = 0; i < open.length; i++) {
      const p = open[i];
      const q = open[(i + 1) % open.length];
      out.push(p);
      // Points on this edge, ordered from p to q.
      const onEdge = candidates
        .map(([, c]) => ({ c, t: projectOnSegment(c, p, q, tolerance) }))
        .filter((x): x is { c: Position; t: number } => x.t !== null)
        .sort((u, v) => u.t - v.t);
      for (const { c } of onEdge) {
        out.push([c[0], c[1]]);
        changed = true;
      }
    }
    return changed ? closeRing(out) : ring;
  });
}

/** Parameter t in (0, 1) if `c` lies on segment p→q (within tolerance), else null. */
function projectOnSegment(c: Position, p: Position, q: Position, tolerance: number): number | null {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const t = ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / len2;
  if (t <= 1e-9 || t >= 1 - 1e-9) return null;
  const px = p[0] + t * dx - c[0];
  const py = p[1] + t * dy - c[1];
  return px * px + py * py <= tolerance * tolerance ? t : null;
}

/** All vertices of the given polygons. */
export function verticesOf(polygons: Polygon[]): Position[] {
  return polygons.flatMap((p) => p.coordinates.flatMap(openRing));
}
