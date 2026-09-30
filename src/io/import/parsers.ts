import { gpx as gpxToGeoJson, kml as kmlToGeoJson } from "@tmcw/togeojson";
import JSZip from "jszip";
import Papa from "papaparse";
import { combine, parseDbf, parseShp } from "shpjs";
import { detectCrsFromGeoJsonMember, detectCrsFromWkt, WGS84 } from "../crs";
import { ImportError, type CrsDetection, type CsvTable, type RawLayer } from "./types";

// ---------- GeoJSON ----------

export function parseGeoJson(text: string, fileName: string): RawLayer {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("invalidJson");
  }
  const features = toFeatures(data);
  const crsMember = (data as { crs?: { properties?: { name?: unknown } } }).crs;
  const member = detectCrsFromGeoJsonMember(crsMember);
  // RFC 7946 GeoJSON is WGS84; projected exports usually omit `crs`, so "unknown"
  // lets the pipeline decide from the coordinate values.
  const crs: CrsDetection =
    member === undefined
      ? { status: "unknown" }
      : member === null
        ? { status: "unsupported", declared: String(crsMember?.properties?.name) }
        : { status: "known", crs: member, source: "geojson-member" };
  return { format: "geojson", fileName, features, crs };
}

function toFeatures(data: unknown): GeoJSON.Feature[] {
  if (!data || typeof data !== "object" || !("type" in data)) {
    throw new ImportError("invalidGeoJson");
  }
  const obj = data as GeoJSON.GeoJSON;
  switch (obj.type) {
    case "FeatureCollection":
      if (!Array.isArray(obj.features)) throw new ImportError("invalidGeoJson");
      return obj.features.filter((f) => f && f.geometry);
    case "Feature":
      return obj.geometry ? [obj] : [];
    case "GeometryCollection":
      return obj.geometries.map((geometry) => ({ type: "Feature", properties: {}, geometry }));
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
    case "Polygon":
    case "MultiPolygon":
      return [{ type: "Feature", properties: {}, geometry: obj }];
    default:
      throw new ImportError("invalidGeoJson");
  }
}

// ---------- KML / KMZ / GPX (always WGS84) ----------

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new ImportError("invalidXml");
  return doc;
}

const WGS84_BY_FORMAT: CrsDetection = { status: "known", crs: WGS84, source: "format" };

export function parseKml(text: string, fileName: string, format: "kml" | "kmz" = "kml"): RawLayer {
  const fc = kmlToGeoJson(parseXml(text)) as GeoJSON.FeatureCollection;
  return {
    format,
    fileName,
    features: fc.features.filter((f) => f.geometry),
    crs: WGS84_BY_FORMAT,
  };
}

export async function parseKmz(bytes: ArrayBuffer, fileName: string): Promise<RawLayer> {
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new ImportError("noKmlInKmz");
  });
  const entry =
    zip.file(/(^|\/)doc\.kml$/i)[0] ??
    zip.file(/\.kml$/i).find((f) => !f.name.includes("__MACOSX"));
  if (!entry) throw new ImportError("noKmlInKmz");
  return parseKml(await entry.async("text"), fileName, "kmz");
}

export function parseGpx(text: string, fileName: string): RawLayer {
  const fc = gpxToGeoJson(parseXml(text)) as GeoJSON.FeatureCollection;
  return {
    format: "gpx",
    fileName,
    features: fc.features.filter((f) => f.geometry),
    crs: WGS84_BY_FORMAT,
  };
}

// ---------- Shapefile (.zip) ----------

