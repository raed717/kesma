"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";
import type { LineString, Polygon } from "@/domain/model/geojson";
import type { Lot } from "@/domain/model/project";
import type { LotOpResult } from "@/domain/lot-operations";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { undoProjectChange } from "../workspace/history-controls";
import { getScenarioLots, setScenarioLots } from "./scenario-state";

/**
 * One undo toast at a time: an older one would restore a stale state and silently drop
 * later changes. Other lot edits dismiss it too (see scenario-state.ts).
 */
export const LOT_UNDO_TOAST = "lot-undo";

// JSTS (~300 kB) is only needed once the user edits lots.
const loadOps = () => import("@/domain/lot-operations");

/**
 * Lot editing actions for a scenario. Destructive results are applied immediately with an
 * "Undo" toast (full undo/redo history comes in Sprint 6).
 */
export function useLotActions(scenarioId: string | null) {
  const t = useTranslations("scenarios.toast");
  const tl = useTranslations("scenarios");

  const apply = useCallback(
    (before: Lot[], result: LotOpResult, success: string, select: boolean) => {
      if (!scenarioId) return false;
      if (!result.ok) {
        toast.error(t(`errors.${result.reason}`));
        return false;
      }
      setScenarioLots(scenarioId, result.lots);
      if (select) useMapUiStore.setState({ selectedLotIds: result.affectedIds });
      toast.success(success, {
        id: LOT_UNDO_TOAST,
        action: {
          label: t("undo"),
          // The operation is the latest history step (the toast is dismissed on any
          // other edit), so the toast's undo is simply the project undo.
          onClick: () => undoProjectChange(),
        },
      });
      return true;
    },
    [scenarioId, t],
  );

  const split = useCallback(
    async (line: LineString) => {
      if (!scenarioId) return;
      const { splitLots } = await loadOps();
      const before = getScenarioLots(scenarioId);
      const r = splitLots(before, line, tl("lotPrefix"));
      apply(before, r, t("split", { count: r.ok ? r.affectedIds.length : 0 }), true);
    },
    [scenarioId, apply, t, tl],
  );

  const addDrawn = useCallback(
    async (polygon: Polygon) => {
      if (!scenarioId) return;
      const { addDrawnLot } = await loadOps();
      const before = getScenarioLots(scenarioId);
      const property = (useWorkspaceStore.getState().project?.property.parcels ?? []).map(
        (p) => p.geometry,
      );
      const r = addDrawnLot(before, polygon, property, tl("lotPrefix"));
      apply(before, r, t("added", { count: r.ok ? r.affectedIds.length : 0 }), true);
    },
    [scenarioId, apply, t, tl],
  );

  const merge = useCallback(
    async (ids: string[]) => {
      if (!scenarioId) return;
      const { mergeLots } = await loadOps();
      const before = getScenarioLots(scenarioId);
      apply(before, mergeLots(before, ids), t("merged", { count: ids.length }), true);
    },
    [scenarioId, apply, t],
  );

  const remove = useCallback(
    (ids: string[]) => {
      if (!scenarioId || ids.length === 0) return;
      const before = getScenarioLots(scenarioId);
      if (before.some((l) => ids.includes(l.id) && l.locked)) {
        toast.error(t("errors.locked"));
        return;
      }
      const lots = before.filter((l) => !ids.includes(l.id));
      apply(before, { ok: true, lots, affectedIds: [] }, t("deleted", { count: ids.length }), true);
    },
    [scenarioId, apply, t],
  );

  // ---------- validation fixes ----------

  const property = () =>
    (useWorkspaceStore.getState().project?.property.parcels ?? []).map((p) => p.geometry);

  const fixGap = useCallback(
    async (gap: Polygon) => {
      if (!scenarioId) return;
      const { absorbGap } = await loadOps();
      const before = getScenarioLots(scenarioId);
      apply(before, absorbGap(before, gap, tl("lotPrefix")), t("fixed"), true);
    },
    [scenarioId, apply, t, tl],
  );

  const fixOverlap = useCallback(
    async (keepId: string, loseId: string) => {
      if (!scenarioId) return;
      const { resolveOverlap } = await loadOps();
      const before = getScenarioLots(scenarioId);
      apply(before, resolveOverlap(before, keepId, loseId, tl("lotPrefix")), t("fixed"), true);
    },
    [scenarioId, apply, t, tl],
  );

  const fixOutside = useCallback(
    async (lotId: string) => {
      if (!scenarioId) return;
      const { clipLotToProperty } = await loadOps();
      const before = getScenarioLots(scenarioId);
      apply(
        before,
        clipLotToProperty(before, lotId, property(), tl("lotPrefix")),
        t("fixed"),
        true,
      );
    },
    [scenarioId, apply, t, tl],
  );

  const fixInvalid = useCallback(
    async (lotId: string) => {
      if (!scenarioId) return;
      const { repairLot } = await loadOps();
      const before = getScenarioLots(scenarioId);
      apply(before, repairLot(before, lotId, tl("lotPrefix")), t("fixed"), true);
    },
    [scenarioId, apply, t, tl],
  );

  return { split, addDrawn, merge, remove, fixGap, fixOverlap, fixOutside, fixInvalid };
}
