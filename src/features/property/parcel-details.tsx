"use client";

import { Crosshair, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { useMap } from "react-map-gl/maplibre";
import { centroid } from "@turf/turf";
import { toast } from "sonner";
import { fitToGeometries } from "@/components/map/fit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { geometryAreaM2, geometryPerimeterM, vertexCount } from "@/domain/geometry/measure";
import {
  ParcelAttributesSchema,
  type OriginalParcel,
  type ParcelAttributes,
} from "@/domain/model/project";
import { formatArea, formatLength } from "@/domain/units";
import { crsInfo, isSupportedCrs } from "@/io/crs";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const LAND_USES = ParcelAttributesSchema.shape.landUse.unwrap().options;

export function ParcelDetails({ parcel }: { parcel: OriginalParcel }) {
  const t = useTranslations("property.details");
  const tc = useTranslations("common");
  const locale = useLocale();
  const ids = useId();
  const { main: map } = useMap();
  const update = useWorkspaceStore((s) => s.update);
  const areaUnit = useWorkspaceStore((s) => s.project?.settings.areaUnit ?? "ha");
  const selectParcel = useMapUiStore((s) => s.selectParcel);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tScenarios = useTranslations("scenarios");
  const scenarioCount = useWorkspaceStore((s) => s.project?.scenarios.length ?? 0);
  const isLastParcel = useWorkspaceStore((s) => (s.project?.property.parcels.length ?? 0) <= 1);

  /**
   * Scenarios divide the property, so they follow it: lots are clipped to what remains
   * (scenarios left empty are removed; all of them when the last parcel goes). Parcel and
   * scenarios change in one update, so a single Ctrl+Z restores both.
   */
  async function deleteParcel() {
    const project = useWorkspaceStore.getState().project;
    if (!project) return;
    const remaining = project.property.parcels.filter((p) => p.id !== parcel.id);
    let scenarios = project.scenarios;
    let removed = 0;
    let changed = 0;
    if (scenarios.length > 0) {
      const { adaptScenariosToProperty } = await import("@/domain/lot-operations");
      ({ scenarios, removed, changed } = adaptScenariosToProperty(
        scenarios,
        remaining.map((p) => p.geometry),
        tScenarios("lotPrefix"),
      ));
    }
    update(
      (draft) => {
        draft.property.parcels = draft.property.parcels.filter((p) => p.id !== parcel.id);
        draft.scenarios = scenarios;
      },
      { immediate: true },
    );
    selectParcel(null);
    useMapUiStore.setState({ selectedLotIds: [], selectedIssueId: null, lotDraft: null });
    setConfirmDelete(false);
    if (removed > 0 || changed > 0) toast.info(t("deleteDone", { removed, changed }));
  }

  const area = geometryAreaM2(parcel.geometry);
  const [lng, lat] = centroid(parcel.geometry).geometry.coordinates;
  const a = parcel.attributes;

  function patch(recipe: (target: OriginalParcel) => void) {
    update((draft) => {
      const target = draft.property.parcels.find((p) => p.id === parcel.id);
      if (target) recipe(target);
    });
  }
  const setAttr = <K extends keyof ParcelAttributes>(key: K, value: ParcelAttributes[K]) =>
    patch((p) => {
      if (value === undefined || value === "") delete p.attributes[key];
      else p.attributes[key] = value;
    });

  const sourceLabel = parcel.source
    ? [
        t(`formats.${parcel.source.format}`),
        parcel.source.fileName,
        parcel.source.crs && isSupportedCrs(parcel.source.crs)
          ? crsInfo(parcel.source.crs).name
          : parcel.source.crs,
      ]
        .filter(Boolean)
        .join(" · ")
    : "—";

  return (
    <div className="space-y-4 bg-muted/30 px-4 pt-2 pb-4 text-sm">
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border bg-background p-3">
        <Metric label={t("area")} value={formatArea(area, areaUnit, locale)} />
        <Metric label={t("areaM2")} value={formatArea(area, "m2", locale)} />
        <Metric
          label={t("perimeter")}
          value={formatLength(geometryPerimeterM(parcel.geometry), locale)}
        />
        <Metric label={t("vertices")} value={String(vertexCount(parcel.geometry))} />
        <Metric label={t("centroid")} value={`${lat.toFixed(6)}, ${lng.toFixed(6)}`} wide />
        <Metric label={t("source")} value={sourceLabel} wide />
      </dl>

      <Field label={t("label")} htmlFor={`${ids}-label`}>
        <Input
          // Remount when the saved value changes: Base UI inputs warn if defaultValue changes.
          key={parcel.label}
          id={`${ids}-label`}
          defaultValue={parcel.label}
          maxLength={80}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== parcel.label) patch((p) => void (p.label = value));
            else e.target.value = parcel.label;
          }}
        />
      </Field>

      <Field label={t("landUse")} htmlFor={`${ids}-landuse`}>
        <select
          id={`${ids}-landuse`}
          value={a.landUse ?? ""}
          onChange={(e) =>
            setAttr("landUse", (e.target.value || undefined) as ParcelAttributes["landUse"])
          }
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">—</option>
          {LAND_USES.map((u) => (
            <option key={u} value={u}>
              {t(`landUses.${u}`)}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">{t("characteristics")}</legend>
        {(["roadAccess", "waterAccess", "irrigation"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={a[key] === true}
              onChange={(e) => setAttr(key, e.target.checked || undefined)}
            />
            {t(key)}
          </label>
        ))}
      </fieldset>

      <Field label={t("buildings")} htmlFor={`${ids}-buildings`}>
        <Input
          key={a.buildings ?? ""}
          id={`${ids}-buildings`}
          defaultValue={a.buildings ?? ""}
          placeholder={t("buildingsPlaceholder")}
          onBlur={(e) => setAttr("buildings", e.target.value.trim() || undefined)}
        />
      </Field>

      <Field label={t("ownership")} htmlFor={`${ids}-ownership`}>
        <Input
          key={a.ownership ?? ""}
          id={`${ids}-ownership`}
          defaultValue={a.ownership ?? ""}
          placeholder={t("ownershipPlaceholder")}
          onBlur={(e) => setAttr("ownership", e.target.value.trim() || undefined)}
        />
      </Field>

      <Field label={t("notes")} htmlFor={`${ids}-notes`}>
        <Textarea
          id={`${ids}-notes`}
          rows={3}
          defaultValue={a.notes ?? ""}
          onBlur={(e) => setAttr("notes", e.target.value.trim() || undefined)}
        />
      </Field>

      <div className="flex justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fitToGeometries(map, [parcel.geometry], { maxZoom: 18 })}
        >
          <Crosshair /> {t("zoomTo")}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> {tc("delete")}
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{t("deleteBody", { name: parcel.label })}</span>
              {scenarioCount > 0 && (
                <span className="block font-medium text-foreground" data-testid="delete-impact">
                  {isLastParcel
                    ? t("deleteImpactAll", { count: scenarioCount })
                    : t("deleteImpactClip", { count: scenarioCount })}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteParcel()}>
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
