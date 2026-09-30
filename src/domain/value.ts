// Land value model (JSTS-based: import lazily from the UI).
import { feature, length as turfLength } from "@turf/turf";
import { isInsideAreas } from "./geometry/containment";
import {
  boundaryWithin,
  bufferLines,
  differencePolygons,
  intersectionPolygons,
  unionPolygons,
} from "./geometry/jsts";
import { geometryAreaM2 } from "./geometry/measure";
import type { AreaGeometry, LineString, Polygon } from "./model/geojson";
import type { Asset, FrontageLine, Lot, ProjectSettings, ValueZone } from "./model/project";

/**
 * Estimated value of a piece of land:
 *
 *   base × area  +  Σ zones  area(piece ∩ zone) × (zone value − base)  +  assets
 *
 * - Zones are applied in list order; a zone only covers what earlier zones do not, so an
 *   area is never counted twice.
 * - A point asset (well, house…) belongs entirely to the one lot containing it; an area
 *   asset (olive grove…) is shared between lots in proportion to area.
 * - Road frontage: length of the lot boundary running along a frontage line (±1.5 m).
 *
 * This is a transparent, configurable estimate — not an official valuation.
 */

/** Frontage lines are drawn by hand: accept boundaries within ~1.5 m of them. */
const FRONTAGE_BUFFER_DEG = 1.5 / 111_320;
/** Minimum frontage for "road access" (about a gate): touching a road at a corner is not access. */
export const ROAD_ACCESS_MIN_M = 3;

type EffectiveZone = { id: string; pieces: Polygon[]; perM2: number };

export type ValueModel = {
  basePerM2: number;
  zones: EffectiveZone[];
  pointAssets: Asset[];
  areaAssets: (Asset & { geometry: Polygon; areaM2: number })[];
  frontageBuffer: Polygon[];
  hasFrontage: boolean;
  /** Per-geometry cache of the lot-local parts (zones, area assets, frontage). */
  cache: WeakMap<Polygon, LocalParts>;
};

type LocalParts = {
  areaM2: number;
  landValue: number;
  areaAssetValue: number;
  areaAssetIds: string[];
  frontageM: number;
};

export type LotValue = {
  areaM2: number;
  /** Land value (base + zones), without assets. */
  landValue: number;
  assetValue: number;
  assetIds: string[];
  total: number;
  frontageM: number;
  roadAccess: boolean;
};

/** True when the project has enough value information to estimate values. */
export function hasValueModel(
  settings: ProjectSettings,
  zones: ValueZone[],
  assets: Asset[],
): boolean {
  return (settings.baseValuePerM2 ?? 0) > 0 || zones.length > 0 || assets.length > 0;
}

export function buildValueModel(
  settings: ProjectSettings,
  zones: ValueZone[],
  assets: Asset[],
  frontage: FrontageLine[],
): ValueModel {
  const base = settings.baseValuePerM2 ?? 0;
  const claimed: AreaGeometry[] = [];
  const effective: EffectiveZone[] = [];
  for (const z of zones) {
    const pieces = differencePolygons([z.geometry], claimed);
    claimed.push(z.geometry);
    effective.push({ id: z.id, pieces, perM2: z.mode === "perM2" ? z.value : base * z.value });
  }
  const areaAssets = assets
    .filter((a): a is Asset & { geometry: Polygon } => a.geometry.type === "Polygon")
    .map((a) => ({ ...a, areaM2: geometryAreaM2(a.geometry) }))
    .filter((a) => a.areaM2 > 0);
  const lines: LineString[] = frontage.map((f) => f.geometry);
  return {
    basePerM2: base,
    zones: effective,
    pointAssets: assets.filter((a) => a.geometry.type === "Point"),
    areaAssets,
    frontageBuffer: bufferLines(lines, FRONTAGE_BUFFER_DEG),
    hasFrontage: lines.length > 0,
    cache: new WeakMap(),
  };
}

function areaOf(pieces: Polygon[]): number {
  return pieces.reduce((s, p) => s + geometryAreaM2(p), 0);
}

function localParts(model: ValueModel, geometry: Polygon): LocalParts {
  const cached = model.cache.get(geometry);
  if (cached) return cached;
  const areaM2 = geometryAreaM2(geometry);
  let landValue = model.basePerM2 * areaM2;
  for (const z of model.zones) {
    const inZone = areaOf(z.pieces.flatMap((p) => intersectionPolygons(geometry, p)));
    landValue += inZone * (z.perM2 - model.basePerM2);
  }
  let areaAssetValue = 0;
  const areaAssetIds: string[] = [];
  for (const a of model.areaAssets) {
    const share = areaOf(intersectionPolygons(geometry, a.geometry)) / a.areaM2;
    if (share > 1e-6) {
      areaAssetValue += a.value * share;
      areaAssetIds.push(a.id);
    }
  }
  let frontageM = 0;
  if (model.hasFrontage) {
    const along = boundaryWithin(geometry, model.frontageBuffer);
    if (along) frontageM = lineLengthM(along);
  }
  const parts = { areaM2, landValue, areaAssetValue, areaAssetIds, frontageM };
  model.cache.set(geometry, parts);
  return parts;
}

function lineLengthM(g: GeoJSON.Geometry): number {
  if (g.type === "LineString" || g.type === "MultiLineString") {
    return turfLength(feature(g), { units: "kilometers" }) * 1000;
  }
  if (g.type === "GeometryCollection") return g.geometries.reduce((s, x) => s + lineLengthM(x), 0);
  return 0;
}

/** Values of all lots. Each point asset is given to the first lot that contains it. */
export function computeLotValues(
  model: ValueModel,
  lots: Pick<Lot, "id" | "geometry">[],
): Map<string, LotValue> {
  const pointOwner = new Map<string, string>();
  for (const a of model.pointAssets) {
    const pos = (a.geometry as GeoJSON.Point).coordinates;
    const owner = lots.find((l) => isInsideAreas(pos, [l.geometry]));
    if (owner) pointOwner.set(a.id, owner.id);
  }
  const result = new Map<string, LotValue>();
  for (const lot of lots) {
    const p = localParts(model, lot.geometry);
    const points = model.pointAssets.filter((a) => pointOwner.get(a.id) === lot.id);
    const assetValue = p.areaAssetValue + points.reduce((s, a) => s + a.value, 0);
    result.set(lot.id, {
      areaM2: p.areaM2,
      landValue: p.landValue,
      assetValue,
      assetIds: [...p.areaAssetIds, ...points.map((a) => a.id)],
      total: p.landValue + assetValue,
      frontageM: p.frontageM,
      roadAccess: p.frontageM >= ROAD_ACCESS_MIN_M,
    });
  }
  return result;
}

/** Total estimated value of the property (the reference for target values). */
export function propertyValue(model: ValueModel, parcels: AreaGeometry[]): number {
  const pieces = unionPolygons(parcels);
  const values = computeLotValues(
    model,
    pieces.map((geometry, i) => ({ id: `p${i}`, geometry })),
  );
  return [...values.values()].reduce((s, v) => s + v.total, 0);
}
