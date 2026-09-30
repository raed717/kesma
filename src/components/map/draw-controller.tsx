"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { TerraDraw, TerraDrawPolygonMode, ValidateNotSelfIntersecting } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Polygon } from "@/domain/model/geojson";

type Props = {
  /** Called once with the finished polygon (WGS84). */
  onComplete: (polygon: Polygon) => void;
};

const COLOR = "#facc15";

/**
 * Mounted only while drawing: creates a Terra Draw session in polygon mode and tears it
 * down on unmount. Enter or clicking the first/last point finishes; Escape cancels the
 * current shape.
 */
export function DrawController({ onComplete }: Props) {
  const { current: mapRef } = useMap();
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({
          validation: (feature) => ValidateNotSelfIntersecting(feature),
          styles: {
            fillColor: COLOR,
            fillOpacity: 0.25,
            outlineColor: COLOR,
            outlineWidth: 2.5,
            closingPointColor: "#ffffff",
            closingPointOutlineColor: COLOR,
            closingPointWidth: 6,
            closingPointOutlineWidth: 2,
          },
        }),
      ],
    });
    draw.start();
    draw.setMode("polygon");
    draw.on("finish", (id, context) => {
      if (context.action !== "draw") return;
      const feature = draw.getSnapshotFeature(id);
      if (feature?.geometry.type === "Polygon") {
        onCompleteRef.current(feature.geometry as Polygon);
      }
      draw.clear();
    });
    return () => {
      try {
        draw.stop();
      } catch {
        // The map may already be gone when the workspace unmounts.
      }
    };
  }, [mapRef]);

  return null;
}
