import { newId, type FactoryDeps } from "./model/factories";
import type { Polygon } from "./model/geojson";
import type { Lot, OriginalParcel, Scenario } from "./model/project";

export function createLot(
  input: { label: string; geometry: Polygon; beneficiaryId?: string | null },
  deps: FactoryDeps = {},
): Lot {
  return {
    id: newId(deps),
    label: input.label,
    geometry: input.geometry,
    beneficiaryId: input.beneficiaryId ?? null,
    locked: false,
  };
}

/** "Lot 4"-style label that does not collide with existing lots. */
export function nextLotLabel(existing: { label: string }[], prefix: string, offset = 0): string {
  const used = new Set(existing.map((l) => l.label));
  let n = existing.length + 1 + offset;
  while (used.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

/** Lots covering the whole property: one per parcel polygon (multipolygons are exploded). */
export function lotsFromParcels(
  parcels: OriginalParcel[],
  lotPrefix: string,
  deps: FactoryDeps = {},
): Lot[] {
  const polygons: Polygon[] = parcels.flatMap((p) =>
    p.geometry.type === "Polygon"
      ? [p.geometry]
      : p.geometry.coordinates.map((coordinates) => ({ type: "Polygon" as const, coordinates })),
  );
  return polygons.map((geometry, i) =>
    createLot({ label: `${lotPrefix} ${i + 1}`, geometry }, deps),
  );
}

export function createScenario(
  input: { name: string; lots?: Lot[]; method?: Scenario["method"] },
  deps: FactoryDeps = {},
): Scenario {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  return {
    id: newId(deps),
    name: input.name.trim(),
    status: "draft",
    method: input.method ?? "manual",
    createdAt: now,
    updatedAt: now,
    lots: input.lots ?? [],
    versions: [],
  };
}

/** Copy with new ids (scenario and lots); beneficiary assignments are kept. */
export function duplicateScenario(
  source: Scenario,
  name: string,
  deps: FactoryDeps = {},
): Scenario {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  return {
    ...structuredClone(source),
    id: newId(deps),
    name: name.trim(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    lots: source.lots.map((l) => ({ ...structuredClone(l), id: newId(deps) })),
    versions: [],
  };
}
