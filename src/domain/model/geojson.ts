import { z } from "zod";

/** [longitude, latitude] in WGS84 (EPSG:4326). An optional 3rd value (elevation) is tolerated. */
export const PositionSchema = z
  .array(z.number().finite())
  .min(2)
  .max(3)
  .refine(([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, {
    message: "Coordinates must be WGS84 longitude/latitude",
  });

const LinearRingSchema = z.array(PositionSchema).min(4);

export const PointSchema = z.object({
  type: z.literal("Point"),
  coordinates: PositionSchema,
});

export const LineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(PositionSchema).min(2),
});

export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(LinearRingSchema).min(1),
});

export const MultiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(LinearRingSchema).min(1)).min(1),
});

export const AreaGeometrySchema = z.discriminatedUnion("type", [PolygonSchema, MultiPolygonSchema]);

export type Position = GeoJSON.Position;
export type Point = GeoJSON.Point;
export type LineString = GeoJSON.LineString;
export type Polygon = GeoJSON.Polygon;
export type MultiPolygon = GeoJSON.MultiPolygon;
export type AreaGeometry = Polygon | MultiPolygon;
