"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
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
import type { AreaUnit, Beneficiary, Share } from "@/domain/model/project";
import {
  BENEFICIARY_COLORS,
  convertShare,
  parseFractionInput,
  type ResolvedShare,
} from "@/domain/shares";
import { AREA_UNIT_SYMBOL, convertArea, toSquareMetres } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

const MODES: Share["mode"][] = ["fraction", "percent", "area", "remainder"];

type Props = {
  beneficiary: Beneficiary;
  resolved: ResolvedShare | undefined;
  propertyAreaM2: number;
  areaUnit: AreaUnit;
  onDeleted: () => void;
};

export function BeneficiaryEditor({
  beneficiary: b,
  resolved,
  propertyAreaM2,
  areaUnit,
  onDeleted,
}: Props) {
  const t = useTranslations("beneficiaries.editor");
  const tc = useTranslations("common");
  const ids = useId();
  const update = useWorkspaceStore((s) => s.update);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function patch(recipe: (target: Beneficiary) => void) {
    update((draft) => {
      const target = draft.beneficiaries.find((x) => x.id === b.id);
      if (target) recipe(target);
    });
  }
  const setShare = (share: Share) => patch((x) => void (x.share = share));

  return (
    <div className="space-y-4 bg-muted/30 px-4 pt-2 pb-4 text-sm">
      <Field label={t("name")} htmlFor={`${ids}-name`}>
        <Input
          // Remount when the saved value changes: Base UI inputs warn if defaultValue changes.
          key={b.name}
          id={`${ids}-name`}
          defaultValue={b.name}
          maxLength={80}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== b.name) patch((x) => void (x.name = value));
            else e.target.value = b.name;
          }}
        />
      </Field>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">{t("color")}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {BENEFICIARY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={b.color.toLowerCase() === c}
              onClick={() => patch((x) => void (x.color = c))}
              className={cn(
                "size-6 rounded-full border-2 border-background ring-offset-background transition-shadow",
                b.color.toLowerCase() === c && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <label
            className="relative size-6 cursor-pointer overflow-hidden rounded-full border"
            title={t("customColor")}
          >
            <input
              type="color"
              value={b.color}
              onChange={(e) => patch((x) => void (x.color = e.target.value))}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              aria-label={t("customColor")}
            />
            <span
              className="block size-full"
              style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
            />
          </label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t("share")}</legend>
        <div role="radiogroup" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={b.share.mode === mode}
              onClick={() =>
                b.share.mode !== mode && setShare(convertShare(mode, resolved, propertyAreaM2))
              }
              className={cn(
                "rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
                b.share.mode === mode
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`modes.${mode}`)}
            </button>
          ))}
        </div>
        {/* key: remount inputs when the mode changes so defaultValue refreshes. */}
        <ShareInput
          key={`${b.share.mode}-${JSON.stringify(b.share)}`}
          share={b.share}
          areaUnit={areaUnit}
          propertyAreaM2={propertyAreaM2}
          onChange={setShare}
        />
      </fieldset>

      <Field label={t("notes")} htmlFor={`${ids}-notes`}>
        <Textarea
          id={`${ids}-notes`}
          rows={2}
          defaultValue={b.notes ?? ""}
          onBlur={(e) =>
            patch((x) => {
              const value = e.target.value.trim();
              if (value) x.notes = value;
              else delete x.notes;
            })
          }
        />
      </Field>

      <div className="flex justify-end">
        <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> {tc("delete")}
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody", { name: b.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                update(
                  (draft) => {
                    draft.beneficiaries = draft.beneficiaries.filter((x) => x.id !== b.id);
                  },
                  { immediate: true },
                );
                setConfirmDelete(false);
                onDeleted();
              }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShareInput({
  share,
  areaUnit,
  propertyAreaM2,
  onChange,
}: {
  share: Share;
  areaUnit: AreaUnit;
  propertyAreaM2: number;
  onChange: (share: Share) => void;
}) {
  const t = useTranslations("beneficiaries.editor");
  const ids = useId();
  const [error, setError] = useState<string | null>(null);
  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  switch (share.mode) {
    case "fraction":
      return (
        <Field
          label={t("fractionLabel")}
          htmlFor={ids}
          hint={error ?? t("fractionHint")}
          error={!!error}
        >
          <Input
            id={ids}
            inputMode="numeric"
            defaultValue={`${share.numerator}/${share.denominator}`}
            placeholder="1/8"
            className="w-32 tabular-nums"
            aria-invalid={!!error}
            onKeyDown={commitOnEnter}
            onBlur={(e) => {
              const parsed = parseFractionInput(e.target.value);
              if (!parsed) return setError(t("fractionInvalid"));
              setError(null);
              if (
                parsed.numerator !== share.numerator ||
                parsed.denominator !== share.denominator
              ) {
                onChange({ mode: "fraction", ...parsed });
              }
            }}
          />
        </Field>
      );
    case "percent":
      return (
        <Field label={t("percentLabel")} htmlFor={ids} hint={error ?? undefined} error={!!error}>
          <div className="flex items-center gap-2">
            <Input
              id={ids}
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={share.value}
              className="w-32 tabular-nums"
              aria-invalid={!!error}
              onKeyDown={commitOnEnter}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (!Number.isFinite(value) || value < 0 || value > 100)
                  return setError(t("percentInvalid"));
                setError(null);
                if (value !== share.value) onChange({ mode: "percent", value });
              }}
            />
            <span className="text-muted-foreground">%</span>
          </div>
        </Field>
      );
    case "area":
      return (
        <Field
          label={t("areaLabel")}
          htmlFor={ids}
          hint={error ?? (propertyAreaM2 > 0 ? undefined : t("areaNeedsProperty"))}
          error={!!error}
        >
          <div className="flex items-center gap-2">
            <Input
              id={ids}
              type="number"
              min={0}
              step="any"
              defaultValue={Number(
                convertArea(share.m2, areaUnit).toFixed(areaUnit === "ha" ? 4 : 2),
              )}
              className="w-36 tabular-nums"
              aria-invalid={!!error}
              onKeyDown={commitOnEnter}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (!Number.isFinite(value) || value < 0) return setError(t("areaInvalid"));
                setError(null);
                const m2 = toSquareMetres(value, areaUnit);
                if (Math.abs(m2 - share.m2) > 1e-6) onChange({ mode: "area", m2 });
              }}
            />
            <span className="text-muted-foreground">{AREA_UNIT_SYMBOL[areaUnit]}</span>
          </div>
        </Field>
      );
    case "remainder":
      return (
        <Field
          label={t("weightLabel")}
          htmlFor={ids}
          hint={error ?? t("weightHint")}
          error={!!error}
        >
          <Input
            id={ids}
            type="number"
            min={0.1}
            max={1000}
            step={1}
            defaultValue={share.weight}
            className="w-24 tabular-nums"
            aria-invalid={!!error}
            onKeyDown={commitOnEnter}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value) || value <= 0 || value > 1000)
                return setError(t("weightInvalid"));
              setError(null);
              if (value !== share.weight) onChange({ mode: "remainder", weight: value });
            }}
          />
        </Field>
      );
  }
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {hint}
        </p>
      )}
    </div>
  );
}
