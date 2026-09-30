"use client";

import { Lock, LockOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geometryAreaM2, geometryPerimeterM } from "@/domain/geometry/measure";
import { collectVertices, coordKey, moveVertex } from "@/domain/geometry/topology";
import type { AreaUnit, Beneficiary, Lot } from "@/domain/model/project";
import { formatArea, formatLength } from "@/domain/units";
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
  const locale = useLocale();
  const ids = useId();
  const area = geometryAreaM2(lot.geometry);
  const ring = lot.geometry.coordinates[0].slice(0, -1);
  const shared = new Map(collectVertices(lots).map((v) => [v.key, v.lotIds.length]));

  function moveTo(index: number, axis: 0 | 1, raw: string) {
    const value = Number(raw.replace(",", "."));
    const p = ring[index];
    if (!Number.isFinite(value) || value === p[axis]) return;
    if (axis === 0 ? Math.abs(value) > 180 : Math.abs(value) > 90) return;
    const to: [number, number] = axis === 0 ? [value, p[1]] : [p[0], value];
    const current = getScenarioLots(scenarioId);
    dismissLotUndo();
    setScenarioLots(scenarioId, moveVertex(current, coordKey(p), to));
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
                          onBlur={(e) => moveTo(i, axis, e.target.value)}
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
