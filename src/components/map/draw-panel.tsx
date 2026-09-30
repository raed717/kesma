"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useMapUiStore } from "@/store/map-ui-store";

export function DrawPanel() {
  const t = useTranslations("property.draw");
  const setTool = useMapUiStore((s) => s.setTool);
  return (
    <div className="w-64 rounded-xl border bg-background/95 p-3 text-sm shadow-md backdrop-blur">
      <p className="font-medium">{t("title")}</p>
      <p className="mt-1 text-muted-foreground">{t("hint")}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setTool("pan")}>
        <X /> {t("cancel")}
      </Button>
    </div>
  );
}
