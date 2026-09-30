"use client";

import { Lock, LockOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geometryAreaM2, geometryPerimeterM } from "@/domain/geometry/measure";
import { collectVertices, coordKey, moveVertex } from "@/domain/geometry/topology";
import type { AreaUnit, Beneficiary, Lot } from "@/domain/model/project";
import { formatArea, formatLength } from "@/domain/units";
import { useWorkspaceStore } from "@/store/workspace-store";
import { formatMoney, useValueData } from "../value/use-value-data";
import { BeneficiarySelect } from "./beneficiary-select";
import {
  assignLots,
  dismissLotUndo,
  getScenarioLots,
  patchLot,
  setScenarioLots,
} from "./scenario-state";

type Props = {
  scenarioId: string;
  lot: Lot;
  lots: Lot[];
  beneficiaries: Beneficiary[];
  areaUnit: AreaUnit;
};

export function LotDetails({ scenarioId, lot, lots, beneficiaries, areaUnit }: Props) {
  const t = useTranslations("scenarios.lot");
  const ts = useTranslations("scenarios");
  const locale = useLocale();
  const ids = useId();
  const area = geometryAreaM2(lot.geometry);
  const ring = lot.geometry.coordinates[0].slice(0, -1);
  const shared = new Map(collectVertices(lots).map((v) => [v.key, v.lotIds.length]));
  // Values need all lots (a point asset belongs to exactly one of them).
  const value = useValueData(lots);
  const lotValue = value.lotValues.get(lot.id);
  const allAssets = useWorkspaceStore((s) => s.project?.assets);
  const assetNames = (lotValue?.assetIds ?? []).map(
    (id) => allAssets?.find((a) => a.id === id)?.name ?? "?",
  );

  async function moveTo(index: number, axis: 0 | 1, input: HTMLInputElement) {
    const value = Number(input.value.replace(",", "."));
    const p = ring[index];
    const revert = () => (input.value = p[axis].toFixed(7));
    if (!Number.isFinite(value) || value === p[axis]) return revert();
    if (axis === 0 ? Math.abs(value) > 180 : Math.abs(value) > 90) return revert();
    const to: [number, number] = axis === 0 ? [value, p[1]] : [p[0], value];
    const current = getScenarioLots(scenarioId);
    const next = moveVertex(current, coordKey(p), to);
    // Same rule as dragging on the map: lots must not extend further outside the property.
    const property =
      useWorkspaceStore.getState().project?.property.parcels.map((x) => x.geometry) ?? [];
    const { exitsProperty } = await import("@/domain/lot-operations");
    if (exitsProperty(current, next, property)) {
      revert();
      toast.error(ts("toast.errors.outside"));
      return;
    }
    dismissLotUndo();
    setScenarioLots(scenarioId, next);
  }

  return (
    <div className="space-y-4 bg-muted/30 px-4 pt-2 pb-4 text-sm">
      {beneficiaries.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-owner`}>{t("owner")}</Label>
          <BeneficiarySelect
            id={`${ids}-owner`}
            beneficiaries={beneficiaries}
            value={lot.beneficiaryId}
            onChange={(id) => assignLots(scenarioId, [lot.id], id)}
          />
        </div>
      )}
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border bg-background p-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("area")}</dt>
          <dd className="font-medium tabular-nums">{formatArea(area, areaUnit, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("areaM2")}</dt>
          <dd className="font-medium tabular-nums">{formatArea(area, "m2", locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("perimeter")}</dt>
          <dd className="font-medium tabular-nums">
            {formatLength(geometryPerimeterM(lot.geometry), locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("vertices")}</dt>
          <dd className="font-medium tabular-nums">{ring.length}</dd>
        </div>
        {lotValue && value.enabled && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">{t("value")}</dt>
            <dd className="font-medium tabular-nums" data-testid="lot-value">
              {formatMoney(lotValue.total, value.currency, locale)}
              {lotValue.assetValue > 0 && (
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  {t("valueWithAssets", {
                    assets: formatMoney(lotValue.assetValue, value.currency, locale),
                  })}
                </span>
              )}
            </dd>
          </div>
        )}
        {lotValue && value.model?.hasFrontage && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">{t("frontage")}</dt>
            <dd className="font-medium tabular-nums">
              {lotValue.roadAccess ? formatLength(lotValue.frontageM, locale) : t("noRoadAccess")}
            </dd>
          </div>
        )}
        {assetNames.length > 0 && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">{t("assets")}</dt>
            <dd className="truncate font-medium" title={assetNames.join(", ")}>
              {assetNames.join(", ")}
            </dd>
          </div>
        )}
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-label`}>{t("label")}</Label>
        <Input
          // Remount when the saved value changes: Base UI inputs warn if defaultValue changes.
          key={lot.label}
          id={`${ids}-label`}
          defaultValue={lot.label}
          maxLength={60}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== lot.label)
              patchLot(scenarioId, lot.id, (l) => void (l.label = value));
            else e.target.value = lot.label;
          }}
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        aria-pressed={lot.locked}
        onClick={() => patchLot(scenarioId, lot.id, (l) => void (l.locked = !l.locked))}
      >
        {lot.locked ? <Lock /> : <LockOpen />} {lot.locked ? t("unlock") : t("lock")}
      </Button>
      {lot.locked && <p className="text-xs text-muted-foreground">{t("lockedHint")}</p>}

      <details className="group rounded-lg border bg-background">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
          {t("coordinates")}
        </summary>
        <div className="max-h-64 overflow-y-auto border-t">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="px-2 py-1 text-start font-medium">#</th>
                <th className="px-2 py-1 text-start font-medium">{t("latitude")}</th>
                <th className="px-2 py-1 text-start font-medium">{t("longitude")}</th>
              </tr>
            </thead>
            <tbody>
              {ring.map((p, i) => {
                const n = shared.get(coordKey(p)) ?? 1;
                return (
                  <tr key={`${i}-${p[0]}-${p[1]}`} className="border-t">
                    <td
                      className="px-2 py-1 tabular-nums"
                      title={n > 1 ? t("sharedVertex", { count: n }) : undefined}
                    >
                      {i + 1}
                      {n > 1 && <span className="ms-1 text-orange-600">●</span>}
                    </td>
                    {([1, 0] as const).map((axis) => (
                      <td key={axis} className="px-1 py-0.5">
                        <input
                          aria-label={`${axis === 1 ? t("latitude") : t("longitude")} ${i + 1}`}
                          defaultValue={p[axis].toFixed(7)}
                          disabled={lot.locked}
                          inputMode="decimal"
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 tabular-nums outline-none hover:border-border focus:border-ring disabled:opacity-60"
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          onBlur={(e) => void moveTo(i, axis, e.currentTarget)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("coordinatesHint")}</p>
      </details>
    </div>
  );
}
