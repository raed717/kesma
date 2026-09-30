"use client";

import { create } from "zustand";
import type { Position } from "@/domain/model/geojson";
import type { Lot } from "@/domain/model/project";

export type MapTool =
  | "pan"
  | "measure-distance"
  | "measure-area"
  | "draw-property"
  | "draw-lot"
  | "split-lot"
  | "draw-zone"
  | "draw-asset-point"
  | "draw-asset-area"
  | "draw-frontage";

export type PropertyView = "parcels" | "value";
export type ValueItemRef = { kind: "zone" | "asset" | "frontage"; id: string };

export type WorkspacePanel = "property" | "beneficiaries" | "scenarios" | "settings";
export type ScenarioView = "lots" | "allocation" | "validation";

export const isMeasureTool = (tool: MapTool) =>
  tool === "measure-distance" || tool === "measure-area";

export const isDrawTool = (tool: MapTool) => tool.startsWith("draw-") || tool === "split-lot";

type MapUiState = {
  tool: MapTool;
  panel: WorkspacePanel;
  measurePoints: Position[];
  /** True once the user finished the measurement (double-click / Enter). */
  measureFinished: boolean;
  selectedParcelId: string | null;
  activeScenarioId: string | null;
  selectedLotIds: string[];
  /** Live lots while a vertex is being dragged (not saved until the drag ends). */
  lotDraft: { scenarioId: string; lots: Lot[] } | null;
  scenarioView: ScenarioView;
  selectedIssueId: string | null;
  propertyView: PropertyView;
  selectedValueItem: ValueItemRef | null;
  setTool: (tool: MapTool) => void;
  setPanel: (panel: WorkspacePanel) => void;
  addMeasurePoint: (point: Position) => void;
  undoMeasurePoint: () => void;
  finishMeasure: () => void;
  clearMeasure: () => void;
  selectParcel: (id: string | null) => void;
  setActiveScenario: (id: string | null) => void;
  /** `additive` (shift-click) toggles the lot in a multi-selection. */
  selectLot: (id: string | null, additive?: boolean) => void;
  setLotDraft: (draft: MapUiState["lotDraft"]) => void;
  setScenarioView: (view: ScenarioView) => void;
  selectIssue: (id: string | null) => void;
  setPropertyView: (view: PropertyView) => void;
  selectValueItem: (item: ValueItemRef | null) => void;
  reset: () => void;
};

const initial = {
  tool: "pan" as MapTool,
  panel: "property" as WorkspacePanel,
  measurePoints: [],
  measureFinished: false,
  selectedParcelId: null,
  activeScenarioId: null,
  selectedLotIds: [],
  lotDraft: null,
  scenarioView: "lots" as ScenarioView,
  selectedIssueId: null,
  propertyView: "parcels" as PropertyView,
  selectedValueItem: null,
};

export const useMapUiStore = create<MapUiState>()((set) => ({
  ...initial,
  setTool: (tool) => set({ tool, measurePoints: [], measureFinished: false }),
  setPanel: (panel) => set({ panel, tool: "pan", measurePoints: [], measureFinished: false }),
  addMeasurePoint: (point) =>
    set((s) => {
      if (s.measureFinished) return { measurePoints: [point], measureFinished: false };
      // A double-click fires two clicks on the same spot: ignore the duplicate.
      const last = s.measurePoints.at(-1);
      if (last && last[0] === point[0] && last[1] === point[1]) return {};
      return { measurePoints: [...s.measurePoints, point] };
    }),
  undoMeasurePoint: () =>
    set((s) => ({ measurePoints: s.measurePoints.slice(0, -1), measureFinished: false })),
  finishMeasure: () => set({ measureFinished: true }),
  clearMeasure: () => set({ measurePoints: [], measureFinished: false }),
  selectParcel: (id) => set({ selectedParcelId: id }),
  setActiveScenario: (id) =>
    set({ activeScenarioId: id, selectedLotIds: [], lotDraft: null, selectedIssueId: null }),
  selectLot: (id, additive = false) =>
    set((s) => {
      if (id === null) return { selectedLotIds: [] };
      if (!additive) return { selectedLotIds: [id] };
      return {
        selectedLotIds: s.selectedLotIds.includes(id)
          ? s.selectedLotIds.filter((x) => x !== id)
          : [...s.selectedLotIds, id],
      };
    }),
  setLotDraft: (lotDraft) => set({ lotDraft }),
  setScenarioView: (scenarioView) => set({ scenarioView, selectedIssueId: null }),
  selectIssue: (selectedIssueId) => set({ selectedIssueId }),
  setPropertyView: (propertyView) => set({ propertyView, tool: "pan", selectedValueItem: null }),
  selectValueItem: (selectedValueItem) => set({ selectedValueItem }),
  reset: () => set(initial),
}));
