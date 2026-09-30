"use client";

import { pointOnFeature } from "@turf/turf";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import { collectEdges, collectVertices } from "@/domain/geometry/topology";
import type { AreaUnit, Beneficiary, Lot } from "@/domain/model/project";
import { formatArea } from "@/domain/units";

export const LOT_FILL_LAYER = "lot-fill";
export const LOT_VERTEX_LAYER = "lot-vertices";
export const LOT_MIDPOINT_LAYER = "lot-midpoints";
const LABEL_MIN_ZOOM = 13;
const UNASSIGNED = "#22d3ee";

type Props = {
  lots: Lot[];
  beneficiaries: Beneficiary[];
  selectedIds: string[];
  areaUnit: AreaUnit;
  zoom: number;
  /** Show vertex/midpoint handles for the selected lots. */
  editable: boolean;
};

export function LotsLayer({ lots, beneficiaries, selectedIds, areaUnit, zoom, editable }: Props) {
  const locale = useLocale();
  const colorOf = useMemo(
    () => new Map(beneficiaries.map((b) => [b.id, b.color])),
    [beneficiaries],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const lotsData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: lots.map((l) => ({
        type: "Feature",
        properties: {
          id: l.id,
          color: (l.beneficiaryId && colorOf.get(l.beneficiaryId)) || UNASSIGNED,
          selected: selected.has(l.id),
          locked: l.locked,
        },
        geometry: l.geometry,
      })),
    }),
    [lots, colorOf, selected],
  );

  const handles = useMemo<{
    vertices: GeoJSON.FeatureCollection;
    midpoints: GeoJSON.FeatureCollection;
  }>(() => {
    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!editable || selected.size === 0) return { vertices: empty, midpoints: empty };
    return {
      vertices: {
        type: "FeatureCollection",
        features: collectVertices(lots, selected).map((v) => ({
          type: "Feature",
          properties: { key: v.key, locked: v.locked, shared: v.lotIds.length > 1 },
          geometry: { type: "Point", coordinates: v.position },
        })),
      },
      midpoints: {
        type: "FeatureCollection",
        features: collectEdges(lots, selected)
          .filter((e) => !e.locked)
          .map((e) => ({
            type: "Feature",
            properties: { a: e.a, b: e.b },
            geometry: { type: "Point", coordinates: e.midpoint },
          })),
      },
    };
  }, [lots, selected, editable]);

  const labels = useMemo(
    () =>
      lots.map((l) => {
        const [lng, lat] = pointOnFeature(l.geometry).geometry.coordinates;
        return {
          id: l.id,
          lng,
          lat,
          label: l.label,
          area: geometryAreaM2(l.geometry),
          locked: l.locked,
        };
      }),
    [lots],
  );

  return (
    <>
      <Source id="lots" type="geojson" data={lotsData}>
        <Layer
          id={LOT_FILL_LAYER}
          type="fill"
          paint={{
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["get", "selected"], 0.45, 0.28],
          }}
        />
        <Layer
          id="lot-casing"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{ "line-color": "#0f172a", "line-width": 4, "line-opacity": 0.7 }}
        />
        <Layer
          id="lot-outline"
          type="line"
          layout={{ "line-join": "round" }}
          paint={{
            "line-color": ["case", ["get", "selected"], "#facc15", "#ffffff"],
            "line-width": ["case", ["get", "selected"], 3, 2],
          }}
        />
        <Layer
          id="lot-locked-outline"
          type="line"
          filter={["==", ["get", "locked"], true]}
          paint={{ "line-color": "#0f172a", "line-width": 2, "line-dasharray": [2, 2] }}
        />
      </Source>
      <Source id="lot-midpoints" type="geojson" data={handles.midpoints}>
        <Layer
          id={LOT_MIDPOINT_LAYER}
          type="circle"
          paint={{
            "circle-radius": 4,
            "circle-color": "#facc15",
            "circle-opacity": 0.75,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1,
          }}
        />
      </Source>
      <Source id="lot-vertices" type="geojson" data={handles.vertices}>
        <Layer
          id={LOT_VERTEX_LAYER}
          type="circle"
          paint={{
            "circle-radius": ["case", ["get", "shared"], 6.5, 5.5],
            "circle-color": ["case", ["get", "locked"], "#94a3b8", "#ffffff"],
            "circle-stroke-color": ["case", ["get", "shared"], "#f97316", "#0f172a"],
            "circle-stroke-width": 2,
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
            <div className="max-w-40 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] leading-tight text-white shadow">
              <div className="truncate font-medium">
                {l.locked ? "🔒 " : ""}
                {l.label}
              </div>
              <div className="tabular-nums opacity-90" data-testid="lot-map-area">
                {formatArea(l.area, areaUnit, locale)}
              </div>
            </div>
          </Marker>
        ))}
    </>
  );
}
