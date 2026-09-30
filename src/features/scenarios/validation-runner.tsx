"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { ValidationResult } from "@/domain/validation";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useActiveScenario } from "./scenario-state";

type ValidationState = {
  scenarioId: string | null;
  result: ValidationResult | null;
  pending: boolean;
};

/** Latest validation of the active scenario, shared by the map and the side panel. */
export const useValidationStore = create<ValidationState>()(() => ({
  scenarioId: null,
  result: null,
  pending: false,
}));

const DEBOUNCE_MS = 150;

/**
 * Re-validates the active scenario when its saved lots, the property or the
 * beneficiaries change (not during a drag: drafts are not saved yet). JSTS is loaded lazily.
 */
export function ValidationRunner() {
  const scenario = useActiveScenario();
  const parcels = useWorkspaceStore((s) => s.project?.property.parcels);
  const beneficiaries = useWorkspaceStore((s) => s.project?.beneficiaries);
  const lots = scenario?.lots;
  const scenarioId = scenario?.id ?? null;

  useEffect(() => {
    if (!scenarioId || !lots || !parcels || !beneficiaries) {
      useValidationStore.setState({ scenarioId: null, result: null, pending: false });
      return;
    }
    let cancelled = false;
    useValidationStore.setState((s) => ({
      pending: true,
      // Keep showing the previous result of the same scenario while recomputing.
      ...(s.scenarioId !== scenarioId ? { scenarioId, result: null } : {}),
    }));
    const timer = setTimeout(async () => {
      const { validateScenario } = await import("@/domain/validation");
      if (cancelled) return;
      const result = validateScenario(
        lots,
        parcels.map((p) => p.geometry),
        beneficiaries,
      );
      if (!cancelled) useValidationStore.setState({ scenarioId, result, pending: false });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scenarioId, lots, parcels, beneficiaries]);

  return null;
}

/** Validation result for a scenario, or null if not (yet) computed for it. */
export function useValidation(scenarioId: string | null) {
  return useValidationStore(
    useShallow((s) =>
      s.scenarioId === scenarioId
        ? { result: s.result, pending: s.pending }
        : { result: null, pending: true },
    ),
  );
}
