"use client";

import { Hand, Pentagon, Ruler } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/icon-button";
import { useMapUiStore, type MapTool } from "@/store/map-ui-store";

const TOOLS: {
  id: MapTool;
  icon: React.ReactNode;
  labelKey: "pan" | "measureDistance" | "measureArea";
}[] = [
  { id: "pan", icon: <Hand />, labelKey: "pan" },
  { id: "measure-distance", icon: <Ruler />, labelKey: "measureDistance" },
  { id: "measure-area", icon: <Pentagon />, labelKey: "measureArea" },
];

export function MapToolbar() {
  const t = useTranslations("map.tools");
  const tool = useMapUiStore((s) => s.tool);
  const setTool = useMapUiStore((s) => s.setTool);

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      className="flex flex-col gap-1 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur"
    >
      {TOOLS.map(({ id, icon, labelKey }) => (
        <IconButton
          key={id}
          label={t(labelKey)}
          icon={icon}
          side="inline-end"
          variant={tool === id ? "default" : "ghost"}
          aria-pressed={tool === id}
          onClick={() => setTool(id)}
        />
      ))}
    </div>
  );
}
