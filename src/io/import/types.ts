import type { AreaGeometry } from "@/domain/model/geojson";
import type { CrsId } from "../crs";

export type ImportFormat = "geojson" | "kml" | "kmz" | "shapefile" | "csv" | "gpx";

export type CrsDetection =
  /** Declared by the file (.prj, GeoJSON crs member) or implied by the format (KML/GPX). */
  | { status: "known"; crs: CrsId; source: "prj" | "geojson-member" | "format" }
  /** Declared, but not a CRS KESMA supports. */
  | { status: "unsupported"; declared: string }
  /** Nothing declared: the user must pick (suggestions are computed from the extent). */
  | { status: "unknown" };

/** Parsed file, still in its source CRS. */
export type RawLayer = {
  format: ImportFormat;
  fileName: string;
  features: GeoJSON.Feature[];
  crs: CrsDetection;
};

export type CsvTable = {
  fileName: string;
  headers: string[];
  rows: string[][];
  delimiter: string;
};

export type CsvMapping = { x: number; y: number; group: number | null };

export type ReadResult = { kind: "layer"; layer: RawLayer } | { kind: "table"; table: CsvTable };

export type ImportWarning =
  | "linesConvertedToPolygons"
  | "pointsSkipped"
  | "linesSkipped"
  | "invalidSkipped"
  | "selfIntersections"
  | "outsideTunisia";

/** One polygon the user can choose to import, already in WGS84. */
export type ImportCandidate = {
  key: string;
  label: string;
  geometry: AreaGeometry;
  areaM2: number;
  selfIntersects: boolean;
  fromLine: boolean;
  properties: Record<string, unknown>;
};

export type ImportPreview = {
  candidates: ImportCandidate[];
  bbox: [number, number, number, number] | null;
  centre: [number, number] | null;
  inTunisia: boolean;
  skipped: { points: number; lines: number; invalid: number };
  warnings: ImportWarning[];
};

export type ImportErrorCode =
  | "unsupportedFormat"
  | "emptyFile"
  | "tooLarge"
  | "invalidJson"
  | "invalidGeoJson"
  | "invalidXml"
  | "noKmlInKmz"
  | "noShpInZip"
  | "shpNotZipped"
  | "invalidShapefile"
  | "csvNoRows"
  | "csvNotEnoughPoints"
  | "noCoordinates"
  | "noAreaFeatures"
  | "reprojectionFailed";

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ImportError";
  }
}
