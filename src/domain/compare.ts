// Whole-project analysis: every scenario's allocation, values and validation, plus the
// indicators used to compare scenarios. Shared by the comparison view, the report and the
// exports. Uses JSTS (validation, value model): import lazily from the UI.
import {
  computeAllocation,
  computeValueAllocation,
  type Allocation,
  type ValueAllocation,
} from "./allocation";
import { totalAreaM2 } from "./geometry/measure";
import type { Project, Scenario } from "./model/project";
import { resolveShares, type ShareResolution } from "./shares";
import { validateScenario, type ValidationResult } from "./validation";
import {
  buildValueModel,
  computeLotValues,
  hasValueModel,
  propertyValue,
  type LotValue,
  type ValueModel,
} from "./value";

export type ScenarioIndicators = {
  lotCount: number;
  /** Most lots held by a single beneficiary (fragmentation). */
  maxLotsPerBeneficiary: number;
  unassignedLots: number;
  unassignedM2: number;
  /** Largest / mean |deviation| from the target area (fractions: 0.012 = 1.2 %). */
  maxAreaDeviation: number;
  meanAreaDeviation: number;
  withinTolerance: number;
  withTarget: number;
  /** Null when the project has no value information. */
  maxValueDeviation: number | null;
  /** Null without frontage lines. */
  roadAccess: { count: number; total: number } | null;
};

export type ScenarioAnalysis = {
  scenario: Scenario;
  allocation: Allocation;
  /** Null when no value model exists (no prices and no frontage). */
  valueAllocation: ValueAllocation | null;
  lotValues: Map<string, LotValue>;
  validation: ValidationResult;
  indicators: ScenarioIndicators;
};

export type ProjectAnalysis = {
  propertyAreaM2: number;
  shares: ShareResolution;
  /** Value model, built when the project has prices or frontage lines. */
  model: ValueModel | null;
  /** True when values (prices, zones or assets) are defined. */
  valued: boolean;
  propertyValue: number;
  scenarios: ScenarioAnalysis[];
};

export function analyzeProject(project: Project, scenarios = project.scenarios): ProjectAnalysis {
  const parcels = project.property.parcels.map((p) => p.geometry);
  const propertyAreaM2 = totalAreaM2(parcels);
  const shares = resolveShares(project.beneficiaries, propertyAreaM2);
  const valued = hasValueModel(project.settings, project.valueZones, project.assets);
  const model =
    valued || project.frontageLines.length > 0
      ? buildValueModel(project.settings, project.valueZones, project.assets, project.frontageLines)
      : null;
  const totalValue = model && valued ? propertyValue(model, parcels) : 0;
  const tolerance = project.settings.areaTolerancePct;
  const { beneficiaries } = project;

  return {
    propertyAreaM2,
    shares,
    model,
    valued,
    propertyValue: totalValue,
    scenarios: scenarios.map((scenario) => {
      const { lots } = scenario;
      const allocation = computeAllocation(lots, beneficiaries, shares, tolerance);
      const lotValues = model ? computeLotValues(model, lots) : new Map<string, LotValue>();
      const valueAllocation = model
        ? computeValueAllocation(lots, beneficiaries, shares, lotValues, totalValue, tolerance)
        : null;
      const validation = validateScenario(lots, parcels, beneficiaries);
      return {
        scenario,
        allocation,
        valueAllocation,
        lotValues,
        validation,
        indicators: {
          lotCount: lots.length,
          maxLotsPerBeneficiary: Math.max(0, ...allocation.rows.map((r) => r.lotIds.length)),
          unassignedLots: allocation.unassigned.lotIds.length,
          unassignedM2: allocation.unassigned.areaM2,
          maxAreaDeviation: allocation.maxAbsDeviation,
          meanAreaDeviation: allocation.meanAbsDeviation,
          withinTolerance: allocation.beneficiariesWithinTolerance,
          withTarget: allocation.beneficiariesWithTarget,
          maxValueDeviation: valued && valueAllocation ? valueAllocation.maxAbsDeviation : null,
          roadAccess:
            model?.hasFrontage && valueAllocation
              ? { count: valueAllocation.beneficiariesWithRoadAccess, total: beneficiaries.length }
              : null,
        },
      };
    }),
  };
}

/**
 * Indices of the best value (all of them on a tie; nulls ignored). Empty when there is
 * nothing to distinguish (fewer than two values, or all equal).
 */
export function bestIndices(values: (number | null)[], higherIsBetter = false): number[] {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return [];
  const best = higherIsBetter ? Math.max(...present) : Math.min(...present);
  if (present.every((v) => Math.abs(v - best) < 1e-12)) return [];
  return values.flatMap((v, i) => (v !== null && Math.abs(v - best) < 1e-12 ? [i] : []));
}
