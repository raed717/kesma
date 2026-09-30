import type { StyleSpecification } from "maplibre-gl";
import type { BasemapId } from "@/domain/model/project";
import { BASEMAPS, type RasterLayerDef } from "./basemaps";

/**
 * One constant style holding every basemap; only visibility changes between them.
 * With react-map-gl style diffing this becomes a cheap `setLayoutProperty`, and overlay
 * layers added later always stay on top of the basemap.
 */
export function buildMapStyle(active: BasemapId): StyleSpecification {
  const all = new Map<string, RasterLayerDef>();
  Object.values(BASEMAPS)
    .flat()
    .forEach((def) => all.set(def.id, def));
  const visible = new Set(BASEMAPS[active].map((d) => d.id));

  return {
    version: 8,
    sources: Object.fromEntries(
      [...all.values()].map((def) => [
        def.id,
        {
          type: "raster",
          tiles: def.tiles,
          tileSize: def.tileSize,
          maxzoom: def.maxzoom,
          attribution: def.attribution,
        },
      ]),
    ),
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#e8e4d8" } },
      ...[...all.values()].map((def) => ({
        id: `basemap-${def.id}`,
        type: "raster" as const,
        source: def.id,
        layout: { visibility: visible.has(def.id) ? ("visible" as const) : ("none" as const) },
      })),
    ],
  };
}
