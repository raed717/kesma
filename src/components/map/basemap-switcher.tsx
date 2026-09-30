"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { BasemapId } from "@/domain/model/project";
import { BASEMAP_IDS } from "./basemaps";

type Props = { value: BasemapId; onChange: (id: BasemapId) => void };

export function BasemapSwitcher({ value, onChange }: Props) {
  const t = useTranslations("map.basemaps");
  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="flex gap-0.5 rounded-lg border bg-background/95 p-0.5 text-xs shadow-md backdrop-blur"
    >
      {BASEMAP_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md px-2.5 py-1.5 font-medium transition-colors",
            value === id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {t(id)}
        </button>
      ))}
    </div>
  );
}
