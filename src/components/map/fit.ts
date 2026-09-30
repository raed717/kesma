import { bbox, featureCollection, feature } from "@turf/turf";
import type { MapRef } from "react-map-gl/maplibre";
import type { AreaGeometry } from "@/domain/model/geojson";

export const MAIN_MAP_ID = "main";

export function fitToGeometries(
  map: MapRef | undefined,
  geometries: AreaGeometry[],
  options: { animate?: boolean; maxZoom?: number } = {},
) {
  if (!map || geometries.length === 0) return;
  const [w, s, e, n] = bbox(featureCollection(geometries.map((g) => feature(g))));
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 60, maxZoom: options.maxZoom ?? 18, duration: options.animate === false ? 0 : 800 },
  );
}
