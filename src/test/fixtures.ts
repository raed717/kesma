import { createProject } from "@/domain/model/factories";
import type { Polygon } from "@/domain/model/geojson";
import type { Project } from "@/domain/model/project";

let counter = 0;
export const fixedDeps = {
  now: () => new Date("2026-09-30T10:00:00.000Z"),
  id: () => `id-${++counter}`,
};

/**
 * ~100 m × 100 m square near Tunis. Built from metre offsets so its geodesic area
 * is ~10,000 m² (1 ha).
 */
export function squarePolygon(sizeM = 100, origin: [number, number] = [10.18, 36.8]): Polygon {
  const [lng, lat] = origin;
  const dLat = sizeM / 111_320;
  const dLng = sizeM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + dLng, lat],
        [lng + dLng, lat + dLat],
        [lng, lat + dLat],
        [lng, lat],
      ],
    ],
  };
}

export function sampleProject(overrides: Partial<Project> = {}): Project {
  const base = createProject({ name: "Famille Ben Ali — Succession 2026" }, fixedDeps);
  return {
    ...base,
    property: {
      parcels: [
        {
          id: "parcel-1",
          label: "P1",
          geometry: squarePolygon(),
          attributes: { roadAccess: true },
        },
      ],
    },
    beneficiaries: [
      {
        id: "b1",
        name: "Heir A",
        color: "#2563eb",
        share: { mode: "fraction", numerator: 1, denominator: 4 },
      },
    ],
    ...overrides,
  };
}
