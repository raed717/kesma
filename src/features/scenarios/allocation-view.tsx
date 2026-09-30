"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useMap } from "react-map-gl/maplibre";
import { fitToGeometries } from "@/components/map/fit";
import { computeAllocation, type AllocationRow, type AllocationStatus } from "@/domain/allocation";
import type { AreaUnit, Beneficiary, Lot } from "@/domain/model/project";
import { formatPercent } from "@/domain/shares";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useShares } from "../beneficiaries/use-shares";

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
  // Recomputed live from the displayed lots (including a drag in progress).
  const allocation = useMemo(
    () => computeAllocation(lots, beneficiaries, resolution, tolerancePct),
    [lots, beneficiaries, resolution, tolerancePct],
  );

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

  const scale = Math.max(
    1,
    ...allocation.rows.map((r) => Math.max(r.allocatedM2, r.targetM2 ?? 0)),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium" data-testid="allocation-summary">
          {t("summary", {
            ok: allocation.beneficiariesWithinTolerance,
            total: allocation.beneficiariesWithTarget,
            tolerance: tolerancePct,
          })}
        </p>
        {allocation.beneficiariesWithTarget > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("maxDeviation", { value: formatPercent(allocation.maxAbsDeviation, locale) })}
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
        {allocation.rows.map((row) => {
          const b = beneficiaries.find((x) => x.id === row.beneficiaryId)!;
          return (
            <li key={row.beneficiaryId}>
              <AllocationRowView
                row={row}
                beneficiary={b}
                scale={scale}
                areaUnit={areaUnit}
                locale={locale}
                onFocus={() => row.lotIds.length > 0 && focus(row.lotIds)}
              />
            </li>
          );
        })}
      </ul>

      {allocation.unassigned.lotIds.length > 0 && (
        <button
          type="button"
          onClick={() => focus(allocation.unassigned.lotIds)}
          className="flex w-full items-start gap-1.5 rounded-lg border border-dashed border-amber-500/60 p-3 text-start text-sm text-amber-700 hover:bg-amber-500/5 dark:text-amber-400"
          data-testid="allocation-unassigned"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("unassigned", {
            count: allocation.unassigned.lotIds.length,
            area: formatArea(allocation.unassigned.areaM2, areaUnit, locale),
          })}
        </button>
      )}
    </div>
  );
}

function AllocationRowView({
  row,
  beneficiary,
  scale,
  areaUnit,
  locale,
  onFocus,
}: {
  row: AllocationRow;
  beneficiary: Beneficiary;
  scale: number;
  areaUnit: AreaUnit;
  locale: string;
  onFocus: () => void;
}) {
  const t = useTranslations("scenarios.allocation");
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±");
  return (
    <button
      type="button"
      onClick={onFocus}
      className="w-full rounded-lg border p-3 text-start transition-colors hover:bg-muted/50"
      data-testid="allocation-row"
      data-status={row.status}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: beneficiary.color }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{beneficiary.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("lots", { count: row.lotIds.length })}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm tabular-nums">
        <span>
          <span className="font-medium">{formatArea(row.allocatedM2, areaUnit, locale)}</span>
          {row.targetM2 !== null && (
            <span className="text-muted-foreground">
              {" "}
              / {formatArea(row.targetM2, areaUnit, locale)}
            </span>
          )}
        </span>
        {row.diffM2 !== null && row.diffRatio !== null && (
          <span
            className={cn("text-xs font-medium", STATUS_CLASS[row.status])}
            data-testid="allocation-diff"
          >
            {sign(row.diffM2)}
            {formatArea(Math.abs(row.diffM2), areaUnit, locale)} ({sign(row.diffRatio)}
            {Number.isFinite(row.diffRatio) ? formatPercent(Math.abs(row.diffRatio), locale) : "∞"})
          </span>
        )}
      </div>

      {/* Allocated bar with a tick at the target. */}
      <div className="relative mt-2 h-2 rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", BAR_CLASS[row.status])}
          style={{ width: `${Math.min(100, (row.allocatedM2 / scale) * 100)}%` }}
        />
        {row.targetM2 !== null && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-foreground"
            style={{
              insetInlineStart: `calc(${Math.min(100, (row.targetM2 / scale) * 100)}% - 1px)`,
            }}
          />
        )}
      </div>
      <p className={cn("mt-1 text-xs", STATUS_CLASS[row.status])}>{t(`status.${row.status}`)}</p>
    </button>
  );
}
