"use client";

import { FileUp, Map as MapIcon, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { fitToGeometries } from "@/components/map/fit";
import { Button } from "@/components/ui/button";
import { geometryAreaM2, totalAreaM2 } from "@/domain/geometry/measure";
import type { OriginalParcel } from "@/domain/model/project";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { ImportDialog } from "./import-dialog";
import { ValuePanel } from "../value/value-panel";
import { ParcelDetails } from "./parcel-details";

const NO_PARCELS: OriginalParcel[] = [];

export function PropertyPanel() {
  const t = useTranslations("property");
  const locale = useLocale();
  const { main: map } = useMap();
  const parcels = useWorkspaceStore((s) => s.project?.property.parcels ?? NO_PARCELS);
  const areaUnit = useWorkspaceStore((s) => s.project?.settings.areaUnit ?? "ha");
  const selectedId = useMapUiStore((s) => s.selectedParcelId);
  const selectParcel = useMapUiStore((s) => s.selectParcel);
  const tool = useMapUiStore((s) => s.tool);
  const setTool = useMapUiStore((s) => s.setTool);
  const [importOpen, setImportOpen] = useState(false);
  const view = useMapUiStore((s) => s.propertyView);
  const setView = useMapUiStore((s) => s.setPropertyView);
  const tv = useTranslations("value");

  const total = totalAreaM2(parcels.map((p) => p.geometry));
  const selected = parcels.find((p) => p.id === selectedId);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setImportOpen(true)}>
        <FileUp /> {t("import")}
      </Button>
      <Button
        size="sm"
        variant={tool === "draw-property" ? "secondary" : "outline"}
        onClick={() => setTool(tool === "draw-property" ? "pan" : "draw-property")}
        aria-pressed={tool === "draw-property"}
      >
        <PenLine /> {t("drawOnMap")}
      </Button>
    </div>
  );

  const switcher = parcels.length > 0 && (
    <div className="border-b p-2">
      <div
        role="tablist"
        aria-label={tv("viewsLabel")}
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {(["parcels", "value"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              view === v
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tv(`views.${v}`)}
          </button>
        ))}
      </div>
    </div>
  );

  if (switcher && view === "value") {
    return (
      <div className="flex flex-col">
        {switcher}
        <ValuePanel />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {switcher}
      {parcels.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MapIcon className="size-5" />
          </div>
          <h3 className="mt-3 font-medium">{t("emptyTitle")}</h3>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("emptyBody")}</p>
          {actions}
        </div>
      ) : (
        <>
          <div className="space-y-3 border-b p-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("totalArea")}</p>
              <p className="text-xl font-semibold tabular-nums" data-testid="property-total-area">
                {formatArea(total, areaUnit, locale)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("parcelCount", { count: parcels.length })} · {formatArea(total, "m2", locale)}
              </p>
            </div>
            {actions}
          </div>

          <ul className="divide-y" aria-label={t("parcelList")}>
            {parcels.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectParcel(isSelected ? null : p.id);
                      if (!isSelected) fitToGeometries(map, [p.geometry], { maxZoom: 17 });
                    }}
                    aria-expanded={isSelected}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-muted/60",
                      isSelected && "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-sm border-2",
                        isSelected
                          ? "border-yellow-500 bg-yellow-300"
                          : "border-emerald-800 bg-white",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.label}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatArea(geometryAreaM2(p.geometry), areaUnit, locale)}
                    </span>
                  </button>
                  {isSelected && selected && <ParcelDetails key={selected.id} parcel={selected} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
