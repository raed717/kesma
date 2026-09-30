"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AreaUnitSchema } from "@/domain/model/project";
import { AREA_UNIT_SYMBOL } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

export function SettingsPanel() {
  const t = useTranslations("settings");
  const ids = useId();
  const settings = useWorkspaceStore((s) => s.project?.settings);
  const update = useWorkspaceStore((s) => s.update);
  if (!settings) return null;

  return (
    <div className="space-y-6 p-4">
      <h2 className="font-medium">{t("title")}</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("areaUnit")}</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {AreaUnitSchema.options.map((unit) => (
            <button
              key={unit}
              type="button"
              role="radio"
              aria-checked={settings.areaUnit === unit}
              title={t(`units.${unit}`)}
              onClick={() => update((d) => void (d.settings.areaUnit = unit))}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition-colors",
                settings.areaUnit === unit
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {AREA_UNIT_SYMBOL[unit]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(`units.${settings.areaUnit}`)}</p>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={`${ids}-currency`}>{t("currency")}</Label>
        <Input
          // Remount when the saved value changes: Base UI inputs warn if defaultValue changes.
          key={settings.currency}
          id={`${ids}-currency`}
          defaultValue={settings.currency}
          maxLength={8}
          className="w-28 uppercase"
          onBlur={(e) => {
            const value = e.target.value.trim().toUpperCase();
            if (value && value !== settings.currency)
              update((d) => void (d.settings.currency = value));
            else e.target.value = settings.currency;
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${ids}-tolerance`}>{t("tolerance")}</Label>
        <Input
          key={settings.areaTolerancePct}
          id={`${ids}-tolerance`}
          type="number"
          min={0}
          max={100}
          step={0.1}
          defaultValue={settings.areaTolerancePct}
          className="w-28"
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value >= 0 && value <= 100) {
              if (value !== settings.areaTolerancePct)
                update((d) => void (d.settings.areaTolerancePct = value));
            } else e.target.value = String(settings.areaTolerancePct);
          }}
        />
        <p className="text-xs text-muted-foreground">{t("toleranceHint")}</p>
      </div>
    </div>
  );
}
