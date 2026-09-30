import type { AreaGeometry, Position } from "../model/geojson";

/** Bearing in [0, 180): 0° = north–south, 90° = east–west (x scaled by cos(latitude)). */
export function bearingOf(a: Position, b: Position): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const deg = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
}

function planarLength(a: Position, b: Position): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
}

/** Bearing of the longest edge of the property: a natural cut direction. */
export function longestEdgeBearing(parcels: AreaGeometry[]): number {
  let best = 0;
  let bestLen = -1;
  for (const g of parcels) {
    const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const len = planarLength(ring[i], ring[i + 1]);
        if (len > bestLen) {
          bestLen = len;
          best = bearingOf(ring[i], ring[i + 1]);
        }
      }
    }
  }
  return best;
}

/** Bearing perpendicular to a line (e.g. a road): cuts that reach it from every strip. */
export function perpendicularBearing(line: Position[]): number {
  return (bearingOf(line[0], line[line.length - 1]) + 90) % 180;
}
