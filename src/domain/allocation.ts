import { geometryAreaM2 } from "./geometry/measure";
import type { Beneficiary, Lot } from "./model/project";
import type { ShareResolution } from "./shares";

/**
 * Allocation of a scenario: what each beneficiary receives (sum of assigned lots)
 * compared with their target area. Pure and cheap: recomputed live while dragging.
 */

export type AllocationStatus = "ok" | "warn" | "off" | "noTarget";

export type AllocationRow = {
  beneficiaryId: string;
  lotIds: string[];
  allocatedM2: number;
  targetM2: number | null;
  /** allocated − target (m²); null without a target. */
  diffM2: number | null;
  /** diff / target (fraction, e.g. −0.012 = −1.2 %); null without a target. */
  diffRatio: number | null;
  status: AllocationStatus;
};

export type Allocation = {
  rows: AllocationRow[];
  unassigned: { lotIds: string[]; areaM2: number };
  totalLotsM2: number;
  /** Largest |diff ratio| over beneficiaries with a target (0 when none). */
  maxAbsDeviation: number;
  /** Mean |diff ratio| over beneficiaries with a target (0 when none). */
  meanAbsDeviation: number;
  beneficiariesWithinTolerance: number;
  beneficiariesWithTarget: number;
};

/**
 * Status against the project tolerance (percent): within tolerance → ok,
 * within twice the tolerance → warn, beyond → off.
 */
export function allocationStatus(diffRatio: number | null, tolerancePct: number): AllocationStatus {
  if (diffRatio === null) return "noTarget";
  const pct = Math.abs(diffRatio) * 100;
  // Tiny epsilon so an exactly-on-tolerance value counts as within.
  if (pct <= tolerancePct + 1e-9) return "ok";
  if (pct <= tolerancePct * 2 + 1e-9) return "warn";
  return "off";
}

export function computeAllocation(
  lots: Lot[],
  beneficiaries: Beneficiary[],
  shares: ShareResolution,
  tolerancePct: number,
): Allocation {
  const known = new Set(beneficiaries.map((b) => b.id));
  const byBeneficiary = new Map<string, { lotIds: string[]; m2: number }>();
  const unassigned = { lotIds: [] as string[], areaM2: 0 };
  let totalLotsM2 = 0;

  for (const lot of lots) {
    const m2 = geometryAreaM2(lot.geometry);
    totalLotsM2 += m2;
    // Assignments to a deleted beneficiary count as unassigned.
    if (!lot.beneficiaryId || !known.has(lot.beneficiaryId)) {
      unassigned.lotIds.push(lot.id);
      unassigned.areaM2 += m2;
      continue;
    }
    const acc = byBeneficiary.get(lot.beneficiaryId) ?? { lotIds: [], m2: 0 };
    acc.lotIds.push(lot.id);
    acc.m2 += m2;
    byBeneficiary.set(lot.beneficiaryId, acc);
  }

  const rows: AllocationRow[] = beneficiaries.map((b) => {
    const acc = byBeneficiary.get(b.id) ?? { lotIds: [], m2: 0 };
    const target = shares.shares.get(b.id)?.targetAreaM2 ?? null;
    const diffM2 = target === null ? null : acc.m2 - target;
    const diffRatio =
      target === null || diffM2 === null
        ? null
        : target > 0
          ? diffM2 / target
          : acc.m2 > 0
            ? Infinity
            : 0;
    return {
      beneficiaryId: b.id,
      lotIds: acc.lotIds,
      allocatedM2: acc.m2,
      targetM2: target,
      diffM2,
      diffRatio,
      status: allocationStatus(diffRatio, tolerancePct),
    };
  });

  const withTarget = rows.filter((r) => r.diffRatio !== null && Number.isFinite(r.diffRatio));
  const deviations = withTarget.map((r) => Math.abs(r.diffRatio!));
  return {
    rows,
    unassigned,
    totalLotsM2,
    maxAbsDeviation: deviations.length ? Math.max(...deviations) : 0,
    meanAbsDeviation: deviations.length
      ? deviations.reduce((a, b) => a + b, 0) / deviations.length
      : 0,
    beneficiariesWithinTolerance: rows.filter((r) => r.status === "ok").length,
    beneficiariesWithTarget: rows.filter((r) => r.targetM2 !== null).length,
  };
}

// ---------- value allocation ----------

/** Per-lot value data needed here (see domain/value.ts). */
export type LotValueLike = { total: number; frontageM: number; roadAccess: boolean };

export type ValueRow = {
  beneficiaryId: string;
  value: number;
  targetValue: number | null;
  diff: number | null;
  diffRatio: number | null;
  status: AllocationStatus;
  frontageM: number;
  roadAccess: boolean;
};

export type ValueAllocation = {
  rows: ValueRow[];
  unassignedValue: number;
  maxAbsDeviation: number;
  beneficiariesWithinTolerance: number;
  beneficiariesWithRoadAccess: number;
};

/**
 * Value received by each beneficiary vs. their share of the total property value.
 * Uses the same tolerance as areas.
 */
export function computeValueAllocation(
  lots: Lot[],
  beneficiaries: Beneficiary[],
  shares: ShareResolution,
  lotValues: Map<string, LotValueLike>,
  totalValue: number,
  tolerancePct: number,
): ValueAllocation {
  const known = new Set(beneficiaries.map((b) => b.id));
  let unassignedValue = 0;
  const acc = new Map<string, { value: number; frontageM: number; road: boolean }>();
  for (const lot of lots) {
    const v = lotValues.get(lot.id);
    if (!v) continue;
    if (!lot.beneficiaryId || !known.has(lot.beneficiaryId)) {
      unassignedValue += v.total;
      continue;
    }
    const a = acc.get(lot.beneficiaryId) ?? { value: 0, frontageM: 0, road: false };
    a.value += v.total;
    a.frontageM += v.frontageM;
    a.road ||= v.roadAccess;
    acc.set(lot.beneficiaryId, a);
  }
  const rows: ValueRow[] = beneficiaries.map((b) => {
    const a = acc.get(b.id) ?? { value: 0, frontageM: 0, road: false };
    const part = shares.shares.get(b.id)?.part;
    const targetValue = part === undefined || !Number.isFinite(part) ? null : part * totalValue;
    const diff = targetValue === null ? null : a.value - targetValue;
    const diffRatio =
      targetValue === null || diff === null
        ? null
        : targetValue > 0
          ? diff / targetValue
          : a.value > 0
            ? Infinity
            : 0;
    return {
      beneficiaryId: b.id,
      value: a.value,
      targetValue,
      diff,
      diffRatio,
      status: allocationStatus(diffRatio, tolerancePct),
      frontageM: a.frontageM,
      roadAccess: a.road,
    };
  });
  const devs = rows
    .filter((r) => r.diffRatio !== null && Number.isFinite(r.diffRatio))
    .map((r) => Math.abs(r.diffRatio!));
  return {
    rows,
    unassignedValue,
    maxAbsDeviation: devs.length ? Math.max(...devs) : 0,
    beneficiariesWithinTolerance: rows.filter((r) => r.status === "ok").length,
    beneficiariesWithRoadAccess: rows.filter((r) => r.roadAccess).length,
  };
}
