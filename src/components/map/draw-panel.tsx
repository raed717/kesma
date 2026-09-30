"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useMapUiStore, type MapTool } from "@/store/map-ui-store";

const KEYS = {
  "draw-property": "property",
  "draw-lot": "lot",
  "split-lot": "split",
} as const;

export function DrawPanel({ tool }: { tool: MapTool }) {
  const t = useTranslations("drawPanel");
  const setTool = useMapUiStore((s) => s.setTool);
  const key = KEYS[tool as keyof typeof KEYS];
  if (!key) return null;
  return (
    <div className="w-64 rounded-xl border bg-background/95 p-3 text-sm shadow-md backdrop-blur">
      <p className="font-medium">{t(`${key}.title`)}</p>
      <p className="mt-1 text-muted-foreground">{t(`${key}.hint`)}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setTool("pan")}>
        <X /> {t("cancel")}
      </Button>
    </div>
  );
}
