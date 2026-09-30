"use client";

import { centroid } from "@turf/turf";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { ValidationIssue } from "@/domain/validation";

export const ISSUE_COLORS = {
  error: "#ef4444",
  gap: "#f97316",
  unassigned: "#f59e0b",
} as const;

type Props = {
  issues: ValidationIssue[];
  selectedId: string | null;
  /** Render below this layer (keeps lot vertex handles on top and draggable). */
  beforeId?: string;
};

/**
 * Highlights validation problems: overlaps / outside parts / invalid lots in red, gaps in
 * orange, unassigned lots with an amber dashed outline. Slivers (too small to see) and
 * self-intersection points get a marker dot.
 */
export function IssuesLayer({ issues, selectedId, beforeId }: Props) {
  const data = useMemo(() => {
    const areas: GeoJSON.Feature[] = [];
    const points: GeoJSON.Feature[] = [];
    for (const issue of issues) {
      const color =
        issue.kind === "gap"
          ? ISSUE_COLORS.gap
          : issue.kind === "unassigned"
            ? ISSUE_COLORS.unassigned
            : ISSUE_COLORS.error;
      const props = {
        id: issue.id,
        color,
        selected: issue.id === selectedId,
        outlineOnly: issue.kind === "unassigned",
      };
      if (issue.geometry)
        areas.push({ type: "Feature", properties: props, geometry: issue.geometry });
      const marker =
        issue.location ??
        (issue.sliver && issue.geometry ? centroid(issue.geometry).geometry.coordinates : null);
      if (marker)
        points.push({
          type: "Feature",
          properties: props,
          geometry: { type: "Point", coordinates: marker },
        });
    }
    return {
      areas: { type: "FeatureCollection", features: areas } as GeoJSON.FeatureCollection,
      points: { type: "FeatureCollection", features: points } as GeoJSON.FeatureCollection,
    };
  }, [issues, selectedId]);

  return (
    <>
      <Source id="issues" type="geojson" data={data.areas}>
        <Layer
          beforeId={beforeId}
          id="issue-fill"
          type="fill"
          filter={["!", ["get", "outlineOnly"]]}
          paint={{
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["get", "selected"], 0.7, 0.45],
          }}
        />
        <Layer
          beforeId={beforeId}
          id="issue-outline"
          type="line"
          filter={["!", ["get", "outlineOnly"]]}
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "selected"], 3.5, 2],
          }}
        />
        <Layer
          beforeId={beforeId}
          id="issue-unassigned"
          type="line"
          filter={["get", "outlineOnly"]}
          paint={{
            "line-color": ISSUE_COLORS.unassigned,
            "line-width": ["case", ["get", "selected"], 4, 2.5],
            "line-dasharray": [1.5, 1.5],
          }}
        />
      </Source>
      <Source id="issue-points" type="geojson" data={data.points}>
        <Layer
          beforeId={beforeId}
          id="issue-points"
          type="circle"
          paint={{
            "circle-radius": ["case", ["get", "selected"], 9, 7],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          }}
        />
      </Source>
    </>
  );
}
