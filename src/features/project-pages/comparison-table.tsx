"use client";

import { Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { bestIndices, type ProjectAnalysis } from "@/domain/compare";
import type { Project } from "@/domain/model/project";
import { formatPercent } from "@/domain/shares";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";

const VALIDITY_CLASS = {
  valid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  incomplete: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  invalid: "bg-red-500/15 text-red-800 dark:text-red-300",
} as const;

type Row = {
  key: string;
  label: string;
  hint?: string;
  cells: ReactNode[];
  /** Numeric values used to find the best scenario (null = not comparable). */
  values?: (number | null)[];
  higherIsBetter?: boolean;
};

type Props = {
  project: Project;
  analysis: ProjectAnalysis;
  /** Scenario ids shown on the maps, marked A / B in the header. */
  marked?: [string | null, string | null];
  className?: string;
};

/** Indicators (rows) × scenarios (columns); the best value of each row is highlighted. */
export function ComparisonTable({ project, analysis, marked, className }: Props) {
  const t = useTranslations("compare");
  const tStatus = useTranslations("scenarios.status");
  const locale = useLocale();
  const list = analysis.scenarios;
  const pct = (v: number) => formatPercent(v, locale, 1);
  const unit = project.settings.areaUnit;
  const withTargets = list.some((s) => s.indicators.withTarget > 0);

  const rows: Row[] = [
    {
      key: "validity",
      label: t("rows.validity"),
      cells: list.map((s) => (
        <span
          key={s.scenario.id}
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            VALIDITY_CLASS[s.validation.status],
          )}
        >
          {tStatus(`validity.${s.validation.status}`)}
        </span>
      )),
      values: list.map((s) => ({ valid: 0, incomplete: 1, invalid: 2 })[s.validation.status]),
    },
    {
      key: "issues",
      label: t("rows.issues"),
      cells: list.map((s) =>
        t("issues", { errors: s.validation.counts.errors, warnings: s.validation.counts.warnings }),
      ),
    },
    {
      key: "workflow",
      label: t("rows.workflow"),
      cells: list.map((s) => tStatus(`workflow.${s.scenario.status}`)),
    },
    ...(withTargets
      ? ([
          {
            key: "maxArea",
            label: t("rows.maxAreaDeviation"),
            hint: t("hints.maxAreaDeviation"),
            cells: list.map((s) => pct(s.indicators.maxAreaDeviation)),
            values: list.map((s) => s.indicators.maxAreaDeviation),
          },
          {
            key: "meanArea",
            label: t("rows.meanAreaDeviation"),
            cells: list.map((s) => pct(s.indicators.meanAreaDeviation)),
            values: list.map((s) => s.indicators.meanAreaDeviation),
          },
          {
            key: "tolerance",
            label: t("rows.withinTolerance", { tolerance: project.settings.areaTolerancePct }),
            cells: list.map((s) => `${s.indicators.withinTolerance} / ${s.indicators.withTarget}`),
            values: list.map((s) => s.indicators.withinTolerance),
            higherIsBetter: true,
          },
        ] satisfies Row[])
      : []),
    ...(analysis.valued && withTargets
      ? [
          {
            key: "maxValue",
            label: t("rows.maxValueDeviation"),
            hint: t("hints.maxValueDeviation"),
            cells: list.map((s) =>
              s.indicators.maxValueDeviation === null ? "—" : pct(s.indicators.maxValueDeviation),
            ),
            values: list.map((s) => s.indicators.maxValueDeviation),
          },
        ]
      : []),
    ...(analysis.model?.hasFrontage && project.beneficiaries.length > 0
      ? [
          {
            key: "road",
            label: t("rows.roadAccess"),
            cells: list.map((s) =>
              s.indicators.roadAccess
                ? `${s.indicators.roadAccess.count} / ${s.indicators.roadAccess.total}`
                : "—",
            ),
            values: list.map((s) => s.indicators.roadAccess?.count ?? null),
            higherIsBetter: true,
          },
        ]
      : []),
    {
      key: "lots",
      label: t("rows.lots"),
      cells: list.map((s) => s.indicators.lotCount),
    },
    ...(project.beneficiaries.length > 0
      ? [
          {
            key: "fragmentation",
            label: t("rows.maxLotsPerBeneficiary"),
            hint: t("hints.maxLotsPerBeneficiary"),
            cells: list.map((s) => s.indicators.maxLotsPerBeneficiary),
            values: list.map((s) => s.indicators.maxLotsPerBeneficiary),
          },
          {
            key: "unassigned",
            label: t("rows.unassigned"),
            cells: list.map((s) =>
              s.indicators.unassignedLots === 0
                ? "—"
                : formatArea(s.indicators.unassignedM2, unit, locale),
            ),
            values: list.map((s) => s.indicators.unassignedM2),
          },
        ]
      : []),
  ];

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
      <table className="w-full border-collapse text-sm" data-testid="comparison-table">
        <thead>
          <tr className="bg-muted/50">
            <th scope="col" className="px-3 py-2 text-start font-medium text-muted-foreground">
              {t("indicator")}
            </th>
            {list.map((s) => {
              const mark =
                marked?.[0] === s.scenario.id ? "A" : marked?.[1] === s.scenario.id ? "B" : null;
              return (
                <th key={s.scenario.id} scope="col" className="px-3 py-2 text-start font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {mark && (
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                        {mark}
                      </span>
                    )}
                    {s.scenario.name}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const best = row.values ? bestIndices(row.values, row.higherIsBetter) : [];
            return (
              <tr key={row.key} className="border-t" data-row={row.key}>
                <th scope="row" className="px-3 py-2 text-start font-normal">
                  <span className="block">{row.label}</span>
                  {row.hint && (
                    <span className="block text-xs text-muted-foreground">{row.hint}</span>
                  )}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={list[i].scenario.id}
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      best.includes(i) && "bg-emerald-500/10 font-semibold",
                    )}
                    data-best={best.includes(i) || undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {cell}
                      {best.includes(i) && (
                        <Trophy
                          className="size-3.5 text-emerald-700 dark:text-emerald-400"
                          aria-label={t("best")}
                        />
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
