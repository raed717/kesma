import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLES = join(__dirname, "..", "samples");
const SHOTS = process.env.E2E_SHOTS;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function toScreen(page: Page, lngLat: [number, number]) {
  return page.evaluate(([lng, lat]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const rect = map.getCanvas().getBoundingClientRect();
    const p = map.project([lng, lat]);
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, lngLat);
}

test("assign lots, read the allocation, fix validation issues until valid", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E allocation");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "01-ben-ali-property.geojson"));
  await page.getByRole("button", { name: "Import 2 parcels" }).click();

  // Two heirs, equal shares.
  await page.getByRole("tab", { name: "Heirs" }).click();
  await page.getByRole("button", { name: "Add a beneficiary" }).first().click();
  await page.getByRole("button", { name: "Add a beneficiary" }).first().click();

  // Scenario from the property, then cut the farmland in two.
  await page.getByRole("tab", { name: "Scenarios" }).click();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.waitForFunction(() => (window as any).__kesmaMap?.isStyleLoaded(), undefined, {
    timeout: 20_000,
  });
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    map.jumpTo({ zoom: map.getZoom() - 1 });
  });
  await page.getByRole("button", { name: "New scenario from the property" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  const rows = page.getByRole("list", { name: "Lots" }).locator("> li > button");
  await expect(rows).toHaveCount(2);

  const b = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (window as any).__kesmaMap.getSource("lots").getData();
    const pts = data.features.flatMap(
      (f: { geometry: { coordinates: number[][][] } }) => f.geometry.coordinates[0],
    );
    const xs = pts.map((p: number[]) => p[0]);
    const ys = pts.map((p: number[]) => p[1]);
    return { w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys) };
  });
  const midX = (b.w + b.e) / 2;
  const top = await toScreen(page, [midX, b.n + (b.n - b.s) * 0.1]);
  const bottom = await toScreen(page, [midX, b.s - (b.n - b.s) * 0.1]);
  await page.getByRole("button", { name: "Cut" }).click();
  await page.mouse.move(top.x, top.y);
  await page.mouse.click(top.x, top.y);
  await page.mouse.move(bottom.x, bottom.y, { steps: 5 });
  await page.mouse.click(bottom.x, bottom.y);
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(3);

  // Before assigning: the scenario is not valid (3 unassigned lots at least).
  await expect(page.getByTestId("scenario-validity")).not.toHaveText("Valid");

  // Assign by area order: the two farmland halves to Heir 1 / Heir 2, the house to Heir 1.
  const areas = (await page.getByTestId("lot-area").allTextContents()).map((s) => parseFloat(s));
  const order = areas
    .map((a, i) => [a, i])
    .sort((x, y) => y[0] - x[0])
    .map(([, i]) => i);
  const assign = async (index: number, heir: string) => {
    await rows.nth(index).click();
    await page.getByLabel("Assigned to").selectOption({ label: heir });
  };
  await assign(order[0], "Heir 1");
  await assign(order[1], "Heir 2");
  await assign(order[2], "Heir 1");
  await shot(page, "s5-01-assigned");

  // Allocation view: both heirs have ~half; Heir 1 gets the house on top.
  await page.getByRole("tab", { name: "Allocation" }).click();
  await expect(page.getByTestId("allocation-row")).toHaveCount(2);
  await expect(page.getByTestId("allocation-unassigned")).toHaveCount(0);
  await shot(page, "s5-02-allocation");

  // Validation view: fix whatever geometric issue the data has, until "Valid".
  await page.getByRole("tab", { name: /^Validation/ }).click();
  await shot(page, "s5-03-validation");
  const issues = page.getByTestId("validation-issue");
  for (let guard = 0; guard < 5 && (await issues.count()) > 0; guard++) {
    const first = issues.first();
    await first
      .getByRole("button")
      .filter({ hasText: /Keep in|Attach|Cut at|Repair|Delete/ })
      .first()
      .click();
    await page.waitForTimeout(600);
  }
  await expect(page.getByTestId("scenario-validity")).toHaveText("Valid");
  await expect(page.getByText("No problems:", { exact: false })).toBeVisible();
  await shot(page, "s5-04-valid");
});
