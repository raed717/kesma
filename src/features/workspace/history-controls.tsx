"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { IconButton } from "@/components/icon-button";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";

function undo() {
  useWorkspaceStore.getState().undo();
  // Selections may point to lots that no longer exist.
  useMapUiStore.setState({ selectedLotIds: [], selectedIssueId: null, lotDraft: null });
}

function redo() {
  useWorkspaceStore.getState().redo();
  useMapUiStore.setState({ selectedLotIds: [], selectedIssueId: null, lotDraft: null });
}

/** Undo / redo buttons for the whole project, with Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. */
export function HistoryControls() {
  const t = useTranslations("workspace.history");
  const canUndo = useWorkspaceStore((s) => s.past.length > 0);
  const canRedo = useWorkspaceStore((s) => s.future.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      // Let text fields keep their own undo.
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || key === "y") redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center">
      <IconButton
        label={t("undo")}
        icon={<Undo2 className="rtl:-scale-x-100" />}
        variant="ghost"
        disabled={!canUndo}
        onClick={undo}
      />
      <IconButton
        label={t("redo")}
        icon={<Redo2 className="rtl:-scale-x-100" />}
        variant="ghost"
        disabled={!canRedo}
        onClick={redo}
      />
    </div>
  );
}

export { undo as undoProjectChange };
