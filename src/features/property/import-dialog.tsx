"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import { useMap } from "react-map-gl/maplibre";
import { toast } from "sonner";
import { fitToGeometries } from "@/components/map/fit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createParcel, nextParcelLabel } from "@/domain/model/factories";
import type { OriginalParcel } from "@/domain/model/project";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { crsInfo, SUPPORTED_CRS, type CrsId } from "@/io/crs";
import { csvToLayer, guessCsvMapping } from "@/io/import/parsers";
import {
  ACCEPTED_EXTENSIONS,
  buildPreview,
  initialCrs,
  readImportFile,
} from "@/io/import/pipeline";
import {
  ImportError,
  type CsvMapping,
  type CsvTable,
  type ImportPreview,
  type RawLayer,
} from "@/io/import/types";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { ImportPreviewMap } from "./import-preview-map";

type Step =
  | { name: "pick"; error?: string }
  | { name: "reading"; fileName: string }
  | { name: "csv"; table: CsvTable; mapping: Partial<CsvMapping> }
  | { name: "review"; layer: RawLayer; crs: CrsId | null; suggestions: CrsId[] };

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ImportDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* Popup content unmounts on close: every open starts at step 1. */}
        <ImportWizard onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ImportWizard({ onDone }: { onDone: () => void }) {
  const t = useTranslations("import");
  const [step, setStep] = useState<Step>({ name: "pick" });

  async function handleFile(file: File) {
    setStep({ name: "reading", fileName: file.name });
    try {
      const result = await readImportFile(file);
      if (result.kind === "table") {
        const guess = guessCsvMapping(result.table.headers);
        setStep({
          name: "csv",
          table: result.table,
          mapping: { x: guess.x ?? undefined, y: guess.y ?? undefined, group: guess.group },
        });
      } else {
        toReview(result.layer);
      }
    } catch (error) {
      setStep({ name: "pick", error: errorMessage(error) });
    }
  }

  function toReview(layer: RawLayer) {
    const { crs, suggestions } = initialCrs(layer);
    setStep({ name: "review", layer, crs, suggestions });
  }

  function errorMessage(error: unknown): string {
    if (error instanceof ImportError) return t(`errors.${error.code}`);
    console.error("[kesma] Import failed", error);
    return t("errors.unexpected");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>
          {t(`steps.${step.name === "reading" ? "pick" : step.name}`)}
        </DialogDescription>
      </DialogHeader>

      {(step.name === "pick" || step.name === "reading") && (
        <PickStep
          reading={step.name === "reading" ? step.fileName : null}
          error={step.name === "pick" ? step.error : undefined}
          onFile={handleFile}
        />
      )}
      {step.name === "csv" && (
        <CsvStep
          table={step.table}
          mapping={step.mapping}
          onChange={(mapping) => setStep({ ...step, mapping })}
          onBack={() => setStep({ name: "pick" })}
          onNext={(mapping) => {
            try {
              toReview(csvToLayer(step.table, mapping));
            } catch (error) {
              setStep({ name: "pick", error: errorMessage(error) });
            }
          }}
        />
      )}
      {step.name === "review" && (
        <ReviewStep
          layer={step.layer}
          crs={step.crs}
          suggestions={step.suggestions}
          onCrsChange={(crs) => setStep({ ...step, crs })}
          onBack={() => setStep({ name: "pick" })}
          onDone={onDone}
        />
      )}
    </>
  );
}

// ---------- Step 1: pick a file ----------

function PickStep({
  reading,
  error,
  onFile,
}: {
  reading: string | null;
  error?: string;
  onFile: (file: File) => void;
}) {
  const t = useTranslations("import");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!!reading}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-muted/50",
        )}
      >
        {reading ? (
          <>
            <Loader2 className="size-7 animate-spin text-primary" />
            <span className="text-sm">{t("reading", { name: reading })}</span>
          </>
        ) : (
          <>
            <FileUp className="size-7 text-primary" />
            <span className="font-medium">{t("dropHere")}</span>
            <span className="text-xs text-muted-foreground">{t("formats")}</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        data-testid="property-import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("shapefileHint")}</p>
    </div>
  );
}

