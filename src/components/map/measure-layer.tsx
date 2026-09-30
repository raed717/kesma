"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { Position } from "@/domain/model/geojson";
import { closeRing } from "@/domain/geometry/measure";
import type { MapTool } from "@/store/map-ui-store";

const MEASURE_COLOR = "#f59e0b";

type Props = {
  tool: MapTool;
  points: Position[];
  hover: Position | null;
  finished: boolean;
};

export function MeasureLayer({ tool, points, hover, finished }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection>(() => {
    const path = !finished && hover ? [...points, hover] : points;
    const features: GeoJSON.Feature[] = points.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: p },
    }));
    if (tool === "measure-area" && path.length >= 3) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [closeRing(path)] },
      });
    } else if (path.length >= 2) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: path },
      });
    }
    return { type: "FeatureCollection", features };
  }, [tool, points, hover, finished]);

  return (
    <Source id="measure" type="geojson" data={data}>
      <Layer
        id="measure-fill"
        type="fill"
        filter={["==", ["geometry-type"], "Polygon"]}
        paint={{ "fill-color": MEASURE_COLOR, "fill-opacity": 0.15 }}
      />
      <Layer
        id="measure-line"
        type="line"
        filter={["!=", ["geometry-type"], "Point"]}
        paint={{ "line-color": MEASURE_COLOR, "line-width": 2.5, "line-dasharray": [2, 1.5] }}
      />
      <Layer
        id="measure-points"
        type="circle"
        filter={["==", ["geometry-type"], "Point"]}
        paint={{
          "circle-radius": 4.5,
          "circle-color": "#ffffff",
          "circle-stroke-color": MEASURE_COLOR,
          "circle-stroke-width": 2,
        }}
      />
    </Source>
  );
}
