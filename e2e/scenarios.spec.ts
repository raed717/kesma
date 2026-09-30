import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLES = join(__dirname, "..", "samples");
const SHOTS = process.env.E2E_SHOTS; // optional folder for review screenshots

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function setup(page: Page) {
  await page.setViewportSize({ width: 1400, height: 850 });
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E scenarios");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "01-ben-ali-property.geojson"));
  await page.getByRole("button", { name: "Import 2 parcels" }).click();
  await expect(page.getByTestId("property-total-area")).toHaveText("10.8992 ha");
  await page.getByRole("tab", { name: "Scenarios" }).click();
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__kesmaMap?.isStyleLoaded(),
    undefined,
    { timeout: 20_000 },
  );
  // Zoom out one level so lines/shapes drawn beyond the property stay on the map canvas.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    map.jumpTo({ zoom: map.getZoom() - 1 });
  });
}

/** Screen position (page coordinates) of a lon/lat, via the dev-only map handle. */
async function toScreen(page: Page, lngLat: [number, number]) {
  return page.evaluate(([lng, lat]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const rect = map.getCanvas().getBoundingClientRect();
    const p = map.project([lng, lat]);
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, lngLat);
}

/** Bounding box of the lots currently displayed, in lon/lat. */
async function lotsBbox(page: Page) {
  return page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const data = await map.getSource("lots").getData();
    const pts = data.features.flatMap(
      (f: { geometry: { coordinates: number[][][] } }) => f.geometry.coordinates[0],
    );
    const xs = pts.map((p: number[]) => p[0]);
    const ys = pts.map((p: number[]) => p[1]);
    return { w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys) };
  });
}

const lotAreas = (page: Page) => page.getByTestId("lot-area").allTextContents();
const coverage = (page: Page) => page.getByTestId("scenario-coverage");

test("scenario from property → cut → drag shared corner → merge", async ({ page }) => {
  await setup(page);
  const rows = page.getByRole("list", { name: "Lots" }).locator("> li > button");
  const areaOf = async () => (await lotAreas(page)).map((s) => parseFloat(s.replace(",", ".")));
  await shot(page, "s4-01-empty");

  await page.getByRole("button", { name: "New scenario from the property" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(rows).toHaveCount(2);
  await expect(coverage(page)).toHaveText("2 lots · 10.8992 ha of 10.8992 ha (100%)");
  await page.waitForTimeout(1000);

  // Cut with a north–south line through the middle: it crosses the farmland only
  // (the house plot is further west), so 2 lots become 3.
  const b = await lotsBbox(page);
  const midX = (b.w + b.e) / 2;
  const top = await toScreen(page, [midX, b.n + (b.n - b.s) * 0.1]);
  const bottom = await toScreen(page, [midX, b.s - (b.n - b.s) * 0.1]);
  await page.getByRole("button", { name: "Cut" }).click();
  await page.mouse.move(top.x, top.y);
  await page.mouse.click(top.x, top.y);
  await page.mouse.move(bottom.x, bottom.y, { steps: 5 });
  await page.mouse.click(bottom.x, bottom.y);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Cut done/)).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(coverage(page)).toHaveText("3 lots · 10.8992 ha of 10.8992 ha (100%)");
  await page.waitForTimeout(500);
  await shot(page, "s4-02-cut");

  // The two farmland halves are the two largest lots.
  const areasBefore = await areaOf();
  const order = areasBefore
    .map((a, i) => [a, i])
    .sort((x, y) => y[0] - x[0])
    .map(([, i]) => i);
  const [halfA, halfB] = order;

  // Select one half and drag a corner it shares with the other half.
  await rows.nth(halfA).click();
  await page.waitForTimeout(1200); // fit animation
  const shared = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const data = await map.getSource("lot-vertices").getData();
    const f = data.features.find((x: { properties: { shared: boolean } }) => x.properties.shared);
    return f.geometry.coordinates as [number, number];
  });
  const from = await toScreen(page, shared);
  await shot(page, "s4-03-selected");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 10, { steps: 8 });
  await shot(page, "s4-04-dragging");
  await page.mouse.up();
  await page.waitForTimeout(300);

  const areasAfter = await areaOf();
  expect(Math.abs(areasAfter[halfA] - areasBefore[halfA])).toBeGreaterThan(0.01); // lots changed…
  expect(areasAfter[halfA] + areasAfter[halfB]).toBeCloseTo(
    areasBefore[halfA] + areasBefore[halfB],
    3,
  );
  await expect(coverage(page)).toHaveText("3 lots · 10.8992 ha of 10.8992 ha (100%)"); // …no gap, no overlap
  await shot(page, "s4-05-dragged");

  // Merge the two halves back.
  await rows.nth(halfA).click();
  await rows.nth(halfB).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("2 lots merged")).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(coverage(page)).toHaveText("2 lots · 10.8992 ha of 10.8992 ha (100%)");

  // Undo from the toast restores the 3 lots.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows).toHaveCount(3);

  // Persisted after reload.
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  await page.reload();
  await page.getByRole("tab", { name: "Scenarios" }).click();
  await expect(rows).toHaveCount(3);
});

test("draw a lot in an empty scenario: clipped to the property", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "New empty scenario" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("No lots yet")).toBeVisible();
  await page.waitForTimeout(800);

  // Draw a big square around the whole property → clipped to it.
  const b = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const data = await map.getSource("property").getData();
    const pts = data.features.flatMap(
      (f: { geometry: { coordinates: number[][][] } }) => f.geometry.coordinates[0],
    );
    const xs = pts.map((p: number[]) => p[0]);
    const ys = pts.map((p: number[]) => p[1]);
    return { w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys) };
  });
  const pad = 0.0005;
  const corners: [number, number][] = [
    [b.w - pad, b.n + pad],
    [b.e + pad, b.n + pad],
    [b.e + pad, b.s - pad],
    [b.w - pad, b.s - pad],
  ];
  await page.getByRole("button", { name: "Draw a lot" }).click();
  for (const c of corners) {
    const p = await toScreen(page, c);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");
  await expect(page.getByText("Lot added")).toBeVisible();
  // Only the part inside the property remains (the two parcels touch → one lot).
  await expect(coverage(page)).toHaveText(/^1 lot · 10\.89\d\d ha of 10\.8992 ha \(100%\)$/);
  await shot(page, "s4-06-drawn");
});
