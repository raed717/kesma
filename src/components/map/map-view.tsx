"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { bbox, feature, featureCollection } from "@turf/turf";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/i18n/config";
import { useCallback, useEffect, useMemo, useState } from "react";
import Map, {
  AttributionControl,
  GeolocateControl,
  NavigationControl,
  ScaleControl,
  type MapLayerMouseEvent,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { createParcel, nextParcelLabel } from "@/domain/model/factories";
import type { Polygon, Position } from "@/domain/model/geojson";
import type { BasemapId, Project } from "@/domain/model/project";
import { isMeasureTool, useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { BasemapSwitcher } from "./basemap-switcher";
import { DEFAULT_VIEW } from "./basemaps";
import { DrawController } from "./draw-controller";
import { DrawPanel } from "./draw-panel";
import { MAIN_MAP_ID } from "./fit";
import { buildMapStyle } from "./map-style";
import { maplibregl } from "./maplibre-setup";
import { MapToolbar } from "./map-toolbar";
import { MeasureLayer } from "./measure-layer";
import { MeasurePanel } from "./measure-panel";
import { PROPERTY_FILL_LAYER, PropertyLayer } from "./property-layer";

export default function MapView() {
  const t = useTranslations("property");
  const rtl = localeDirection(useLocale()) === "rtl";
  const project = useWorkspaceStore((s) => s.project);
  const update = useWorkspaceStore((s) => s.update);
  const {
    tool,
    measurePoints,
    measureFinished,
    addMeasurePoint,
    finishMeasure,
    selectedParcelId,
    selectParcel,
    setTool,
  } = useMapUiStore();
  const [hover, setHover] = useState<Position | null>(null);
  const [hoverParcel, setHoverParcel] = useState(false);

  const basemap: BasemapId = project?.mapView?.basemap ?? "satellite";
  const mapStyle = useMemo(() => buildMapStyle(basemap), [basemap]);
  // Read once: the map owns the viewport afterwards (uncontrolled), we only persist it.
  const [initialViewState] = useState(() => initialView(project));
  const [zoom, setZoom] = useState(initialViewState.zoom ?? DEFAULT_VIEW.zoom);

  const measuring = isMeasureTool(tool);
  const drawing = tool === "draw-property";
  const parcels = useMemo(() => project?.property.parcels ?? [], [project?.property.parcels]);

  const setBasemap = useCallback(
    (id: BasemapId) =>
      update(
        (draft) => {
          draft.mapView = { ...(draft.mapView ?? { ...DEFAULT_VIEW }), basemap: id };
        },
        { touch: false },
      ),
    [update],
  );

  const onMoveEnd = useCallback(
    ({ viewState }: ViewStateChangeEvent) => {
      setZoom(viewState.zoom);
      update(
        (draft) => {
          draft.mapView = {
            longitude: round(viewState.longitude, 6),
            latitude: round(viewState.latitude, 6),
            zoom: round(viewState.zoom, 2),
            basemap: draft.mapView?.basemap ?? "satellite",
          };
        },
        { touch: false },
      );
    },
    [update],
  );

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (measuring) return addMeasurePoint([e.lngLat.lng, e.lngLat.lat]);
      if (tool !== "pan") return;
      const id = e.features?.find((f) => f.layer.id === PROPERTY_FILL_LAYER)?.properties?.id;
      selectParcel(typeof id === "string" ? id : null);
    },
    [measuring, tool, addMeasurePoint, selectParcel],
  );

  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (measuring && !measureFinished) setHover([e.lngLat.lng, e.lngLat.lat]);
    },
    [measuring, measureFinished],
  );

  const onDrawComplete = useCallback(
    (polygon: Polygon) => {
      const parcel = createParcel({
        label: nextParcelLabel(
          useWorkspaceStore.getState().project?.property.parcels ?? [],
          t("defaultLabel"),
        ),
        geometry: polygon,
        source: { format: "drawn" },
      });
      update((draft) => void draft.property.parcels.push(parcel), { immediate: true });
      setTool("pan");
      // The closing click still bubbles to the map's click handler (now in pan mode),
      // which would clear the selection: select on the next tick, after that click.
      setTimeout(() => selectParcel(parcel.id), 0);
    },
    [t, update, setTool, selectParcel],
  );

  useToolShortcuts(tool);

  return (
    <div className="relative size-full">
      <Map
        id={MAIN_MAP_ID}
        mapLib={maplibregl}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        interactiveLayerIds={tool === "pan" ? [PROPERTY_FILL_LAYER] : []}
        onLoad={(e) => {
          // Dev-only handle for debugging from the browser console / automated checks.
          if (process.env.NODE_ENV !== "production") {
            (window as unknown as { __kesmaMap?: unknown }).__kesmaMap = e.target;
          }
        }}
        onMoveEnd={onMoveEnd}
        onClick={onClick}
        onDblClick={measuring ? finishMeasure : undefined}
        onMouseMove={onMouseMove}
        onMouseEnter={() => setHoverParcel(true)}
        onMouseLeave={() => setHoverParcel(false)}
        onMouseOut={() => setHover(null)}
        doubleClickZoom={tool === "pan"}
        cursor={measuring ? "crosshair" : tool === "pan" && hoverParcel ? "pointer" : undefined}
        attributionControl={false}
        maxZoom={21}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Our toolbar sits at the inline start; MapLibre controls take the opposite side. */}
        <NavigationControl position={rtl ? "top-left" : "top-right"} />
        <GeolocateControl position={rtl ? "top-left" : "top-right"} />
        <ScaleControl position={rtl ? "bottom-left" : "bottom-right"} unit="metric" />
        <AttributionControl position={rtl ? "bottom-left" : "bottom-right"} compact />
        <PropertyLayer
          parcels={parcels}
          selectedId={selectedParcelId}
          areaUnit={project?.settings.areaUnit ?? "ha"}
          zoom={zoom}
          interactive={tool === "pan"}
        />
        {measuring && (
          <MeasureLayer
            tool={tool}
            points={measurePoints}
            hover={hover}
            finished={measureFinished}
          />
        )}
        {drawing && <DrawController onComplete={onDrawComplete} />}
      </Map>

      <div className="pointer-events-none absolute inset-s-3 top-3 flex items-start gap-2">
        <div className="pointer-events-auto">
          <MapToolbar />
        </div>
        <div className="pointer-events-auto">
          <MeasurePanel areaUnit={project?.settings.areaUnit ?? "ha"} />
          {drawing && <DrawPanel />}
        </div>
      </div>

      <div className="absolute inset-s-3 bottom-3">
        <BasemapSwitcher value={basemap} onChange={setBasemap} />
      </div>
    </div>
  );
}

/** Saved view if any; otherwise fit the property; otherwise Tunisia. */
function initialView(project: Project | null) {
  if (project?.mapView) return project.mapView;
  const geometries = project?.property.parcels.map((p) => p.geometry) ?? [];
  if (geometries.length === 0) return DEFAULT_VIEW;
  const [w, s, e, n] = bbox(featureCollection(geometries.map((g) => feature(g))));
  return {
    ...DEFAULT_VIEW,
    bounds: [w, s, e, n] as [number, number, number, number],
    fitBoundsOptions: { padding: 60, maxZoom: 18 },
  };
}

function useToolShortcuts(tool: string) {
  useEffect(() => {
    if (tool === "pan") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const s = useMapUiStore.getState();
      if (s.tool === "draw-property") {
        // Terra Draw handles Enter (finish) itself; Escape leaves the drawing tool.
        if (e.key === "Escape") s.setTool("pan");
        return;
      }
      if (e.key === "Escape") {
        if (s.measurePoints.length) s.clearMeasure();
        else s.setTool("pan");
      } else if (e.key === "Enter") s.finishMeasure();
      else if (e.key === "Backspace") s.undoMeasurePoint();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);
}

function round(value: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
