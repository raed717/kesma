"use client";

import { AlertTriangle, Info, Route } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { fitToGeometries } from "@/components/map/fit";
import {
  computeAllocation,
  computeValueAllocation,
  type AllocationStatus,
} from "@/domain/allocation";
import type { AreaUnit, Beneficiary, Lot } from "@/domain/model/project";
import { formatPercent } from "@/domain/shares";
import { formatArea, formatLength } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useShares } from "../beneficiaries/use-shares";
import { formatMoney, useValueData } from "../value/use-value-data";

const STATUS_CLASS: Record<AllocationStatus, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  off: "text-destructive",
  noTarget: "text-muted-foreground",
};
const BAR_CLASS: Record<AllocationStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  off: "bg-red-500",
  noTarget: "bg-slate-400",
};

type Metric = "area" | "value";

/** Area and value allocations share one display shape. */
type DisplayRow = {
  beneficiaryId: string;
  lotIds: string[];
  received: number;
  target: number | null;
  diff: number | null;
  diffRatio: number | null;
  status: AllocationStatus;
  roadAccess: boolean | null;
  frontageM: number;
};

type Props = {
  lots: Lot[];
  beneficiaries: Beneficiary[];
  areaUnit: AreaUnit;
  tolerancePct: number;
};

export function AllocationView({ lots, beneficiaries, areaUnit, tolerancePct }: Props) {
  const t = useTranslations("scenarios.allocation");
  const locale = useLocale();
  const { main: map } = useMap();
  const setPanel = useMapUiStore((s) => s.setPanel);
  const { resolution } = useShares();
  const value = useValueData(lots);
  const [metricChoice, setMetric] = useState<Metric>("area");
  const metric: Metric = value.enabled ? metricChoice : "area";

  // Recomputed live from the displayed lots (including a drag in progress).
  const area = useMemo(
    () => computeAllocation(lots, beneficiaries, resolution, tolerancePct),
    [lots, beneficiaries, resolution, tolerancePct],
  );
  const valueAlloc = useMemo(
    () =>
      value.model
        ? computeValueAllocation(
            lots,
            beneficiaries,
            resolution,
            value.lotValues,
            value.propertyValue,
            tolerancePct,
          )
        : null,
    [
      lots,
      beneficiaries,
      resolution,
      value.model,
      value.lotValues,
      value.propertyValue,
      tolerancePct,
    ],
  );
  const hasFrontage = !!value.model?.hasFrontage;

  const rows: DisplayRow[] = area.rows.map((r) => {
    const v = valueAlloc?.rows.find((x) => x.beneficiaryId === r.beneficiaryId);
    const road =
      hasFrontage && v
        ? { roadAccess: v.roadAccess, frontageM: v.frontageM }
        : { roadAccess: null, frontageM: 0 };
    return metric === "value" && v
      ? {
          beneficiaryId: r.beneficiaryId,
          lotIds: r.lotIds,
          received: v.value,
          target: v.targetValue,
          diff: v.diff,
          diffRatio: v.diffRatio,
          status: v.status,
          ...road,
        }
      : {
          beneficiaryId: r.beneficiaryId,
          lotIds: r.lotIds,
          received: r.allocatedM2,
          target: r.targetM2,
          diff: r.diffM2,
          diffRatio: r.diffRatio,
          status: r.status,
          ...road,
        };
  });
  const fmt = (n: number) =>
    metric === "value" ? formatMoney(n, value.currency, locale) : formatArea(n, areaUnit, locale);
  const withinTolerance = rows.filter((r) => r.status === "ok").length;
  const withTarget = rows.filter((r) => r.target !== null).length;
  const maxDeviation =
    metric === "value" && valueAlloc ? valueAlloc.maxAbsDeviation : area.maxAbsDeviation;

  function focus(lotIds: string[]) {
    useMapUiStore.setState({ selectedLotIds: lotIds, scenarioView: "lots" });
    const geoms = lots.filter((l) => lotIds.includes(l.id)).map((l) => l.geometry);
    fitToGeometries(map, geoms, { maxZoom: 18 });
  }

  if (beneficiaries.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p>{t("noBeneficiaries")}</p>
        <button
          type="button"
          className="mt-2 text-primary underline"
          onClick={() => setPanel("beneficiaries")}
        >
          {t("goToHeirs")}
        </button>
      </div>
    );
  }

  const scale = Math.max(1e-9, ...rows.map((r) => Math.max(r.received, r.target ?? 0)));

  return (
    <div className="space-y-4 p-4">
      {value.enabled && (
        <div
          role="tablist"
          aria-label={t("metricLabel")}
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {(["area", "value"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                metric === m
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`metric.${m}`)}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium" data-testid="allocation-summary">
          {t("summary", { ok: withinTolerance, total: withTarget, tolerance: tolerancePct })}
        </p>
        {withTarget > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("maxDeviation", { value: formatPercent(maxDeviation, locale) })}
          </p>
        )}
        {hasFrontage && valueAlloc && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Route className="size-3.5" />
            {t("roadAccessSummary", {
              count: valueAlloc.beneficiariesWithRoadAccess,
              total: beneficiaries.length,
            })}
          </p>
        )}
        {metric === "value" && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("propertyValue", {
              value: formatMoney(value.propertyValue, value.currency, locale),
            })}
          </p>
        )}
      </div>

      {resolution.status !== "complete" && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            {t("sharesIncomplete")}{" "}
            <button type="button" className="underline" onClick={() => setPanel("beneficiaries")}>
              {t("goToHeirs")}
            </button>
          </span>
        </p>
      )}

      <ul className="space-y-3" aria-label={t("listLabel")}>
        {rows.map((row) => {
          const b = beneficiaries.find((x) => x.id === row.beneficiaryId)!;
          const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±");
          return (
            <li key={row.beneficiaryId}>
              <button
                type="button"
                onClick={() => row.lotIds.length > 0 && focus(row.lotIds)}
                className="w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/50"
                data-testid="allocation-row"
                data-status={row.status}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  {row.roadAccess !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-xs",
                        row.roadAccess
                          ? "text-purple-700 dark:text-purple-400"
                          : "text-muted-foreground line-through",
                      )}
                      title={
                        row.roadAccess
                          ? t("roadAccess", { length: formatLength(row.frontageM, locale) })
                          : t("noRoadAccess")
                      }
                      data-testid="road-access"
                      data-access={row.roadAccess}
                    >
                      <Route className="size-3.5" />
                      {row.roadAccess ? formatLength(row.frontageM, locale) : ""}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("lots", { count: row.lotIds.length })}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2 text-sm tabular-nums">
                  <span>
                    <span className="font-medium">{fmt(row.received)}</span>
                    {row.target !== null && (
                      <span className="text-muted-foreground"> / {fmt(row.target)}</span>
                    )}
                  </span>
                  {row.diff !== null && row.diffRatio !== null && (
                    <span
                      className={cn("text-xs font-medium", STATUS_CLASS[row.status])}
                      data-testid="allocation-diff"
                    >
                      {sign(row.diff)}
                      {fmt(Math.abs(row.diff))} ({sign(row.diffRatio)}
                      {Number.isFinite(row.diffRatio)
                        ? formatPercent(Math.abs(row.diffRatio), locale)
                        : "∞"}
                      )
                    </span>
                  )}
                </div>

                {/* Received bar with a tick at the target. */}
                <div className="relative mt-2 h-2 rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", BAR_CLASS[row.status])}
                    style={{ width: `${Math.min(100, (row.received / scale) * 100)}%` }}
                  />
                  {row.target !== null && (
                    <div
                      className="absolute -top-1 h-4 w-0.5 bg-foreground"
                      style={{
                        insetInlineStart: `calc(${Math.min(100, (row.target / scale) * 100)}% - 1px)`,
                      }}
                    />
                  )}
                </div>
                <p className={cn("mt-1 text-xs", STATUS_CLASS[row.status])}>
                  {t(`status.${row.status}`)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {area.unassigned.lotIds.length > 0 && (
        <button
          type="button"
          onClick={() => focus(area.unassigned.lotIds)}
          className="flex w-full items-start gap-1.5 rounded-lg border border-dashed border-amber-500/60 p-3 text-start text-sm text-amber-700 hover:bg-amber-500/5 dark:text-amber-400"
          data-testid="allocation-unassigned"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("unassigned", {
            count: area.unassigned.lotIds.length,
            area: formatArea(area.unassigned.areaM2, areaUnit, locale),
          })}
        </button>
      )}
    </div>
  );
}
