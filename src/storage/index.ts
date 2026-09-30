import { DexieProjectRepository } from "./dexie-repository";
import type { ProjectRepository } from "./repository";

let instance: ProjectRepository | undefined;

/** Browser-only singleton. Swap the implementation here when a backend exists. */
export function getProjectRepository(): ProjectRepository {
  if (typeof window === "undefined") {
    throw new Error("The project repository is only available in the browser");
  }
  instance ??= new DexieProjectRepository();
  return instance;
}

/** Asks the browser not to evict IndexedDB under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export type { ProjectRepository } from "./repository";
export { ProjectFormatError } from "./migrations";
