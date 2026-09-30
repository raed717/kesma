// Scenario geometry validation (JSTS-based: import lazily from the UI).
import {
  differencePolygons,
  envelopesIntersect,
  intersectionPolygons,
  validityError,
  type ValidityErrorKind,
} from "./geometry/jsts";
import { geometryAreaM2 } from "./geometry/measure";
import type { AreaGeometry, Polygon, Position } from "./model/geojson";
import type { Beneficiary, Lot } from "./model/project";

/** Pieces smaller than this are float noise from shared edges, not real issues. */
export const NOISE_M2 = 0.01;
/** Gaps/overlaps below this are "slivers": tiny leftovers, easy to absorb. */
export const SLIVER_M2 = 1;
/** Two lots overlapping on ≥ this share of both areas are duplicates. */
const DUPLICATE_RATIO = 0.99;

export type IssueKind =
  "invalidGeometry" | "overlap" | "duplicate" | "outsideProperty" | "gap" | "unassigned" | "noLots";

export type Severity = "error" | "warning";

export type ValidationIssue = {
  id: string;
  kind: IssueKind;
  severity: Severity;
  lotIds: string[];
  /** Area to highlight (overlap, gap, outside part), or the lot itself. */
  geometry?: Polygon;
  /** Point to highlight (e.g. a self-intersection). */
  location?: Position;
  areaM2?: number;
  sliver?: boolean;
  detail?: ValidityErrorKind;
};

export type ScenarioStatus = "valid" | "incomplete" | "invalid";

export type ValidationResult = {
  issues: ValidationIssue[];
  status: ScenarioStatus;
  counts: { errors: number; warnings: number };
};

const SEVERITY: Record<IssueKind, Severity> = {
  invalidGeometry: "error",
  overlap: "error",
  duplicate: "error",
  outsideProperty: "error",
  gap: "warning",
  unassigned: "warning",
  noLots: "warning",
};

/**
 * Checks a scenario's lots against each other and against the property:
 * errors (invalid shapes, overlaps, duplicates, parts outside the property) make the
 * scenario *invalid*; warnings (gaps, unassigned lots, no lots) make it *incomplete*.
 */
export function validateScenario(
  lots: Lot[],
  property: AreaGeometry[],
  beneficiaries: Beneficiary[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (issue: Omit<ValidationIssue, "id" | "severity">) =>
    issues.push({ ...issue, id: `${issue.kind}-${issues.length}`, severity: SEVERITY[issue.kind] });

  if (lots.length === 0) {
    add({ kind: "noLots", lotIds: [] });
    return summarize(issues);
  }

  // 1. Invalid shapes (self-intersections…). Other checks on such lots are unreliable.
  const valid: Lot[] = [];
  for (const lot of lots) {
    const err = validityError(lot.geometry);
    if (err)
      add({
        kind: "invalidGeometry",
        lotIds: [lot.id],
        geometry: lot.geometry,
        location: err.location ?? undefined,
        detail: err.kind,
      });
    else valid.push(lot);
  }

  // 2. Overlaps / duplicates between pairs (bbox prefilter keeps this near-linear).
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];
      if (!envelopesIntersect(a.geometry, b.geometry)) continue;
      const pieces = intersectionPolygons(a.geometry, b.geometry)
        .map((geometry) => ({ geometry, areaM2: geometryAreaM2(geometry) }))
        .filter((p) => p.areaM2 > NOISE_M2);
      if (pieces.length === 0) continue;
      const total = pieces.reduce((s, p) => s + p.areaM2, 0);
      const ratio = Math.min(
        total / geometryAreaM2(a.geometry),
        total / geometryAreaM2(b.geometry),
      );
      if (ratio >= DUPLICATE_RATIO) {
        add({ kind: "duplicate", lotIds: [a.id, b.id], geometry: a.geometry, areaM2: total });
        continue;
      }
      for (const p of pieces) {
        add({
          kind: "overlap",
          lotIds: [a.id, b.id],
          geometry: p.geometry,
          areaM2: p.areaM2,
          sliver: p.areaM2 < SLIVER_M2,
        });
      }
    }
  }

  if (property.length > 0) {
    // 3. Parts of lots outside the property.
    for (const lot of valid) {
      for (const geometry of differencePolygons([lot.geometry], property)) {
        const areaM2 = geometryAreaM2(geometry);
        if (areaM2 > NOISE_M2)
          add({
            kind: "outsideProperty",
            lotIds: [lot.id],
            geometry,
            areaM2,
            sliver: areaM2 < SLIVER_M2,
          });
      }
    }
    // 4. Parts of the property not covered by any lot.
    for (const geometry of differencePolygons(
      property,
      valid.map((l) => l.geometry),
    )) {
      const areaM2 = geometryAreaM2(geometry);
      if (areaM2 > NOISE_M2)
        add({ kind: "gap", lotIds: [], geometry, areaM2, sliver: areaM2 < SLIVER_M2 });
    }
  }

  // 5. Lots not assigned to an (existing) beneficiary.
  const known = new Set(beneficiaries.map((b) => b.id));
  for (const lot of lots) {
    if (!lot.beneficiaryId || !known.has(lot.beneficiaryId)) {
      add({
        kind: "unassigned",
        lotIds: [lot.id],
        geometry: lot.geometry,
        areaM2: geometryAreaM2(lot.geometry),
      });
    }
  }

  return summarize(issues);
}

function summarize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    issues,
    status: errors > 0 ? "invalid" : warnings > 0 ? "incomplete" : "valid",
    counts: { errors, warnings },
  };
}
