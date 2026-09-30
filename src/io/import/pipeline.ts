import { kinks } from "@turf/turf";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import type { AreaGeometry, Position } from "@/domain/model/geojson";
import { isInTunisia, looksLikeLngLat, suggestCrs, toWgs84, type BBox, type CrsId } from "../crs";
import {
  parseCsvTable,
  parseGeoJson,
  parseGpx,
  parseKml,
  parseKmz,
  parseShapefileZip,
} from "./parsers";
import {
  ImportError,
  type ImportCandidate,
  type ImportPreview,
  type ImportWarning,
  type RawLayer,
  type ReadResult,
} from "./types";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [
  ".geojson",
  ".json",
  ".kml",
  ".kmz",
  ".zip",
  ".gpx",
  ".csv",
  ".txt",
];

type FileLike = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

/** Step 1: read and parse a file, without any reprojection. */
export async function readImportFile(file: FileLike): Promise<ReadResult> {
  if (file.size === 0) throw new ImportError("emptyFile");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("tooLarge");
  const name = file.name;
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const bytes = await file.arrayBuffer();
  const text = () => new TextDecoder("utf-8").decode(bytes);

  switch (ext) {
    case ".geojson":
    case ".json":
      return { kind: "layer", layer: parseGeoJson(text(), name) };
    case ".kml":
      return { kind: "layer", layer: parseKml(text(), name) };
    case ".kmz":
      return { kind: "layer", layer: await parseKmz(bytes, name) };
    case ".zip":
      return { kind: "layer", layer: await parseShapefileZip(bytes, name) };
    case ".gpx":
      return { kind: "layer", layer: parseGpx(text(), name) };
    case ".csv":
    case ".txt":
      return { kind: "table", table: parseCsvTable(text(), name) };
    case ".shp":
    case ".dbf":
    case ".shx":
    case ".prj":
      throw new ImportError("shpNotZipped");
    default:
      throw new ImportError("unsupportedFormat", ext);
  }
}

/** Extent of all coordinates in the layer, in its source CRS. */
export function layerBbox(layer: RawLayer): BBox | null {
  let bbox: BBox | null = null;
  for (const f of layer.features) {
    forEachPosition(f.geometry, ([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!bbox) bbox = [x, y, x, y];
      else
        bbox = [
          Math.min(bbox[0], x),
          Math.min(bbox[1], y),
          Math.max(bbox[2], x),
          Math.max(bbox[3], y),
        ];
    });
  }
  return bbox;
}

/**
 * CRS to preselect in the UI: the declared one if supported, otherwise the best guess
 * from the coordinate values (WGS84 if they look like degrees).
 */
export function initialCrs(layer: RawLayer): { crs: CrsId | null; suggestions: CrsId[] } {
  const bbox = layerBbox(layer);
  const suggestions = bbox ? suggestCrs(bbox) : [];
  if (layer.crs.status === "known") return { crs: layer.crs.crs, suggestions };
  if (bbox && looksLikeLngLat(bbox)) return { crs: "EPSG:4326", suggestions };
  return { crs: suggestions[0] ?? null, suggestions };
}

/** Step 2: reproject to WGS84 and turn features into importable polygons. */
export function buildPreview(layer: RawLayer, crs: CrsId): ImportPreview {
  let project: (p: Position) => Position;
  try {
    project = toWgs84(crs);
  } catch (error) {
    throw new ImportError("reprojectionFailed", String(error));
  }

  const candidates: ImportCandidate[] = [];
  const skipped = { points: 0, lines: 0, invalid: 0 };

  layer.features.forEach((feature, index) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    for (const part of explode(feature.geometry)) {
      let geometry: AreaGeometry | null = null;
      let fromLine = false;
      if (part.type === "Point" || part.type === "MultiPoint") {
        skipped.points++;
        continue;
      }
      if (part.type === "LineString") {
        // A closed line (or a GPS track walked around the boundary) becomes a polygon.
        if (part.coordinates.length >= 3) {
          geometry = { type: "Polygon", coordinates: [part.coordinates] };
          fromLine = true;
        } else {
          skipped.lines++;
          continue;
        }
      } else if (part.type === "Polygon" || part.type === "MultiPolygon") {
        geometry = part;
      }
      if (!geometry) continue;

      const cleaned = cleanGeometry(reprojectGeometry(geometry, project));
      if (!cleaned) {
        skipped.invalid++;
        continue;
      }
      const areaM2 = geometryAreaM2(cleaned);
      // A self-intersecting ring's area is meaningless (lobes can cancel out), so keep it
      // and let the user see the warning rather than dropping it silently.
      const selfIntersects = hasSelfIntersection(cleaned);
      if (!selfIntersects && !(areaM2 > 0.01)) {
        skipped.invalid++;
        continue;
      }
      candidates.push({
        key: `${index}-${candidates.length}`,
        label: pickLabel(properties) ?? "",
        geometry: cleaned,
        areaM2,
        selfIntersects,
        fromLine,
        properties,
      });
    }
  });

  const bbox = candidatesBbox(candidates);
  const centre: [number, number] | null = bbox
    ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
    : null;
  const inTunisia = centre ? isInTunisia(centre) : false;

  const warnings: ImportWarning[] = [];
  if (candidates.some((c) => c.fromLine)) warnings.push("linesConvertedToPolygons");
  if (skipped.points) warnings.push("pointsSkipped");
  if (skipped.lines) warnings.push("linesSkipped");
  if (skipped.invalid) warnings.push("invalidSkipped");
  if (candidates.some((c) => c.selfIntersects)) warnings.push("selfIntersections");
  if (centre && !inTunisia) warnings.push("outsideTunisia");

  return { candidates, bbox, centre, inTunisia, skipped, warnings };
}

