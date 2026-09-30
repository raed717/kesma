// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getProjectRepository } from "@/storage";
import { sampleProject } from "@/test/fixtures";
import { useWorkspaceStore } from "./workspace-store";

const store = () => useWorkspaceStore.getState();

async function settle() {
  // Let pending IndexedDB work and microtasks finish.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
}

describe("workspace store", () => {
  beforeEach(async () => {
    await store().close();
    await getProjectRepository().save(sampleProject({ id: "p1" }));
  });

  it("loads a project", async () => {
    await store().load("p1");
    expect(store().loadState).toBe("ready");
    expect(store().project?.id).toBe("p1");
  });

  it("survives React StrictMode mount → unmount → mount (load, close, load)", async () => {
    void store().load("p1");
    void store().close();
    void store().load("p1");
    await settle();
    expect(store().loadState).toBe("ready");
    expect(store().project?.id).toBe("p1");
  });

  it("reports not-found", async () => {
    await store().load("missing");
    expect(store().loadState).toBe("not-found");
  });

  it("immediate updates are saved without waiting for the debounce", async () => {
    await store().load("p1");
    store().update((d) => void (d.name = "Now"), { immediate: true });
    await settle(); // ~100 ms, well under the 600 ms debounce
    expect(store().saveState).toBe("saved");
    expect((await getProjectRepository().get("p1"))?.name).toBe("Now");
  });

  it("close() still saves pending edits", async () => {
    await store().load("p1");
    store().update((d) => void (d.name = "Renamed"));
    expect(store().saveState).toBe("pending");
    await store().close();
    expect((await getProjectRepository().get("p1"))?.name).toBe("Renamed");
  });
});
