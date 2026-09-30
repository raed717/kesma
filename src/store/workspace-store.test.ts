// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("saves immediately while the tab is hidden (timers are throttled there)", async () => {
    await store().load("p1");
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      store().update((d) => void (d.name = "Hidden edit"));
      await settle();
      expect((await getProjectRepository().get("p1"))?.name).toBe("Hidden edit");
    } finally {
      spy.mockRestore();
    }
  });

  it("undo / redo restore previous states and are saved", async () => {
    await store().load("p1");
    const original = store().project!.name;
    store().update((d) => void (d.name = "One"));
    store().update((d) => void (d.name = "Two"));
    store().undo();
    expect(store().project!.name).toBe("One");
    store().undo();
    expect(store().project!.name).toBe(original);
    store().undo(); // nothing left: no-op
    expect(store().project!.name).toBe(original);
    store().redo();
    expect(store().project!.name).toBe("One");
    await settle();
    expect((await getProjectRepository().get("p1"))?.name).toBe("One");
    // A new edit clears the redo stack.
    store().update((d) => void (d.name = "Three"));
    store().redo();
    expect(store().project!.name).toBe("Three");
  });

  it("map-view updates are not undo steps, and undo keeps the current view", async () => {
    await store().load("p1");
    store().update((d) => void (d.name = "Named"));
    store().update(
      (d) => void (d.mapView = { longitude: 10, latitude: 36, zoom: 12, basemap: "streets" }),
      { touch: false },
    );
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().project!.name).not.toBe("Named");
    expect(store().project!.mapView?.basemap).toBe("streets");
  });

  it("caps the history", async () => {
    await store().load("p1");
    for (let i = 0; i < 120; i++) store().update((d) => void (d.name = `n${i}`));
    expect(store().past.length).toBe(100);
  });

  it("close() still saves pending edits", async () => {
    await store().load("p1");
    store().update((d) => void (d.name = "Renamed"));
    expect(store().saveState).toBe("pending");
    await store().close();
    expect((await getProjectRepository().get("p1"))?.name).toBe("Renamed");
  });
});
