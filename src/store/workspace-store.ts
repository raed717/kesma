"use client";

import { produce, type Draft } from "immer";
import { create } from "zustand";
import type { Project } from "@/domain/model/project";
import { getProjectRepository } from "@/storage";

export type LoadState = "idle" | "loading" | "ready" | "not-found" | "error";
export type SaveState = "saved" | "pending" | "saving" | "error";

const AUTOSAVE_DELAY_MS = 600;
/** Undo steps kept in memory (immer structural sharing keeps each step cheap). */
export const HISTORY_LIMIT = 100;

type WorkspaceState = {
  project: Project | null;
  loadState: LoadState;
  saveState: SaveState;
  /** Previous project states (most recent last) and undone states (most recent last). */
  past: Project[];
  future: Project[];
  load: (id: string) => Promise<void>;
  /**
   * Mutates the active project with an immer recipe and schedules an autosave.
   * `touch: false` saves without bumping `updatedAt` and without an undo step
   * (e.g. remembering the map view). `history: false` skips the undo step only.
   */
  update: (
    recipe: (draft: Draft<Project>) => void,
    options?: { touch?: boolean; immediate?: boolean; history?: boolean },
  ) => void;
  undo: () => void;
  redo: () => void;
  /** Writes pending changes immediately (e.g. before export or navigation). */
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let loadToken = 0;

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  async function persist() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const { project } = get();
    if (!project) return;
    set({ saveState: "saving" });
    try {
      await getProjectRepository().save(project);
      // A newer edit may have arrived while saving; keep it marked as pending.
      if (get().project === project) set({ saveState: "saved" });
    } catch (error) {
      console.error("[kesma] Autosave failed", error);
      set({ saveState: "error" });
    }
  }

  function schedule(immediate: boolean) {
    clearTimeout(saveTimer);
    // Hidden tabs throttle timers (up to a minute), so a debounced save could be lost.
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (immediate || hidden) void persist();
    else saveTimer = setTimeout(persist, AUTOSAVE_DELAY_MS);
  }

  /** Restores a history entry, keeping the current map view (undo shouldn't move the map). */
  function restore(target: Project, current: Project): Project {
    return target.mapView === current.mapView ? target : { ...target, mapView: current.mapView };
  }

  return {
    project: null,
    loadState: "idle",
    saveState: "saved",
    past: [],
    future: [],

    async load(id) {
      const token = ++loadToken;
      set({ loadState: "loading", project: null, saveState: "saved", past: [], future: [] });
      try {
        const project = await getProjectRepository().get(id);
        if (token !== loadToken) return;
        set(project ? { project, loadState: "ready" } : { loadState: "not-found" });
      } catch (error) {
        console.error("[kesma] Failed to load project", error);
        if (token === loadToken) set({ loadState: "error" });
      }
    },

    // `immediate`: skip the debounce for significant, discrete changes (imports, new or
    // deleted parcels) so a quick reload/close can't lose them.
    update(recipe, { touch = true, immediate = false, history = touch } = {}) {
      const { project, past } = get();
      if (!project) return;
      const next = produce(project, (draft) => {
        recipe(draft);
        if (touch) draft.updatedAt = new Date().toISOString();
      });
      if (next === project) return;
      set(
        history
          ? {
              project: next,
              saveState: "pending",
              past: [...past, project].slice(-HISTORY_LIMIT),
              future: [],
            }
          : { project: next, saveState: "pending" },
      );
      schedule(immediate);
    },

    undo() {
      const { project, past, future } = get();
      const previous = past.at(-1);
      if (!project || !previous) return;
      set({
        project: restore(previous, project),
        past: past.slice(0, -1),
        future: [...future, project],
        saveState: "pending",
      });
      schedule(true);
    },

    redo() {
      const { project, past, future } = get();
      const next = future.at(-1);
      if (!project || !next) return;
      set({
        project: restore(next, project),
        past: [...past, project].slice(-HISTORY_LIMIT),
        future: future.slice(0, -1),
        saveState: "pending",
      });
      schedule(true);
    },

    async flush() {
      if (get().saveState === "pending" || saveTimer) await persist();
    },

    async close() {
      // Reset synchronously, *then* save. Awaiting before the reset let a close() from a
      // previous mount cancel a load() started after it (React StrictMode mount → unmount
      // → mount), leaving the workspace stuck on "loading".
      const { project, saveState } = get();
      const unsaved = project && (saveState === "pending" || saveTimer) ? project : null;
      clearTimeout(saveTimer);
      saveTimer = undefined;
      loadToken++;
      set({ project: null, loadState: "idle", saveState: "saved", past: [], future: [] });
      if (!unsaved) return;
      try {
        await getProjectRepository().save(unsaved);
      } catch (error) {
        console.error("[kesma] Failed to save project on close", error);
      }
    },
  };
});
