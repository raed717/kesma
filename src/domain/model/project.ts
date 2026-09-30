import { z } from "zod";
import { AreaGeometrySchema, LineStringSchema, PointSchema, PolygonSchema } from "./geojson";

/** Bump when the persisted shape changes, and add a migration in `src/storage/migrations.ts`. */
export const CURRENT_SCHEMA_VERSION = 1;

const IdSchema = z.string().min(1);
const IsoDateSchema = z.string().min(1);
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AreaUnitSchema = z.enum(["m2", "a", "ha"]);
export type AreaUnit = z.infer<typeof AreaUnitSchema>;

export const BasemapIdSchema = z.enum(["streets", "satellite", "hybrid"]);
export type BasemapId = z.infer<typeof BasemapIdSchema>;

export const ProjectSettingsSchema = z.object({
  areaUnit: AreaUnitSchema,
  currency: z.string().min(1).max(8),
  /** Accepted deviation from a beneficiary's target, in percent. */
  areaTolerancePct: z.number().min(0).max(100),
  /** Base land value per m², used by the value model (Sprint 6). */
  baseValuePerM2: z.number().min(0).nullable(),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ParcelAttributesSchema = z.object({
  landUse: z.enum(["agricultural", "residential", "forest", "unused", "mixed", "other"]).optional(),
  roadAccess: z.boolean().optional(),
  waterAccess: z.boolean().optional(),
  irrigation: z.boolean().optional(),
  buildings: z.string().optional(),
  ownership: z.string().optional(),
  notes: z.string().optional(),
});
export type ParcelAttributes = z.infer<typeof ParcelAttributesSchema>;

export const ImportSourceSchema = z.object({
  format: z.enum(["geojson", "kml", "kmz", "shapefile", "csv", "gpx", "drawn"]),
  fileName: z.string().optional(),
  /** EPSG code of the original data, before reprojection to WGS84. */
  crs: z.string().optional(),
});

/** An existing piece of land. Read-only once imported: scenarios never modify it. */
export const OriginalParcelSchema = z.object({
  id: IdSchema,
  label: z.string(),
  geometry: AreaGeometrySchema,
  attributes: ParcelAttributesSchema,
  source: ImportSourceSchema.optional(),
});
export type OriginalParcel = z.infer<typeof OriginalParcelSchema>;

export const PropertySchema = z.object({
  parcels: z.array(OriginalParcelSchema),
});
export type Property = z.infer<typeof PropertySchema>;

/** Shares are kept exact: fractions are the norm in inheritance (1/8, 2/3, 7/24…). */
export const ShareSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("fraction"),
    numerator: z.number().int().min(0),
    denominator: z.number().int().min(1),
  }),
  z.object({ mode: z.literal("percent"), value: z.number().min(0).max(100) }),
  z.object({ mode: z.literal("area"), m2: z.number().min(0) }),
]);
export type Share = z.infer<typeof ShareSchema>;

export const BeneficiarySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  color: ColorSchema,
  share: ShareSchema,
  notes: z.string().optional(),
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;

/** A proposed piece of land inside a scenario, optionally assigned to one beneficiary. */
export const LotSchema = z.object({
  id: IdSchema,
  label: z.string(),
  geometry: PolygonSchema,
  beneficiaryId: IdSchema.nullable(),
  locked: z.boolean(),
  notes: z.string().optional(),
});
export type Lot = z.infer<typeof LotSchema>;

export const ScenarioStatusSchema = z.enum(["draft", "proposed", "agreed"]);
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;

export const ScenarioSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  status: ScenarioStatusSchema,
  method: z.enum(["manual", "autosplit-area", "autosplit-value"]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  lots: z.array(LotSchema),
  notes: z.string().optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ValueZoneSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  color: ColorSchema,
  geometry: AreaGeometrySchema,
  mode: z.enum(["perM2", "multiplier"]),
  value: z.number().min(0),
});
export type ValueZone = z.infer<typeof ValueZoneSchema>;

export const AssetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  kind: z.enum(["well", "building", "trees", "infrastructure", "other"]),
  geometry: z.discriminatedUnion("type", [PointSchema, PolygonSchema]),
  value: z.number().min(0),
});
export type Asset = z.infer<typeof AssetSchema>;

export const FrontageLineSchema = z.object({
  id: IdSchema,
  name: z.string(),
  geometry: LineStringSchema,
});
export type FrontageLine = z.infer<typeof FrontageLineSchema>;

export const MapViewSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  zoom: z.number(),
  basemap: BasemapIdSchema,
});
export type MapView = z.infer<typeof MapViewSchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  settings: ProjectSettingsSchema,
  property: PropertySchema,
  beneficiaries: z.array(BeneficiarySchema),
  scenarios: z.array(ScenarioSchema),
  valueZones: z.array(ValueZoneSchema),
  assets: z.array(AssetSchema),
  frontageLines: z.array(FrontageLineSchema),
  mapView: MapViewSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Lightweight row for the project list. */
export type ProjectSummary = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  parcelCount: number;
  propertyAreaM2: number;
  beneficiaryCount: number;
  scenarioCount: number;
};
