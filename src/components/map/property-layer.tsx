"use client";

import { pointOnFeature } from "@turf/turf";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import type { AreaUnit, OriginalParcel } from "@/domain/model/project";
import { formatArea } from "@/domain/units";

export const PROPERTY_FILL_LAYER = "property-fill";
const LABEL_MIN_ZOOM = 13;

type Props = {
  parcels: OriginalParcel[];
  selectedId: string | null;
  areaUnit: AreaUnit;
  zoom: number;
  interactive: boolean;
};

export function PropertyLayer({ parcels, selectedId, areaUnit, zoom, interactive }: Props) {
  const locale = useLocale();

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: parcels.map((p) => ({
        type: "Feature",
        id: p.id,
        properties: { id: p.id, selected: p.id === selectedId },
        geometry: p.geometry,
      })),
    }),
    [parcels, selectedId],
  );

  const labels = useMemo(
    () =>
      parcels.map((p) => {
        const [lng, lat] = pointOnFeature(p.geometry).geometry.coordinates;
        return { id: p.id, lng, lat, label: p.label, area: geometryAreaM2(p.geometry) };
      }),
    [parcels],
  );

  return (
    <>
      <Source id="property" type="geojson" data={data}>
        <Layer
          id={PROPERTY_FILL_LAYER}
          type="fill"
          paint={{
            "fill-color": ["case", ["get", "selected"], "#facc15", "#ffffff"],
            "fill-opacity": ["case", ["get", "selected"], 0.3, interactive ? 0.18 : 0.08],
          }}
        />
        <Layer
          id="property-casing"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{ "line-color": "#14532d", "line-width": 4.5, "line-opacity": 0.8 }}
        />
        <Layer
          id="property-outline"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{
            "line-color": ["case", ["get", "selected"], "#facc15", "#ffffff"],
            "line-width": 2.5,
          }}
        />
      </Source>
      {zoom >= LABEL_MIN_ZOOM &&
        labels.map((l) => (
          <Marker
            key={l.id}
            longitude={l.lng}
            latitude={l.lat}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <div className="max-w-40 rounded-md bg-black/65 px-2 py-1 text-center text-[11px] leading-tight text-white shadow">
              {l.label && <div className="truncate font-medium">{l.label}</div>}
              <div className="tabular-nums opacity-90">{formatArea(l.area, areaUnit, locale)}</div>
            </div>
          </Marker>
        ))}
    </>
  );
}
