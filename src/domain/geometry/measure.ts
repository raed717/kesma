import { area as turfArea, length as turfLength, lineString, polygon } from "@turf/turf";
import type { AreaGeometry, Position } from "../model/geojson";

/** Geodesic area of a polygon or multipolygon, in m². */
export function geometryAreaM2(geometry: AreaGeometry): number {
  return turfArea(geometry);
}

export function totalAreaM2(geometries: AreaGeometry[]): number {
  return geometries.reduce((sum, g) => sum + geometryAreaM2(g), 0);
}

/** Geodesic length of a path, in metres. */
export function pathLengthM(points: Position[]): number {
  if (points.length < 2) return 0;
  return turfLength(lineString(points), { units: "kilometers" }) * 1000;
}

/** Area enclosed by an open ring of points (closed automatically), in m². */
export function ringAreaM2(points: Position[]): number {
  if (points.length < 3) return 0;
  return turfArea(polygon([closeRing(points)]));
}

/** Perimeter of an open ring of points (closed automatically), in metres. */
export function ringPerimeterM(points: Position[]): number {
  if (points.length < 2) return 0;
  return pathLengthM(closeRing(points));
}

function polygonsOf(geometry: AreaGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Total boundary length (outer rings and holes), in metres. */
export function geometryPerimeterM(geometry: AreaGeometry): number {
  return polygonsOf(geometry)
    .flat()
    .reduce((sum, ring) => sum + pathLengthM(ring), 0);
}

/** Number of distinct vertices (closing points not counted). */
export function vertexCount(geometry: AreaGeometry): number {
  return polygonsOf(geometry)
    .flat()
    .reduce((sum, ring) => sum + Math.max(0, ring.length - 1), 0);
}

export function closeRing(points: Position[]): Position[] {
  if (points.length === 0) return points;
  const [first] = points;
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}