export async function parseShapefileZip(bytes: ArrayBuffer, fileName: string): Promise<RawLayer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError("noShpInZip");
  }
  const shpFiles = zip.file(/\.shp$/i).filter((f) => !f.name.includes("__MACOSX"));
  if (shpFiles.length === 0) throw new ImportError("noShpInZip");

  const features: GeoJSON.Feature[] = [];
  const crsList: CrsDetection[] = [];
  for (const shpFile of shpFiles) {
    const base = shpFile.name.slice(0, -4);
    const sibling = (ext: string) =>
      zip.file(new RegExp(`^${escapeRegExp(base)}\\.${ext}$`, "i"))[0];
    try {
      const shp = await shpFile.async("arraybuffer");
      const dbfFile = sibling("dbf");
      const cpgFile = sibling("cpg");
      const prjFile = sibling("prj");
      // No prj passed on purpose: we reproject ourselves with exact Tunisian definitions.
      const geometries = parseShp(shp);
      const records = dbfFile
        ? parseDbf(
            await dbfFile.async("arraybuffer"),
            cpgFile ? await cpgFile.async("text") : undefined,
          )
        : undefined;
      features.push(...combine([geometries, records]).features.filter((f) => f.geometry));
      if (prjFile) {
        const wkt = await prjFile.async("text");
        const id = detectCrsFromWkt(wkt);
        crsList.push(
          id
            ? { status: "known", crs: id, source: "prj" }
            : { status: "unsupported", declared: wktName(wkt) },
        );
      } else {
        crsList.push({ status: "unknown" });
      }
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError("invalidShapefile", String(error));
    }
  }
  return { format: "shapefile", fileName, features, crs: crsList[0] ?? { status: "unknown" } };
}

function wktName(wkt: string): string {
  return wkt.match(/^\s*\w+\s*\[\s*"([^"]+)"/)?.[1] ?? "unknown";
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- CSV ----------

export function parseCsvTable(text: string, fileName: string): CsvTable {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
  });
  const [headers, ...rows] = result.data.map((r) => r.map((c) => String(c ?? "").trim()));
  if (!headers || rows.length === 0) throw new ImportError("csvNoRows");
  return { fileName, headers, rows, delimiter: result.meta.delimiter };
}

const X_NAMES = /^(x|lon|lng|long|longitude|easting|est|e)$/i;
const Y_NAMES = /^(y|lat|latitude|northing|nord|n)$/i;
const GROUP_NAMES =
  /^(parcel|parcelle|parcel_id|id_parcelle|id|name|nom|group|groupe|polygon|lot)$/i;

export function guessCsvMapping(headers: string[]) {
  const find = (re: RegExp) => {
    const i = headers.findIndex((h) => re.test(h.trim()));
    return i === -1 ? null : i;
  };
  const x = find(X_NAMES);
  const y = find(Y_NAMES);
  const group = find(GROUP_NAMES);
  return { x, y, group: group !== x && group !== y ? group : null };
}

/** Accepts "10.25", "10,25" (European decimal comma) and "1 234,5". */
export function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[\s  ]/g, "");
  const normalised = /^-?\d+,\d+$/.test(cleaned) ? cleaned.replace(",", ".") : cleaned;
  return normalised === "" ? NaN : Number(normalised);
}

/** Each group of rows (or the whole file) becomes one polygon, vertices in row order. */
export function csvToLayer(
  table: CsvTable,
  mapping: { x: number; y: number; group: number | null },
): RawLayer {
  const groups = new Map<string, GeoJSON.Position[]>();
  for (const row of table.rows) {
    const x = parseNumber(row[mapping.x] ?? "");
    const y = parseNumber(row[mapping.y] ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = mapping.group === null ? "" : (row[mapping.group] ?? "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push([x, y]);
  }
  if (groups.size === 0) throw new ImportError("noCoordinates");

  const features: GeoJSON.Feature[] = [];
  for (const [key, points] of groups) {
    if (points.length < 3) continue;
    const ring = [...points];
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    features.push({
      type: "Feature",
      properties: key ? { name: key } : {},
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  if (features.length === 0) throw new ImportError("csvNotEnoughPoints");
  return { format: "csv", fileName: table.fileName, features, crs: { status: "unknown" } };
}