// ---------- Step 2 (CSV only): map columns ----------

function CsvStep({
  table,
  mapping,
  onChange,
  onBack,
  onNext,
}: {
  table: CsvTable;
  mapping: Partial<CsvMapping>;
  onChange: (m: Partial<CsvMapping>) => void;
  onBack: () => void;
  onNext: (m: CsvMapping) => void;
}) {
  const t = useTranslations("import.csv");
  const tc = useTranslations("common");
  const ids = useId();
  const valid = mapping.x !== undefined && mapping.y !== undefined && mapping.x !== mapping.y;

  const select = (key: "x" | "y" | "group", optional = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${ids}-${key}`}>{t(key)}</Label>
      <select
        id={`${ids}-${key}`}
        value={mapping[key] ?? ""}
        onChange={(e) =>
          onChange({
            ...mapping,
            [key]: e.target.value === "" ? (optional ? null : undefined) : Number(e.target.value),
          })
        }
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
      >
        <option value="">{optional ? t("none") : "—"}</option>
        {table.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `#${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {select("x")}
        {select("y")}
        {select("group", true)}
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-2 py-1.5 text-start font-medium",
                    (i === mapping.x || i === mapping.y) && "bg-primary/15",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 5).map((row, r) => (
              <tr key={r} className="border-t">
                {table.headers.map((_, i) => (
                  <td key={i} className="px-2 py-1 tabular-nums">
                    {row[i]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t("rows", { count: table.rows.length })}</p>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {tc("back")}
        </Button>
        <Button
          disabled={!valid}
          onClick={() =>
            valid && onNext({ x: mapping.x!, y: mapping.y!, group: mapping.group ?? null })
          }
        >
          {tc("next")}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------- Step 3: CRS + preview + confirm ----------

function ReviewStep({
  layer,
  crs,
  suggestions,
  onCrsChange,
  onBack,
  onDone,
}: {
  layer: RawLayer;
  crs: CrsId | null;
  suggestions: CrsId[];
  onCrsChange: (crs: CrsId) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const tp = useTranslations("property");
  const locale = useLocale();
  const ids = useId();
  const { main: map } = useMap();
  const update = useWorkspaceStore((s) => s.update);
  const existing = useWorkspaceStore((s) => s.project?.property.parcels.length ?? 0);
  const areaUnit = useWorkspaceStore((s) => s.project?.settings.areaUnit ?? "ha");
  const selectParcel = useMapUiStore((s) => s.selectParcel);
  const [replace, setReplace] = useState(false);

  const result = useMemo<{ preview: ImportPreview | null; error: string | null }>(() => {
    if (!crs) return { preview: null, error: null };
    try {
      return { preview: buildPreview(layer, crs), error: null };
    } catch (error) {
      return {
        preview: null,
        error: error instanceof ImportError ? t(`errors.${error.code}`) : t("errors.unexpected"),
      };
    }
  }, [layer, crs, t]);
  const preview = result.preview;

  // Selection resets whenever the preview changes (new CRS → new candidates).
  const [selection, setSelection] = useState<{ preview: ImportPreview | null; keys: Set<string> }>({
    preview: null,
    keys: new Set(),
  });
  const selected =
    selection.preview === preview
      ? selection.keys
      : new Set(preview?.candidates.filter((c) => !c.selfIntersects).map((c) => c.key));
  const toggle = (key: string) => {
    const keys = new Set(selected);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    setSelection({ preview, keys });
  };

  const chosen = preview?.candidates.filter((c) => selected.has(c.key)) ?? [];
  const chosenArea = chosen.reduce((s, c) => s + c.areaM2, 0);

  function confirm() {
    if (!crs || chosen.length === 0) return;
    const source = { format: layer.format, fileName: layer.fileName, crs } as const;
    const current = replace ? [] : (useWorkspaceStore.getState().project?.property.parcels ?? []);
    const created: OriginalParcel[] = [];
    for (const c of chosen) {
      const label = c.label || nextParcelLabel([...current, ...created], tp("defaultLabel"));
      created.push(createParcel({ label, geometry: c.geometry, source }));
    }
    update(
      (draft) => {
        draft.property.parcels = replace ? created : [...draft.property.parcels, ...created];
      },
      { immediate: true },
    );
    selectParcel(null);
    fitToGeometries(
      map,
      created.map((p) => p.geometry),
    );
    toast.success(t("done", { count: created.length }));
    onDone();
  }

  const detection = layer.crs;
  const detectionText =
    detection.status === "known"
      ? t(`crs.known.${detection.source}`, { name: crsInfo(detection.crs).name })
      : detection.status === "unsupported"
        ? t("crs.unsupported", { name: detection.declared })
        : suggestions.length > 0 && crs !== "EPSG:4326"
          ? t("crs.suggested", { name: crsInfo(suggestions[0]).name })
          : crs === "EPSG:4326"
            ? t("crs.lonLat")
            : t("crs.none");
  const needsAttention = detection.status !== "known" && crs !== "EPSG:4326";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-crs`}>{t("crs.label")}</Label>
        <select
          id={`${ids}-crs`}
          value={crs ?? ""}
          onChange={(e) => onCrsChange(e.target.value as CrsId)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
        >
          {!crs && <option value="">{t("crs.choose")}</option>}
          {SUPPORTED_CRS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
              {detection.status !== "known" && suggestions.includes(c.id) && c.id !== "EPSG:4326"
                ? ` — ${t("crs.suggestion")}`
                : ""}
            </option>
          ))}
        </select>
        <p
          className={cn(
            "flex items-start gap-1.5 text-xs",
            needsAttention ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {needsAttention && <AlertTriangle className="mt-px size-3.5 shrink-0" />}
          {detectionText}
        </p>
      </div>

      {result.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {result.error}
        </p>
      )}

      {preview && preview.candidates.length === 0 && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {t("errors.noAreaFeatures")}
        </p>
      )}

      {preview && preview.candidates.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <ImportPreviewMap
              candidates={preview.candidates}
              selected={selected}
              onToggle={toggle}
            />
            {preview.centre && (
              <p
                className={cn(
                  "flex items-start gap-1.5 text-xs",
                  preview.inTunisia
                    ? "text-muted-foreground"
                    : "text-amber-700 dark:text-amber-400",
                )}
              >
                {preview.inTunisia ? (
                  <MapPin className="mt-px size-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                )}
                {preview.inTunisia
                  ? t("location.inTunisia", {
                      lat: preview.centre[1].toFixed(5),
                      lng: preview.centre[0].toFixed(5),
                    })
                  : t("location.outside", {
                      lat: preview.centre[1].toFixed(5),
                      lng: preview.centre[0].toFixed(5),
                    })}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <ul
              className="max-h-56 divide-y overflow-y-auto rounded-lg border text-sm"
              aria-label={t("candidates")}
            >
              {preview.candidates.map((c, i) => (
                <li key={c.key}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(c.key)}
                      onChange={() => toggle(c.key)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {c.label || `${tp("defaultLabel")} ${i + 1}`}
                    </span>
                    {c.selfIntersects && (
                      <AlertTriangle
                        className="size-3.5 shrink-0 text-destructive"
                        aria-label={t("warnings.selfIntersections")}
                      />
                    )}
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatArea(c.areaM2, areaUnit, locale)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {preview.warnings.filter((w) => w !== "outsideTunisia").length > 0 && (
              <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
                {preview.warnings
                  .filter((w) => w !== "outsideTunisia")
                  .map((w) => (
                    <li key={w} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {t(`warnings.${w}`, {
                        points: preview.skipped.points,
                        lines: preview.skipped.lines,
                        invalid: preview.skipped.invalid,
                      })}
                    </li>
                  ))}
              </ul>
            )}

            {existing > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                {t("replace", { count: existing })}
              </label>
            )}

            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CheckCircle2 className="size-4 text-primary" />
              {t("selectedSummary", {
                count: chosen.length,
                area: formatArea(chosenArea, areaUnit, locale),
              })}
            </p>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {tc("back")}
        </Button>
        <Button disabled={!crs || chosen.length === 0} onClick={confirm}>
          {t("confirm", { count: chosen.length })}
        </Button>
      </DialogFooter>
    </div>
  );
}
