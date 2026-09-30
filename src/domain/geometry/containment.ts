import type { AreaGeometry, Position } from "../model/geojson";

/**
 * Keeping edited lots inside the property.
 *
 * Planar lon/lat maths (x scaled by cos(latitude)) on purpose: it matches how edges are
 * drawn and how JSTS computes, so a point clamped here is exactly on the boundary JSTS sees.
 */

function polygonsOf(g: AreaGeometry): Position[][][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

/** Even-odd ray casting: true if `p` is inside the ring. */
function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True if the point is inside (or on the boundary of) any of the areas, holes excluded. */
export function isInsideAreas(p: Position, areas: AreaGeometry[]): boolean {
  for (const area of areas) {
    for (const [outer, ...holes] of polygonsOf(area)) {
      if (inRing(p, outer) && !holes.some((h) => inRing(p, h))) return true;
    }
  }
  return onBoundary(p, areas);
}

function onBoundary(p: Position, areas: AreaGeometry[]): boolean {
  const q = nearestOnBoundary(p, areas);
  return q !== null && q[0] === p[0] && q[1] === p[1];
}

/** Nearest point on the boundary (outer rings and holes) of the areas. */
export function nearestOnBoundary(p: Position, areas: AreaGeometry[]): Position | null {
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best: Position | null = null;
  let bestD = Infinity;
  for (const area of areas) {
    for (const ring of polygonsOf(area).flat()) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const dx = (bx - ax) * k;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t =
          len2 === 0
            ? 0
            : Math.max(0, Math.min(1, ((p[0] - ax) * k * dx + (p[1] - ay) * dy) / len2));
        const qx = ax + t * (bx - ax);
        const qy = ay + t * (by - ay);
        const d = ((qx - p[0]) * k) ** 2 + (qy - p[1]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = t === 0 ? [ax, ay] : t === 1 ? [bx, by] : [qx, qy];
        }
      }
    }
  }
  return best;
}

/** The point itself if inside the areas, else the nearest point on their boundary. */
export function clampToAreas(p: Position, areas: AreaGeometry[]): Position {
  if (areas.length === 0 || isInsideAreas(p, areas)) return p;
  return nearestOnBoundary(p, areas) ?? p;
}
