"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  ValidateNotSelfIntersecting,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { LineString, Polygon } from "@/domain/model/geojson";
import { snapPosition, type SnapTargets } from "./snap";

type Props =
  | { mode: "polygon"; onComplete: (g: Polygon) => void; snapTargets?: SnapTargets }
  | { mode: "linestring"; onComplete: (g: LineString) => void; snapTargets?: SnapTargets };

const COLOR = "#facc15";

/**
 * Mounted only while drawing: a Terra Draw session in polygon or line mode, torn down on
 * unmount. Enter or clicking the first/last point finishes; Escape cancels the shape.
 * Optional snapping to existing vertices/edges (property boundary, other lots).
 */
export function DrawController(props: Props) {
  const { current: mapRef } = useMap();
  const onCompleteRef = useRef(props.onComplete);
  const snapRef = useRef(props.snapTargets);
  useEffect(() => {
    onCompleteRef.current = props.onComplete;
    snapRef.current = props.snapTargets;
  });
  const { mode } = props;

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    const snapping = {
      toCustom: (event: { lng: number; lat: number }) => {
        const targets = snapRef.current;
        if (!targets) return undefined;
        const r = snapPosition(map, [event.lng, event.lat], targets);
        return r.snapped ? r.position : undefined;
      },
    };
    const styles = {
      fillColor: COLOR,
      fillOpacity: 0.25,
      outlineColor: COLOR,
      outlineWidth: 2.5,
      closingPointColor: "#ffffff",
      closingPointOutlineColor: COLOR,
      closingPointWidth: 6,
      closingPointOutlineWidth: 2,
    } as const;
    const drawMode =
      mode === "polygon"
        ? new TerraDrawPolygonMode({
            snapping,
            validation: (feature) => ValidateNotSelfIntersecting(feature),
            styles,
          })
        : new TerraDrawLineStringMode({
            snapping,
            styles: { lineStringColor: COLOR, lineStringWidth: 3, closingPointColor: "#ffffff" },
          });
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [drawMode],
    });
    draw.start();
    draw.setMode(drawMode.mode);

    // Terra Draw listens for Enter/Escape on the canvas only. Focus often stays on the
    // side-panel button that started the tool, so focus the canvas and forward keys.
    const canvas = map.getCanvas();
    if (!canvas.hasAttribute("tabindex")) canvas.setAttribute("tabindex", "0");
    const focusCanvas = () => canvas.focus({ preventScroll: true });
    focusCanvas();
    canvas.addEventListener("pointerdown", focusCanvas);
    const forwardKeys = (e: KeyboardEvent) => {
      if (e.target === canvas || (e.key !== "Enter" && e.key !== "Escape")) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      canvas.dispatchEvent(new KeyboardEvent(e.type, { key: e.key, code: e.code, bubbles: true }));
    };
    window.addEventListener("keydown", forwardKeys);
    window.addEventListener("keyup", forwardKeys);
    draw.on("finish", (id, context) => {
      if (context.action !== "draw") return;
      const feature = draw.getSnapshotFeature(id);
      const type = feature?.geometry.type;
      if (
        (mode === "polygon" && type === "Polygon") ||
        (mode === "linestring" && type === "LineString")
      ) {
        (onCompleteRef.current as (g: Polygon | LineString) => void)(
          feature!.geometry as Polygon | LineString,
        );
      }
      draw.clear();
    });
    return () => {
      canvas.removeEventListener("pointerdown", focusCanvas);
      window.removeEventListener("keydown", forwardKeys);
      window.removeEventListener("keyup", forwardKeys);
      try {
        draw.stop();
      } catch {
        // The map may already be gone when the workspace unmounts.
      }
    };
  }, [mapRef, mode]);

  return null;
}
