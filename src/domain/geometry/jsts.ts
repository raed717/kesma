// Robust planar operations (JTS port). Imported lazily by the UI: ~300 kB.
// Operations run directly on lon/lat: lots are small, and straight edges in lon/lat are
// what the map draws, so topology (shared vertices, crossings) is preserved exactly.
import "jsts/org/locationtech/jts/monkey.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import IsValidOp from "jsts/org/locationtech/jts/operation/valid/IsValidOp.js";
import GeometryNoder from "jsts/org/locationtech/jts/noding/snapround/GeometryNoder.js";
import PrecisionModel from "jsts/org/locationtech/jts/geom/PrecisionModel.js";
import ArrayList from "jsts/java/util/ArrayList.js";
import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import type { AreaGeometry, LineString, Polygon, Position } from "../model/geojson";

const factory = new GeometryFactory();
const reader = new GeoJSONReader(factory);
const writer = new GeoJSONWriter();

/** Below this (in square degrees, ~1 cm² at Tunisian latitudes) a polygon is noise. */
const MIN_AREA_DEG2 = 1e-14;

// jsts types are loose (monkey-patched methods): keep the `any` in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = Geometry & Record<string, any>;

const read = (g: GeoJSON.Geometry) => reader.read(g) as G;
const write = (g: G) => writer.write(g) as GeoJSON.Geometry;

/** Unary union of many geometries (one robust pass instead of pairwise unions). */
const unionAll = (geoms: G[]) => (factory.createGeometryCollection(geoms) as G).union() as G;

function polygonsOf(g: G): Polygon[] {
  const out: Polygon[] = [];
  for (let i = 0; i < g.getNumGeometries(); i++) {
    const part = g.getGeometryN(i) as G;
    if (part.getGeometryType() === "Polygon" && part.getArea() > MIN_AREA_DEG2) {
      out.push(write(part) as Polygon);
    }
  }
  return out;
}

/**
 * Splits a polygon with a (poly)line. Returns the pieces, or null if the line does not
 * cut the polygon into at least two parts (it must cross the boundary twice).
 */
export function splitPolygonByLine(polygon: Polygon, line: LineString): Polygon[] | null {
  const poly = read(polygon);
  // Node the boundary and the cut line together, then rebuild faces from the linework.
  const noded = poly.getBoundary().union(read(line)) as G;
  const polygonizer = new Polygonizer();
  polygonizer.add(noded);
  const faces = polygonizer.getPolygons().toArray() as G[];
  const inside = faces.filter(
    (f) => f.getArea() > MIN_AREA_DEG2 && poly.contains(f.getInteriorPoint()),
  );
  if (inside.length < 2) return null;
  return inside.map((f) => write(f) as Polygon);
}

/** Merges polygons that touch along an edge. Null if the result is not a single polygon. */
export function mergePolygons(polygons: Polygon[]): Polygon | null {
  if (polygons.length === 0) return null;
  const union = unionAll(polygons.map(read));
  const parts = polygonsOf(union);
  return parts.length === 1 ? parts[0] : null;
}

/**
 * Shape of a new lot: the drawn polygon, kept inside the property and outside existing
 * lots. Several polygons can result (e.g. drawing across an existing lot).
 */
export function fitNewLot(
  drawn: Polygon,
  property: AreaGeometry[],
  existingLots: Polygon[],
): Polygon[] {
  let g = read(drawn);
  if (!g.isValid()) g = g.buffer(0) as G;
  if (property.length > 0) g = g.intersection(unionAll(property.map(read))) as G;
  if (existingLots.length > 0) g = g.difference(unionAll(existingLots.map(read))) as G;
  return polygonsOf(g);
}

export function isValidPolygon(polygon: Polygon): boolean {
  return read(polygon).isValid();
}

// ---------- validation helpers ----------

/** JTS error types, in TopologyValidationError order. */
export const VALIDITY_ERRORS = [
  "generic",
  "repeatedPoint",
  "holeOutsideShell",
  "nestedHoles",
  "disconnectedInterior",
  "selfIntersection",
  "ringSelfIntersection",
  "nestedShells",
  "duplicateRings",
  "tooFewPoints",
  "invalidCoordinate",
  "ringNotClosed",
] as const;
export type ValidityErrorKind = (typeof VALIDITY_ERRORS)[number];

/** Why a polygon is invalid, and where. Null when valid. */
export function validityError(
  polygon: Polygon,
): { kind: ValidityErrorKind; location: Position | null } | null {
  const op = new IsValidOp(read(polygon));
  if (op.isValid()) return null;
  const err = op.getValidationError();
  const c = err?.getCoordinate();
  return {
    kind: VALIDITY_ERRORS[err?.getErrorType() ?? 0] ?? "generic",
    location: c ? [c.x, c.y] : null,
  };
}

/** Quick bounding-box test to skip most pairs before an exact intersection. */
export function envelopesIntersect(a: Polygon, b: Polygon): boolean {
  return read(a).getEnvelopeInternal().intersects(read(b).getEnvelopeInternal());
}

/** Area pieces shared by two polygons (empty when they only touch along edges). */
export function intersectionPolygons(a: Polygon, b: Polygon): Polygon[] {
  return polygonsOf(read(a).intersection(read(b)) as G);
}

/** Pieces of union(a) that are not covered by union(b). */
export function differencePolygons(a: AreaGeometry[], b: AreaGeometry[]): Polygon[] {
  if (a.length === 0) return [];
  const left = unionAll(a.map(read));
  if (b.length === 0) return polygonsOf(left);
  return polygonsOf(left.difference(unionAll(b.map(read))) as G);
}

/** Union of polygons as a list of polygon pieces. */
export function unionPolygons(polygons: AreaGeometry[]): Polygon[] {
  return polygons.length ? polygonsOf(unionAll(polygons.map(read))) : [];
}

/** Common boundary of two polygons as GeoJSON lines (for length computations). */
export function sharedBoundary(a: Polygon, b: Polygon): GeoJSON.Geometry | null {
  const shared = read(a).getBoundary().intersection(read(b).getBoundary()) as G;
  return shared.isEmpty() ? null : write(shared);
}

/**
 * Repairs an invalid polygon (e.g. a bow-tie) into valid pieces by snap-round noding its
 * boundary (grid 1e-10°, ≈ 0.01 mm) and rebuilding faces. Unlike buffer(0), no lobe of a
 * bow-tie is lost; unlike overlay-based self-union, it does not throw on crossings.
 */
export function repairPolygon(polygon: Polygon): Polygon[] {
  const input = new ArrayList(undefined); // empty Java-style list
  input.add(read(polygon).getBoundary());
  const noded = new GeometryNoder(new PrecisionModel(1e10)).node(input);
  const polygonizer = new Polygonizer();
  polygonizer.add(noded);
  return (polygonizer.getPolygons().toArray() as G[])
    .filter((f) => f.getArea() > MIN_AREA_DEG2)
    .map((f) => write(f) as Polygon);
}
