import type { useTranslations } from "next-intl";
import type { ProjectAnalysis, ScenarioAnalysis } from "@/domain/compare";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import type { Project } from "@/domain/model/project";
import { shareInputSummary } from "@/domain/shares";
import type { Cell, Table } from "@/io/export/table";

export type ExportT = ReturnType<typeof useTranslations<"exports">>;

const pct = (ratio: number | null) =>
  ratio === null ? null : Number.isFinite(ratio) ? ratio * 100 : ratio;

/** One row per scenario with its comparison indicators. */
export function comparisonTable(project: Project, analysis: ProjectAnalysis, t: ExportT): Table {
  const valued = analysis.valued;
  const frontage = !!analysis.model?.hasFrontage;
  return {
    name: t("sheets.comparison"),
    columns: [
      t("cols.scenario"),
      t("cols.workflow"),
      t("cols.validity"),
      t("cols.errors"),
      t("cols.warnings"),
      t("cols.lots"),
      t("cols.maxLotsPerBeneficiary"),
      t("cols.unassignedM2"),
      t("cols.maxAreaDeviation"),
      t("cols.meanAreaDeviation"),
      t("cols.withinTolerance", { tolerance: project.settings.areaTolerancePct }),
      ...(valued ? [t("cols.maxValueDeviation")] : []),
      ...(frontage ? [t("cols.roadAccessCount")] : []),
    ],
    rows: analysis.scenarios.map(({ scenario, validation, indicators: i }) => [
      scenario.name,
      t(`workflow.${scenario.status}`),
      t(`validity.${validation.status}`),
      validation.counts.errors,
      validation.counts.warnings,
      i.lotCount,
      i.maxLotsPerBeneficiary,
      i.unassignedM2,
      pct(i.maxAreaDeviation),
      pct(i.meanAreaDeviation),
      `${i.withinTolerance} / ${i.withTarget}`,
      ...(valued ? [pct(i.maxValueDeviation)] : []),
      ...(frontage ? [i.roadAccess ? `${i.roadAccess.count} / ${i.roadAccess.total}` : null] : []),
    ]),
  };
}

/** What each beneficiary receives in one scenario vs. their target. */
export function allocationTable(
  project: Project,
  analysis: ProjectAnalysis,
  sa: ScenarioAnalysis,
  t: ExportT,
  name = t("sheets.allocation"),
): Table {
  const valued = analysis.valued && !!sa.valueAllocation;
  const frontage = !!analysis.model?.hasFrontage && !!sa.valueAllocation;
  const labels = new Map(sa.scenario.lots.map((l) => [l.id, l.label]));
  const rows: Cell[][] = sa.allocation.rows.map((r) => {
    const b = project.beneficiaries.find((x) => x.id === r.beneficiaryId)!;
    const share = analysis.shares.shares.get(b.id);
    const v = sa.valueAllocation?.rows.find((x) => x.beneficiaryId === b.id);
    return [
      b.name,
      share ? share.part * 100 : null,
      r.lotIds.map((id) => labels.get(id)).join(", "),
      r.targetM2,
      r.allocatedM2,
      r.diffM2,
      pct(r.diffRatio),
      t(`status.${r.status}`),
      ...(valued && v ? [v.targetValue, v.value, pct(v.diffRatio)] : []),
      ...(frontage && v ? [v.frontageM, v.roadAccess] : []),
    ];
  });
  if (sa.allocation.unassigned.lotIds.length > 0) {
    rows.push([
      t("unassigned"),
      null,
      sa.allocation.unassigned.lotIds.map((id) => labels.get(id)).join(", "),
      null,
      sa.allocation.unassigned.areaM2,
      null,
      null,
      null,
      ...(valued ? [null, sa.valueAllocation!.unassignedValue, null] : []),
    ]);
  }
  return {
    name,
    columns: [
      t("cols.beneficiary"),
      t("cols.sharePct"),
      t("cols.lotLabels"),
      t("cols.targetM2"),
      t("cols.receivedM2"),
      t("cols.diffM2"),
      t("cols.diffPct"),
      t("cols.status"),
      ...(valued
        ? [
            t("cols.targetValue", { currency: project.settings.currency }),
            t("cols.value", { currency: project.settings.currency }),
            t("cols.valueDiffPct"),
          ]
        : []),
      ...(frontage ? [t("cols.frontageM"), t("cols.roadAccess")] : []),
    ],
    rows,
  };
}

export function lotsTable(
  project: Project,
  sa: ScenarioAnalysis,
  t: ExportT,
  name = t("sheets.lots"),
): Table {
  const names = new Map(project.beneficiaries.map((b) => [b.id, b.name]));
  const withValues = sa.lotValues.size > 0;
  return {
    name,
    columns: [
      t("cols.lot"),
      t("cols.beneficiary"),
      t("cols.areaM2"),
      ...(withValues
        ? [
            t("cols.value", { currency: project.settings.currency }),
            t("cols.frontageM"),
            t("cols.roadAccess"),
          ]
        : []),
      t("cols.locked"),
      t("cols.notes"),
    ],
    rows: sa.scenario.lots.map((l) => {
      const v = sa.lotValues.get(l.id);
      return [
        l.label,
        (l.beneficiaryId && names.get(l.beneficiaryId)) || null,
        geometryAreaM2(l.geometry),
        ...(withValues ? [v?.total ?? null, v?.frontageM ?? null, v?.roadAccess ?? null] : []),
        l.locked,
        l.notes ?? null,
      ];
    }),
  };
}

export function beneficiariesTable(project: Project, analysis: ProjectAnalysis, t: ExportT): Table {
  return {
    name: t("sheets.beneficiaries"),
    columns: [t("cols.beneficiary"), t("cols.shareInput"), t("cols.sharePct"), t("cols.targetM2")],
    rows: project.beneficiaries.map((b) => {
      const s = analysis.shares.shares.get(b.id);
      const input =
        b.share.mode === "remainder"
          ? t("shareRemainder", { weight: b.share.weight })
          : shareInputSummary(b.share);
      return [b.name, input, s ? s.part * 100 : null, s?.targetAreaM2 ?? null];
    }),
  };
}

/** Workbook: comparison, beneficiaries, then allocation + lots of every scenario. */
export function workbookTables(project: Project, analysis: ProjectAnalysis, t: ExportT): Table[] {
  const tables: Table[] = [];
  if (analysis.scenarios.length > 0) tables.push(comparisonTable(project, analysis, t));
  if (project.beneficiaries.length > 0) tables.push(beneficiariesTable(project, analysis, t));
  for (const sa of analysis.scenarios) {
    if (project.beneficiaries.length > 0) {
      tables.push(
        allocationTable(
          project,
          analysis,
          sa,
          t,
          `${sa.scenario.name} · ${t("sheets.allocation")}`,
        ),
      );
    }
    tables.push(lotsTable(project, sa, t, `${sa.scenario.name} · ${t("sheets.lots")}`));
  }
  return tables;
}
