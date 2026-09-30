"use client";

import type { Position } from "@/domain/model/geojson";
import type { ImportCandidate } from "@/io/import/types";

type Props = {
  candidates: ImportCandidate[];
  selected: Set<string>;
  onToggle: (key: string) => void;
};

const SIZE = 240;
const PAD = 12;

/**
 * Lightweight SVG preview (no tiles): shape check before import.
 * Equirectangular projection scaled by cos(latitude) keeps shapes undistorted locally.
 */
export function ImportPreviewMap({ candidates, selected, onToggle }: Props) {
  const points = candidates.flatMap((c) => rings(c).flat());
  if (points.length === 0) return null;
  const lats = points.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p[0] * k);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = (SIZE - 2 * PAD) / Math.max(maxX - minX, maxY - minY, 1e-9);
  const offX = (SIZE - (maxX - minX) * scale) / 2;
  const offY = (SIZE - (maxY - minY) * scale) / 2;
  const project = ([lng, lat]: Position) =>
    `${(offX + (lng * k - minX) * scale).toFixed(1)},${(offY + (maxY - lat) * scale).toFixed(1)}`;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="aspect-square w-full rounded-lg border bg-muted/40"
      role="img"
      aria-hidden
    >
      {candidates.map((c) => {
        const on = selected.has(c.key);
        const d = rings(c)
          .map((ring) => `M${ring.map(project).join("L")}Z`)
          .join(" ");
        return (
          <path
            key={c.key}
            d={d}
            fillRule="evenodd"
            onClick={() => onToggle(c.key)}
            className="cursor-pointer transition-colors"
            fill={on ? "rgb(22 163 74 / 0.25)" : "rgb(120 120 120 / 0.08)"}
            stroke={c.selfIntersects ? "#dc2626" : on ? "#15803d" : "#9ca3af"}
            strokeWidth={1.5}
            strokeDasharray={on ? undefined : "4 3"}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function rings(c: ImportCandidate): Position[][] {
  return c.geometry.type === "Polygon" ? c.geometry.coordinates : c.geometry.coordinates.flat();
}
