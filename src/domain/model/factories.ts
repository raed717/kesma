import { nanoid } from "nanoid";
import type { AreaGeometry } from "./geojson";
import {
  CURRENT_SCHEMA_VERSION,
  type Beneficiary,
  type OriginalParcel,
  type ParcelAttributes,
  type Project,
  type ProjectSettings,
} from "./project";

export type FactoryDeps = {
  now?: () => Date;
  id?: () => string;
};

const defaultDeps: Required<FactoryDeps> = {
  now: () => new Date(),
  id: () => nanoid(12),
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  areaUnit: "ha",
  currency: "TND",
  areaTolerancePct: 1,
  baseValuePerM2: null,
};

export function newId(deps: FactoryDeps = {}): string {
  return (deps.id ?? defaultDeps.id)();
}

export function createProject(
  input: { name: string; description?: string; settings?: Partial<ProjectSettings> },
  deps: FactoryDeps = {},
): Project {
  const now = (deps.now ?? defaultDeps.now)().toISOString();
  const description = input.description?.trim();
  return {
    id: newId(deps),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: input.name.trim(),
    ...(description ? { description } : {}),
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
    property: { parcels: [] },
    beneficiaries: [],
    scenarios: [],
    valueZones: [],
    assets: [],
    frontageLines: [],
  };
}

export function createParcel(
  input: {
    label: string;
    geometry: AreaGeometry;
    attributes?: ParcelAttributes;
    source?: OriginalParcel["source"];
  },
  deps: FactoryDeps = {},
): OriginalParcel {
  return {
    id: newId(deps),
    label: input.label.trim(),
    geometry: input.geometry,
    attributes: input.attributes ?? {},
    ...(input.source ? { source: input.source } : {}),
  };
}

export function createBeneficiary(
  input: { name: string; color: string; share?: Beneficiary["share"]; notes?: string },
  deps: FactoryDeps = {},
): Beneficiary {
  return {
    id: newId(deps),
    name: input.name.trim(),
    color: input.color,
    // Default: an equal part of whatever is not fixed — adding N heirs gives 1/N each.
    share: input.share ?? { mode: "remainder", weight: 1 },
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

/** "Parcelle 3"-style default label that doesn't collide with existing ones. */
export function nextParcelLabel(existing: { label: string }[], prefix: string): string {
  const used = new Set(existing.map((p) => p.label));
  let n = existing.length + 1;
  while (used.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

/** Deep copy with fresh project id and timestamps. Child ids are kept: they are scoped to the project. */
export function duplicateProject(source: Project, name: string, deps: FactoryDeps = {}): Project {
  const now = (deps.now ?? defaultDeps.now)().toISOString();
  return {
    ...structuredClone(source),
    id: newId(deps),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };
}
