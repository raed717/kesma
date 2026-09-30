"use client";

import { create } from "zustand";
import type { Position } from "@/domain/model/geojson";

export type MapTool = "pan" | "measure-distance" | "measure-area" | "draw-property";

export const isMeasureTool = (tool: MapTool) =>
  tool === "measure-distance" || tool === "measure-area";

type MapUiState = {
  tool: MapTool;
  measurePoints: Position[];
  /** True once the user finished the measurement (double-click / Enter). */
  measureFinished: boolean;
  selectedParcelId: string | null;
  setTool: (tool: MapTool) => void;
  addMeasurePoint: (point: Position) => void;
  undoMeasurePoint: () => void;
  finishMeasure: () => void;
  clearMeasure: () => void;
  selectParcel: (id: string | null) => void;
};

export const useMapUiStore = create<MapUiState>()((set) => ({
  tool: "pan",
  measurePoints: [],
  measureFinished: false,
  selectedParcelId: null,
  setTool: (tool) => set({ tool, measurePoints: [], measureFinished: false }),
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
}));