// ---------- helpers ----------

function explode(geometry: GeoJSON.Geometry | null): GeoJSON.Geometry[] {
  if (!geometry) return [];
  switch (geometry.type) {
    case "GeometryCollection":
      return geometry.geometries.flatMap(explode);
    case "MultiLineString":
      return geometry.coordinates.map((coordinates) => ({ type: "LineString", coordinates }));
    default:
      return [geometry];
  }
}

function forEachPosition(geometry: GeoJSON.Geometry | null, fn: (p: Position) => void) {
  if (!geometry) return;
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((g) => forEachPosition(g, fn));
    return;
  }
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") fn(c as Position);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
}

function reprojectGeometry(g: AreaGeometry, project: (p: Position) => Position): AreaGeometry {
  const ring = (r: Position[]) => r.map((p) => roundPosition(project(p)));
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map(ring)) };
}

/** ~1 cm precision is plenty and keeps project files small. */
function roundPosition([x, y]: Position): Position {
  return [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7];
}

/** Drops Z, consecutive duplicates and degenerate rings; closes rings. Null if nothing valid remains. */
export function cleanGeometry(g: AreaGeometry): AreaGeometry | null {
  const cleanRing = (ring: Position[]): Position[] | null => {
    const out: Position[] = [];
    for (const p of ring) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push([p[0], p[1]]);
    }
    const [first, last] = [out[0], out[out.length - 1]];
    if (out.length && (first[0] !== last[0] || first[1] !== last[1]))
      out.push([first[0], first[1]]);
    return out.length >= 4 ? out : null;
  };
  const cleanPolygon = (rings: Position[][]): Position[][] | null => {
    const outer = rings[0] && cleanRing(rings[0]);
    if (!outer) return null;
    const holes = rings
      .slice(1)
      .map(cleanRing)
      .filter((r): r is Position[] => r !== null);
    return [outer, ...holes];
  };

  if (g.type === "Polygon") {
    const poly = cleanPolygon(g.coordinates);
    return poly ? { type: "Polygon", coordinates: poly } : null;
  }
  const polys = g.coordinates.map(cleanPolygon).filter((p): p is Position[][] => p !== null);
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0] }
    : { type: "MultiPolygon", coordinates: polys };
}

function hasSelfIntersection(g: AreaGeometry): boolean {
  try {
    return kinks(g).features.length > 0;
  } catch {
    return true;
  }
}

const LABEL_KEYS = [
  "name",
  "nom",
  "label",
  "title",
  "parcelle",
  "parcel",
  "num_parc",
  "numero",
  "num",
  "ref",
  "reference",
  "id",
];

export function pickLabel(properties: Record<string, unknown>): string | null {
  const entries = Object.entries(properties);
  for (const key of LABEL_KEYS) {
    const hit = entries.find(([k]) => k.toLowerCase() === key);
    const value = hit?.[1];
    if ((typeof value === "string" && value.trim()) || typeof value === "number") {
      return String(value).trim().slice(0, 80);
    }
  }
  return null;
}

function candidatesBbox(candidates: ImportCandidate[]): BBox | null {
  let bbox: BBox | null = null;
  for (const c of candidates) {
    forEachPosition(c.geometry, ([x, y]) => {
      bbox = bbox
        ? [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)]
        : [x, y, x, y];
    });
  }
  return bbox;
}
