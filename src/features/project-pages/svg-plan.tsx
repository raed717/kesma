import { pointOnFeature } from "@turf/turf";
import type { AreaGeometry, LineString, Position } from "@/domain/model/geojson";

/**
 * Vector plan for the printable report: crisp at any print resolution and independent of
 * map tiles/WebGL. Web Mercator projection (same shapes as on the map), north up.
 */

export type PlanShape = {
  id: string;
  geometry: AreaGeometry;
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  /** Up to two label lines, drawn when the shape is big enough on paper. */
  label?: [string, string?];
};

type Props = {
  /** Shapes drawn bottom to top. The first layer defines the extent. */
  layers: PlanShape[][];
  lines?: { id: string; geometry: LineString; color: string }[];
  width?: number;
  height?: number;
  /** "N" in the reader's language. */
  northLabel: string;
  formatLength: (metres: number) => string;
  title?: string;
};

const EARTH_RADIUS = 6_378_137;
const PAD = 24;

function project([lon, lat]: Position): [number, number] {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

function rings(g: AreaGeometry): Position[][] {
  return g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
}

/** 1, 2 or 5 × 10ⁿ, the largest not above `max`. */
export function niceLength(max: number): number {
  const p = 10 ** Math.floor(Math.log10(max));
  return [5, 2, 1].map((m) => m * p).find((v) => v <= max) ?? p;
}

export function SvgPlan({
  layers,
  lines = [],
  width = 680,
  height = 460,
  northLabel,
  formatLength,
  title,
}: Props) {
  const extentShapes = layers.find((l) => l.length > 0) ?? [];
  const pts = extentShapes.flatMap((s) => rings(s.geometry).flat().map(project));
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const spanX = Math.max(maxX - minX, 1e-12);
  const spanY = Math.max(maxY - minY, 1e-12);
  const scale = Math.min((width - 2 * PAD) / spanX, (height - 2 * PAD - 28) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - 28 - spanY * scale) / 2;
  const toSvg = (pos: Position): [number, number] => {
    const [x, y] = project(pos);
    return [offX + (x - minX) * scale, offY + (maxY - y) * scale];
  };
  const path = (g: AreaGeometry) =>
    rings(g)
      .map(
        (ring) =>
          ring
            .map(
              (p, i) =>
                `${i ? "L" : "M"}${toSvg(p)
                  .map((v) => v.toFixed(1))
                  .join(" ")}`,
            )
            .join("") + "Z",
      )
      .join("");

  // Scale bar: metres per SVG unit at the plan's centre latitude.
  const centreLat = 2 * Math.atan(Math.exp((minY + maxY) / 2)) - Math.PI / 2;
  const metresPerUnit = (EARTH_RADIUS * Math.cos(centreLat)) / scale;
  const barMetres = niceLength(metresPerUnit * width * 0.25);
  const barWidth = barMetres / metresPerUnit;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={title}
      style={{ direction: "ltr" }}
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {layers.map((layer, li) => (
        <g key={li}>
          {layer.map((s) => (
            <path
              key={s.id}
              d={path(s.geometry)}
              fill={s.fill}
              fillOpacity={s.fillOpacity ?? 0.35}
              fillRule="evenodd"
              stroke={s.stroke ?? "#0f172a"}
              strokeWidth={s.strokeWidth ?? 1.2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
      {lines.map((l) => (
        <polyline
          key={l.id}
          points={l.geometry.coordinates.map((p) => toSvg(p).join(",")).join(" ")}
          fill="none"
          stroke={l.color}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      {layers.flat().map((s) => {
        if (!s.label) return null;
        const [x0, y0, x1, y1] = bboxSvg(rings(s.geometry), toSvg);
        if (x1 - x0 < 34 || y1 - y0 < 18) return null;
        const [x, y] = toSvg(pointOnFeature(s.geometry).geometry.coordinates);
        const size = Math.max(8, Math.min(13, (x1 - x0) / 8));
        return (
          <text
            key={`l-${s.id}`}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize={size}
            fill="#0f172a"
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
            style={{ unicodeBidi: "plaintext" }}
          >
            <tspan x={x} dy={s.label[1] ? -size * 0.2 : size * 0.35} fontWeight={600}>
              {s.label[0]}
            </tspan>
            {s.label[1] && (
              <tspan x={x} dy={size * 1.15}>
                {s.label[1]}
              </tspan>
            )}
          </text>
        );
      })}
      {/* North arrow */}
      <g transform={`translate(${width - 26} 30)`}>
        <path d="M0 -18 L8 6 L0 1 L-8 6 Z" fill="#0f172a" />
        <text y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a">
          {northLabel}
        </text>
      </g>
      {/* Scale bar */}
      <g transform={`translate(${PAD} ${height - 18})`}>
        <rect x={0} y={-5} width={barWidth / 2} height={5} fill="#0f172a" />
        <rect
          x={barWidth / 2}
          y={-5}
          width={barWidth / 2}
          height={5}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth={1}
        />
        <text x={0} y={10} fontSize={9} fill="#0f172a">
          0
        </text>
        <text x={barWidth} y={10} fontSize={9} textAnchor="middle" fill="#0f172a">
          {formatLength(barMetres)}
        </text>
      </g>
    </svg>
  );
}

function bboxSvg(rs: Position[][], toSvg: (p: Position) => [number, number]) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of rs.flat()) {
    const [x, y] = toSvg(p);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
