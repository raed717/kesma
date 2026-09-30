"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectSummary } from "@/domain/model/project";
import { getProjectRepository } from "@/storage";

async function fetchProjects(): Promise<ProjectSummary[]> {
  try {
    return await getProjectRepository().list();
  } catch (e) {
    console.error("[kesma] Failed to list projects", e);
    return [];
  }
}

export function useProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProjects().then((list) => {
      if (!cancelled) setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => setProjects(await fetchProjects()), []);

  return { projects, reload };
}
