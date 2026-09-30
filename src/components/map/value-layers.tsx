"use client";

import { pointOnFeature } from "@turf/turf";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { Asset, FrontageLine, ValueZone } from "@/domain/model/project";
import type { ValueItemRef } from "@/store/map-ui-store";

export const VALUE_ZONE_LAYER = "value-zone-fill";
export const ASSET_LAYER = "asset-points";
export const ASSET_AREA_LAYER = "asset-areas";
export const FRONTAGE_LAYER = "frontage-line";
export const FRONTAGE_COLOR = "#a855f7";
const ASSET_COLOR = "#0ea5e9";

function isSelected(selected: ValueItemRef | null, kind: ValueItemRef["kind"], id: string) {
  return selected?.kind === kind && selected.id === id;
}

type Props = {
  zones: ValueZone[];
  assets: Asset[];
  frontage: FrontageLine[];
  selected: ValueItemRef | null;
  /** Full display (editing values) vs. discreet context (scenario mode). */
  emphasis: "full" | "context";
  showLabels: boolean;
  /** Short label per zone, e.g. "×1.6" or "25 TND/m²". */
  zoneLabel: (z: ValueZone) => string;
};

export function ValueLayers({
  zones,
  assets,
  frontage,
  selected,
  emphasis,
  showLabels,
  zoneLabel,
}: Props) {
  const full = emphasis === "full";

  const zoneData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: zones.map((z) => ({
        type: "Feature",
        properties: { id: z.id, color: z.color, selected: isSelected(selected, "zone", z.id) },
        geometry: z.geometry,
      })),
    }),
    [zones, selected],
  );
  const assetPoints = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: assets
        .filter((a) => a.geometry.type === "Point")
        .map((a) => ({
          type: "Feature",
          properties: { id: a.id, selected: isSelected(selected, "asset", a.id) },
          geometry: a.geometry,
        })),
    }),
    [assets, selected],
  );
  const assetAreas = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: assets
        .filter((a) => a.geometry.type === "Polygon")
        .map((a) => ({
          type: "Feature",
          properties: { id: a.id, selected: isSelected(selected, "asset", a.id) },
          geometry: a.geometry,
        })),
    }),
    [assets, selected],
  );
  const frontageData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: frontage.map((f) => ({
        type: "Feature",
        properties: { id: f.id, selected: isSelected(selected, "frontage", f.id) },
        geometry: f.geometry,
      })),
    }),
    [frontage, selected],
  );
  const labels = useMemo(
    () =>
      showLabels
        ? [
            ...zones.map((z) => {
              const [lng, lat] = pointOnFeature(z.geometry).geometry.coordinates;
              return { key: `z-${z.id}`, lng, lat, text: `${z.name} · ${zoneLabel(z)}` };
            }),
            ...assets.map((a) => {
              const [lng, lat] = pointOnFeature(a.geometry).geometry.coordinates;
              return {
                key: `a-${a.id}`,
                lng,
                lat,
                text: a.name,
                offset: a.geometry.type === "Point",
              };
            }),
          ]
        : [],
    [zones, assets, showLabels, zoneLabel],
  );

  return (
    <>
      <Source id="value-zones" type="geojson" data={zoneData}>
        <Layer
          id={VALUE_ZONE_LAYER}
          type="fill"
          paint={{
            "fill-color": ["get", "color"],
            "fill-opacity": full ? ["case", ["get", "selected"], 0.5, 0.3] : 0,
          }}
        />
        <Layer
          id="value-zone-outline"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "selected"], 3.5, full ? 2 : 1.5],
            "line-dasharray": [3, 2],
          }}
        />
      </Source>
      <Source id="asset-areas" type="geojson" data={assetAreas}>
        <Layer
          id={ASSET_AREA_LAYER}
          type="fill"
          paint={{
            "fill-color": ASSET_COLOR,
            "fill-opacity": full ? ["case", ["get", "selected"], 0.45, 0.25] : 0.12,
          }}
        />
        <Layer
          id="asset-area-outline"
          type="line"
          paint={{ "line-color": ASSET_COLOR, "line-width": ["case", ["get", "selected"], 3, 1.5] }}
        />
      </Source>
      <Source id="frontage" type="geojson" data={frontageData}>
        <Layer
          id="frontage-casing"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#ffffff", "line-width": ["case", ["get", "selected"], 9, 7] }}
        />
        <Layer
          id={FRONTAGE_LAYER}
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": FRONTAGE_COLOR,
            "line-width": ["case", ["get", "selected"], 6, 4],
          }}
        />
      </Source>
      <Source id="asset-points" type="geojson" data={assetPoints}>
        <Layer
          id={ASSET_LAYER}
          type="circle"
          paint={{
            "circle-radius": ["case", ["get", "selected"], 9, 7],
            "circle-color": ASSET_COLOR,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5,
          }}
        />
      </Source>
      {labels.map((l) => (
        <Marker
          key={l.key}
          longitude={l.lng}
          latitude={l.lat}
          anchor={"offset" in l && l.offset ? "top" : "center"}
          offset={"offset" in l && l.offset ? [0, 10] : undefined}
          style={{ pointerEvents: "none" }}
        >
          <div className="max-w-40 truncate rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow">
            {l.text}
          </div>
        </Marker>
      ))}
    </>
  );
}
