"use client";

import { Lock, Merge, Scissors, Shapes, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMap } from "react-map-gl/maplibre";
import { fitToGeometries } from "@/components/map/fit";
import { Button } from "@/components/ui/button";
import { geometryAreaM2, totalAreaM2 } from "@/domain/geometry/measure";
import type { AreaUnit, Beneficiary, Lot, Scenario } from "@/domain/model/project";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { BeneficiarySelect } from "./beneficiary-select";
import { LotDetails } from "./lot-details";
import { assignLots } from "./scenario-state";
import { useLotActions } from "./use-lot-actions";

type Props = {
  scenario: Scenario;
  lots: Lot[];
  beneficiaries: Beneficiary[];
  areaUnit: AreaUnit;
  propertyArea: number;
};

export function LotsView({ scenario, lots, beneficiaries, areaUnit, propertyArea }: Props) {
  const t = useTranslations("scenarios");
  const locale = useLocale();
  const { main: map } = useMap();
  const { tool, setTool, selectedLotIds, selectLot } = useMapUiStore();
  const actions = useLotActions(scenario.id);
  const colorOf = new Map(beneficiaries.map((b) => [b.id, b.color]));

  const lotsArea = totalAreaM2(lots.map((l) => l.geometry));
  const coverage = propertyArea > 0 ? lotsArea / propertyArea : 0;
  const selected = lots.filter((l) => selectedLotIds.includes(l.id));
  const single = selected.length === 1 ? selected[0] : null;
  const commonBeneficiary =
    selected.length > 0 && selected.every((l) => l.beneficiaryId === selected[0].beneficiaryId)
      ? selected[0].beneficiaryId
      : undefined;

  return (
    <>
      <div className="space-y-3 border-b p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={tool === "split-lot" ? "secondary" : "outline"}
            aria-pressed={tool === "split-lot"}
            disabled={lots.length === 0}
            onClick={() => setTool(tool === "split-lot" ? "pan" : "split-lot")}
          >
            <Scissors /> {t("tools.split")}
          </Button>
          <Button
            size="sm"
            variant={tool === "draw-lot" ? "secondary" : "outline"}
            aria-pressed={tool === "draw-lot"}
            onClick={() => setTool(tool === "draw-lot" ? "pan" : "draw-lot")}
          >
            <Shapes /> {t("tools.draw")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length < 2}
            onClick={() => void actions.merge(selected.map((l) => l.id))}
          >
            <Merge /> {t("tools.merge")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length === 0}
            onClick={() => actions.remove(selected.map((l) => l.id))}
          >
            <Trash2 /> {t("tools.delete")}
          </Button>
        </div>

        {selected.length > 0 && beneficiaries.length > 0 && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
            <p className="text-xs font-medium">{t("assign.label", { count: selected.length })}</p>
            <BeneficiarySelect
              beneficiaries={beneficiaries}
              value={commonBeneficiary}
              onChange={(id) =>
                assignLots(
                  scenario.id,
                  selected.map((l) => l.id),
                  id,
                )
              }
            />
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p data-testid="scenario-coverage">
            {t("coverage", {
              count: lots.length,
              lotsArea: formatArea(lotsArea, areaUnit, locale),
              propertyArea: formatArea(propertyArea, areaUnit, locale),
              percent: new Intl.NumberFormat(locale, {
                style: "percent",
                maximumFractionDigits: 2,
              }).format(coverage),
            })}
          </p>
          <p className="mt-1">{t("editHint")}</p>
        </div>
      </div>

      {lots.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("noLots")}</p>
      ) : (
        <ul className="divide-y" aria-label={t("lotList")}>
          {lots.map((lot) => {
            const isSelected = selectedLotIds.includes(lot.id);
            const color = (lot.beneficiaryId && colorOf.get(lot.beneficiaryId)) || null;
            const owner = beneficiaries.find((b) => b.id === lot.beneficiaryId);
            return (
              <li key={lot.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                    selectLot(lot.id, additive);
                    if (!additive && !isSelected)
                      fitToGeometries(map, [lot.geometry], { maxZoom: 18 });
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-muted/60",
                    isSelected && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-sm border-2",
                      isSelected ? "border-yellow-500" : "border-slate-800",
                      !color && "border-dashed bg-transparent",
                    )}
                    style={color ? { backgroundColor: color } : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{lot.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {owner ? owner.name : t("assign.none")}
                    </span>
                  </span>
                  {lot.locked && (
                    <Lock
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label={t("lot.locked")}
                    />
                  )}
                  <span
                    className="shrink-0 text-muted-foreground tabular-nums"
                    data-testid="lot-area"
                  >
                    {formatArea(geometryAreaM2(lot.geometry), areaUnit, locale)}
                  </span>
                </button>
                {single?.id === lot.id && (
                  <LotDetails
                    scenarioId={scenario.id}
                    lot={lot}
                    lots={lots}
                    beneficiaries={beneficiaries}
                    areaUnit={areaUnit}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
