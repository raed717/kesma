"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectAnalysis } from "@/domain/compare";
import type { Project } from "@/domain/model/project";
import { getProjectRepository } from "@/storage";

export type StoredProject =
  | { state: "loading" }
  | { state: "not-found" }
  | { state: "error" }
  | { state: "ready"; project: Project };

/** Read-only load of a saved project (comparison and report pages don't edit it). */
export function useStoredProject(id: string): StoredProject {
  const [result, setResult] = useState<StoredProject & { id?: string }>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    getProjectRepository()
      .get(id)
      .then((project) => {
        if (alive)
          setResult(project ? { state: "ready", project, id } : { state: "not-found", id });
      })
      .catch((error) => {
        console.error("[kesma] Failed to load project", error);
        if (alive) setResult({ state: "error", id });
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return result.id === id ? result : { state: "loading" };
}

type CompareModule = typeof import("@/domain/compare");
let modulePromise: Promise<CompareModule> | null = null;

/** Full analysis of the project (lazy-loads JSTS once). Null while loading. */
export function useProjectAnalysis(project: Project | null): ProjectAnalysis | null {
  const [mod, setMod] = useState<CompareModule | null>(null);
  useEffect(() => {
    let alive = true;
    modulePromise ??= import("@/domain/compare");
    void modulePromise.then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => (mod && project ? mod.analyzeProject(project) : null), [mod, project]);
}
