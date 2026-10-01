"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { bbox, feature, featureCollection } from "@turf/turf";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useLocale } from "next-intl";
import { useMemo, useRef, useState } from "react";
import Map, {
  AttributionControl,
  NavigationControl,
  ScaleControl,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { BasemapSwitcher } from "@/components/map/basemap-switcher";
import { DEFAULT_VIEW } from "@/components/map/basemaps";
import { LotsLayer } from "@/components/map/lots-layer";
import { buildMapStyle } from "@/components/map/map-style";
import { maplibregl } from "@/components/map/maplibre-setup";
import { PropertyLayer } from "@/components/map/property-layer";
import type { BasemapId, Project, Scenario } from "@/domain/model/project";
import { localeDirection } from "@/i18n/config";

type Side = 0 | 1;
const NO_SELECTION: string[] = [];

type Props = {
  project: Project;
  scenarios: [Scenario | null, Scenario | null];
  /** Rendered above each map (scenario picker, summary). */
  headers: [React.ReactNode, React.ReactNode];
};

/**
 * Two read-only maps kept on the same view. The map under the pointer drives the other
 * one, so their move events never feed back into each other.
 */
export default function CompareMaps({ project, scenarios, headers }: Props) {
  const rtl = localeDirection(useLocale()) === "rtl";
  const refs = useRef<[MapRef | null, MapRef | null]>([null, null]);
  const driver = useRef<Side>(0);
  const [zoom, setZoom] = useState<[number, number]>([DEFAULT_VIEW.zoom, DEFAULT_VIEW.zoom]);
  const [basemap, setBasemap] = useState<BasemapId>(project.mapView?.basemap ?? "satellite");
  const mapStyle = useMemo(() => buildMapStyle(basemap), [basemap]);
  const [initialViewState] = useState(() => fitProperty(project));

  function onMove(side: Side, e: ViewStateChangeEvent) {
    if (driver.current !== side) return;
    const other = refs.current[side === 0 ? 1 : 0];
    const { longitude, latitude, zoom: z, bearing, pitch } = e.viewState;
    other?.jumpTo({ center: [longitude, latitude], zoom: z, bearing, pitch });
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
      {([0, 1] as const).map((side) => (
        <section
          key={side}
          className="flex min-h-[18rem] flex-col overflow-hidden rounded-lg border"
        >
          <div className="border-b bg-background p-2">{headers[side]}</div>
          <div
            className="relative min-h-0 flex-1"
            onPointerEnter={() => (driver.current = side)}
            onPointerDown={() => (driver.current = side)}
            onWheel={() => (driver.current = side)}
            onFocus={() => (driver.current = side)}
            data-testid={`compare-map-${side === 0 ? "a" : "b"}`}
          >
            <Map
              ref={(r) => {
                refs.current[side] = r;
                // Dev-only handle for debugging / automated checks (as `__kesmaMap`).
                if (process.env.NODE_ENV !== "production" && r) {
                  const w = window as unknown as { __kesmaCompareMaps?: unknown[] };
                  (w.__kesmaCompareMaps ??= [])[side] = r.getMap();
                }
              }}
              mapLib={maplibregl}
              initialViewState={initialViewState}
              mapStyle={mapStyle}
              attributionControl={false}
              maxZoom={21}
              // Fit once the pane has its final size (bounds in initialViewState may be
              // applied while the layout is still settling).
              onLoad={(e) => fitTo(e.target, project)}
              onMove={(e) => onMove(side, e)}
              onMoveEnd={(e) =>
                setZoom((z) => (side === 0 ? [e.viewState.zoom, z[1]] : [z[0], e.viewState.zoom]))
              }
              style={{ width: "100%", height: "100%" }}
            >
              <NavigationControl position={rtl ? "top-left" : "top-right"} showCompass={false} />
              <ScaleControl position={rtl ? "bottom-left" : "bottom-right"} unit="metric" />
              <AttributionControl position={rtl ? "bottom-left" : "bottom-right"} compact />
              <PropertyLayer
                parcels={project.property.parcels}
                selectedId={null}
                areaUnit={project.settings.areaUnit}
                zoom={zoom[side]}
                interactive={false}
                showLabels={!scenarios[side]}
              />
              {scenarios[side] && (
                <LotsLayer
                  lots={scenarios[side].lots}
                  beneficiaries={project.beneficiaries}
                  selectedIds={NO_SELECTION}
                  areaUnit={project.settings.areaUnit}
                  zoom={zoom[side]}
                  editable={false}
                />
              )}
            </Map>
            {side === 0 && (
              <div className="absolute inset-s-2 bottom-2">
                <BasemapSwitcher value={basemap} onChange={setBasemap} />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function fitTo(map: MaplibreMap, project: Project) {
  const geometries = project.property.parcels.map((p) => p.geometry);
  if (geometries.length === 0) return;
  const [w, s, e, n] = bbox(featureCollection(geometries.map((g) => feature(g))));
  map.resize();
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 40, maxZoom: 18, duration: 0 },
  );
}

function fitProperty(project: Project) {
  const geometries = project.property.parcels.map((p) => p.geometry);
  if (geometries.length === 0) return project.mapView ?? DEFAULT_VIEW;
  const [w, s, e, n] = bbox(featureCollection(geometries.map((g) => feature(g))));
  return {
    ...DEFAULT_VIEW,
    bounds: [w, s, e, n] as [number, number, number, number],
    fitBoundsOptions: { padding: 40, maxZoom: 18 },
  };
}
