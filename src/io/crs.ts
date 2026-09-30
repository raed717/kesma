import proj4 from "proj4";
import type { Position } from "@/domain/model/geojson";

/**
 * Coordinate reference systems KESMA can import. Everything is stored in WGS84.
 *
 * The Carthage definitions carry an explicit datum shift (+towgs84). Generic WKT parsing
 * (e.g. from a Shapefile .prj) often drops it, which shifts Tunisian parcels by 100–300 m,
 * so .prj files are *identified* and mapped to these definitions instead of parsed.
 */
export const SUPPORTED_CRS = [
  {
    id: "EPSG:4326",
    name: "WGS 84 (longitude / latitude)",
    units: "degrees",
    def: "+proj=longlat +datum=WGS84 +no_defs",
  },
  {
    id: "EPSG:22391",
    name: "Carthage / Nord Tunisie",
    units: "metres",
    def: "+proj=lcc +lat_1=36 +lat_0=36 +lon_0=9.9 +k_0=0.999625544 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=-263,6,431,0,0,0,0 +units=m +no_defs",
  },
  {
    id: "EPSG:22392",
    name: "Carthage / Sud Tunisie",
    units: "metres",
    def: "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=9.9 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=-263,6,431,0,0,0,0 +units=m +no_defs",
  },
  {
    id: "EPSG:22332",
    name: "Carthage / UTM 32N",
    units: "metres",
    def: "+proj=utm +zone=32 +a=6378249.2 +b=6356515 +towgs84=-263,6,431,0,0,0,0 +units=m +no_defs",
  },
  {
    id: "EPSG:32632",
    name: "WGS 84 / UTM 32N",
    units: "metres",
    def: "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs",
  },
  {
    id: "EPSG:3857",
    name: "Web Mercator",
    units: "metres",
    def: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs",
  },
] as const;

export type CrsId = (typeof SUPPORTED_CRS)[number]["id"];
export const WGS84: CrsId = "EPSG:4326";

for (const crs of SUPPORTED_CRS) proj4.defs(crs.id, crs.def);

export function isSupportedCrs(id: string): id is CrsId {
  return SUPPORTED_CRS.some((c) => c.id === id);
}

export function crsInfo(id: CrsId) {
  return SUPPORTED_CRS.find((c) => c.id === id)!;
}

/** [minLng, minLat, maxLng, maxLat], generous margin around Tunisia. */
export const TUNISIA_BBOX = [7.3, 30.1, 11.8, 37.6] as const;

export function isInTunisia([lng, lat]: Position): boolean {
  const [w, s, e, n] = TUNISIA_BBOX;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

export type BBox = [number, number, number, number];

export function looksLikeLngLat([minX, minY, maxX, maxY]: BBox): boolean {
  return minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
}

export function toWgs84(from: CrsId): (p: Position) => Position {
  if (from === WGS84) return ([x, y]) => [x, y];
  const converter = proj4(from, WGS84);
  return ([x, y]) => converter.forward([x, y]);
}

export function fromWgs84(to: CrsId): (p: Position) => Position {
  if (to === WGS84) return ([x, y]) => [x, y];
  const converter = proj4(WGS84, to);
  return ([x, y]) => converter.forward([x, y]);
}

/** Identifies a supported CRS from a WKT string (Shapefile .prj). Returns null if unknown. */
export function detectCrsFromWkt(wkt: string): CrsId | null {
  const text = wkt.trim();
  if (!text) return null;

  // WKT1: the last AUTHORITY belongs to the outermost (PROJCS/GEOGCS) element.
  const authorities = [...text.matchAll(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)];
  const last = authorities.at(-1)?.[1];
  // WKT2: ID["EPSG",22391] at the end.
  const wkt2 = text.match(/ID\s*\[\s*"EPSG"\s*,\s*(\d+)\s*\]\s*\]\s*$/i)?.[1];
  for (const code of [wkt2, last]) {
    if (code && isSupportedCrs(`EPSG:${code}`)) return `EPSG:${code}` as CrsId;
  }

  const n = text.replace(/[\s_]+/g, " ");
  const projected = /^\s*(PROJCS|PROJCRS)/i.test(text);
  if (/Nord Tunisie/i.test(n)) return "EPSG:22391";
  if (/Sud Tunisie/i.test(n)) return "EPSG:22392";
  if (/UTM zone 32N/i.test(n)) return /Carthage/i.test(n) ? "EPSG:22332" : "EPSG:32632";
  if (/Pseudo.?Mercator|Mercator Auxiliary Sphere|Web Mercator/i.test(n)) return "EPSG:3857";
  if (!projected && /WGS.?1984|WGS 84/i.test(n)) return WGS84;
  return null;
}

/** Legacy GeoJSON (2008) `crs` member, e.g. "urn:ogc:def:crs:EPSG::22391". */
export function detectCrsFromGeoJsonMember(crs: unknown): CrsId | null | undefined {
  if (!crs || typeof crs !== "object") return undefined;
  const name = (crs as { properties?: { name?: unknown } }).properties?.name;
  if (typeof name !== "string") return undefined;
  if (/CRS84$/i.test(name)) return WGS84;
  const code = name.match(/EPSG:{1,2}(\d+)$/i)?.[1];
  const id = code ? `EPSG:${code}` : "";
  return isSupportedCrs(id) ? id : null;
}

/**
 * Candidate CRSs for coordinates of unknown origin, best first:
 * those whose reprojected centre falls inside Tunisia.
 */
export function suggestCrs(bbox: BBox): CrsId[] {
  if (looksLikeLngLat(bbox)) return [WGS84];
  const centre: Position = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  return SUPPORTED_CRS.filter((c) => c.units === "metres")
    .map((c) => c.id as CrsId)
    .filter((id) => {
      try {
        return isInTunisia(toWgs84(id)(centre));
      } catch {
        return false;
      }
    });
}
