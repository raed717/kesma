"use client";

import { Check, ChevronDown, Columns2, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMapUiStore, type WorkspacePanel } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useShares } from "../beneficiaries/use-shares";
import { useOpenProjectPage } from "./export-menu";

const DISMISS_KEY = "kesma.gettingStarted.dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * First-run guide: the main steps of a division, ticked as the project progresses.
 * Dismissable per project (remembered in this browser).
 */
export function GettingStarted() {
  const t = useTranslations("gettingStarted");
  const projectId = useWorkspaceStore((s) => s.project?.id);
  const hasParcels = useWorkspaceStore((s) => (s.project?.property.parcels.length ?? 0) > 0);
  const scenarios = useWorkspaceStore((s) => s.project?.scenarios);
  const { beneficiaries, resolution } = useShares();
  const setPanel = useMapUiStore((s) => s.setPanel);
  const openPage = useOpenProjectPage();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // localStorage is only readable after mount (no SSR mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(!!projectId && readDismissed().includes(projectId));
  }, [projectId]);

  if (!projectId || dismissed !== false) return null;

  const assigned = (scenarios ?? []).some(
    (s) => s.lots.length > 0 && s.lots.every((l) => l.beneficiaryId),
  );
  const steps: {
    key: "property" | "heirs" | "scenario" | "assign";
    done: boolean;
    panel: WorkspacePanel;
  }[] = [
    { key: "property", done: hasParcels, panel: "property" },
    {
      key: "heirs",
      done: beneficiaries.length > 0 && resolution.status === "complete",
      panel: "beneficiaries",
    },
    { key: "scenario", done: (scenarios?.length ?? 0) > 0, panel: "scenarios" },
    { key: "assign", done: assigned, panel: "scenarios" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const next = steps.find((s) => !s.done);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), projectId]));
    } catch {
      // Private mode: just hide for this session.
    }
    setDismissed(true);
  }

  return (
    <section
      className="mx-2 mt-2 rounded-lg border bg-primary/5 text-sm"
      aria-labelledby="getting-started-title"
      data-testid="getting-started"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span id="getting-started-title" className="truncate font-medium">
            {allDone ? t("allDoneTitle") : t("title")}
          </span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-xs text-primary tabular-nums">
            {doneCount}/{steps.length}
          </span>
          <ChevronDown
            className={cn(
              "ms-auto size-4 shrink-0 transition-transform",
              !open && "-rotate-90 rtl:rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <ol className="space-y-1">
            {steps.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setPanel(s.panel)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-start hover:bg-background",
                    s === next && "bg-background shadow-sm",
                  )}
                  data-done={s.done}
                >
                  <span
                    className={cn(
                      "mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                      s.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 text-muted-foreground",
                    )}
                  >
                    {s.done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block", s.done && "text-muted-foreground line-through")}>
                      {t(`steps.${s.key}.title`)}
                    </span>
                    {s === next && (
                      <span className="block text-xs text-muted-foreground">
                        {t(`steps.${s.key}.hint`)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {allDone && (
            <div className="flex flex-wrap gap-2 ps-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => void openPage("compare")}
              >
                <Columns2 className="size-3.5" /> {t("compare")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => void openPage("report", useMapUiStore.getState().activeScenarioId)}
              >
                <FileText className="size-3.5" /> {t("report")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
