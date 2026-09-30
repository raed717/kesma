import type { Map as MapLibreMap } from "maplibre-gl";
import type { Position } from "@/domain/model/geojson";

export type SnapTargets = {
  vertices: Position[];
  segments: [Position, Position][];
};

export const SNAP_PX = 10;

/**
 * Snaps a position to the nearest vertex (preferred) or segment within `px` screen pixels.
 * Screen-space distances make snapping feel the same at every zoom level.
 */
export function snapPosition(
  map: MapLibreMap,
  position: Position,
  targets: SnapTargets,
  px = SNAP_PX,
): { position: Position; snapped: "vertex" | "edge" | null } {
  const p = map.project([position[0], position[1]]);
  let best: Position | null = null;
  let bestD = px;
  for (const v of targets.vertices) {
    const s = map.project([v[0], v[1]]);
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (best) return { position: [best[0], best[1]], snapped: "vertex" };

  let bestEdge: Position | null = null;
  bestD = px;
  for (const [a, b] of targets.segments) {
    const sa = map.project([a[0], a[1]]);
    const sb = map.project([b[0], b[1]]);
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((p.x - sa.x) * dx + (p.y - sa.y) * dy) / len2));
    const d = Math.hypot(sa.x + t * dx - p.x, sa.y + t * dy - p.y);
    if (d < bestD) {
      bestD = d;
      // Interpolate in lon/lat (edges are straight in lon/lat on the map at these scales).
      bestEdge = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
  }
  return bestEdge ? { position: bestEdge, snapped: "edge" } : { position, snapped: null };
}

/** Vertices and segments of polygon rings, for snapping. */
export function snapTargetsFrom(rings: Position[][]): SnapTargets {
  const vertices: Position[] = [];
  const segments: [Position, Position][] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      vertices.push(ring[i]);
      segments.push([ring[i], ring[i + 1]]);
    }
  }
  return { vertices, segments };
}
