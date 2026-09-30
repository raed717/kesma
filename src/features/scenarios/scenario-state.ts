"use client";

import { toast } from "sonner";
import type { Lot, Scenario } from "@/domain/model/project";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const NO_LOTS: Lot[] = [];

/** The scenario being edited: the selected one, or the first if none is selected. */
export function useActiveScenario(): Scenario | null {
  const activeId = useMapUiStore((s) => s.activeScenarioId);
  return useWorkspaceStore((s) => {
    const scenarios = s.project?.scenarios ?? [];
    return scenarios.find((x) => x.id === activeId) ?? scenarios[0] ?? null;
  });
}

/** Lots to display: the live drag preview if any, else the saved lots. */
export function useDisplayedLots(scenario: Scenario | null): Lot[] {
  const draft = useMapUiStore((s) => s.lotDraft);
  if (!scenario) return NO_LOTS;
  return draft && draft.scenarioId === scenario.id ? draft.lots : scenario.lots;
}

/** Replaces a scenario's lots (one save = one future undo step). */
export function setScenarioLots(scenarioId: string, lots: Lot[], immediate = true) {
  useWorkspaceStore.getState().update(
    (draft) => {
      const s = draft.scenarios.find((x) => x.id === scenarioId);
      if (!s) return;
      s.lots = lots;
      s.updatedAt = new Date().toISOString();
    },
    { immediate },
  );
}

export function getScenarioLots(scenarioId: string): Lot[] {
  return (
    useWorkspaceStore.getState().project?.scenarios.find((s) => s.id === scenarioId)?.lots ?? []
  );
}

/**
 * Assigns lots to a beneficiary (or unassigns with null). Locking freezes a lot's
 * geometry, not its assignment, so locked lots can be (re)assigned too.
 */
export function assignLots(scenarioId: string, lotIds: string[], beneficiaryId: string | null) {
  dismissLotUndo();
  useWorkspaceStore.getState().update((draft) => {
    const s = draft.scenarios.find((x) => x.id === scenarioId);
    if (!s) return;
    for (const lot of s.lots) {
      if (lotIds.includes(lot.id)) lot.beneficiaryId = beneficiaryId;
    }
    s.updatedAt = new Date().toISOString();
  });
}

/** A direct edit (drag, rename, lock…) makes a pending "undo" toast stale: dismiss it. */
export function dismissLotUndo() {
  toast.dismiss("lot-undo");
}

export function patchLot(scenarioId: string, lotId: string, recipe: (lot: Lot) => void) {
  dismissLotUndo();
  useWorkspaceStore.getState().update((draft) => {
    const s = draft.scenarios.find((x) => x.id === scenarioId);
    const lot = s?.lots.find((l) => l.id === lotId);
    if (!s || !lot) return;
    recipe(lot);
    s.updatedAt = new Date().toISOString();
  });
}
