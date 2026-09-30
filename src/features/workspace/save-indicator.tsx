"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useWorkspaceStore } from "@/store/workspace-store";

export function SaveIndicator() {
  const t = useTranslations("workspace");
  const saveState = useWorkspaceStore((s) => s.saveState);

  const content = {
    saved: {
      icon: <Check className="size-3.5" />,
      label: t("saved"),
      cls: "text-muted-foreground",
    },
    pending: {
      icon: <Loader2 className="size-3.5 animate-spin" />,
      label: t("pending"),
      cls: "text-muted-foreground",
    },
    saving: {
      icon: <Loader2 className="size-3.5 animate-spin" />,
      label: t("saving"),
      cls: "text-muted-foreground",
    },
    error: {
      icon: <AlertCircle className="size-3.5" />,
      label: t("saveError"),
      cls: "text-destructive",
    },
  }[saveState];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`hidden items-center gap-1 text-xs md:inline-flex ${content.cls}`}
    >
      {content.icon}
      {content.label}
    </span>
  );
}
