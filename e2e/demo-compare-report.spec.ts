import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

const SHOTS = process.env.E2E_SHOTS;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

test("demo project → exports → side-by-side comparison → printable report", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();

  // ---------- demo ----------
  await page.getByTestId("try-demo").click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 20_000 });
  const guide = page.getByTestId("getting-started");
  await expect(guide).toContainText("4/4");
  await expect(page.getByText("Irrigated field")).toBeVisible();

  // ---------- exports ----------
  await page.getByTestId("export-menu").click();
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Excel workbook (.xlsx)" }).click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toMatch(/^demo-family-olive-farm-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const zip = await JSZip.loadAsync(await readFile((await xlsx.path())!));
  const workbook = await zip.file("xl/workbook.xml")!.async("string");
  expect(workbook).toContain('name="Comparison"');
  expect(workbook).toContain('name="Beneficiaries"');
  expect(workbook).toContain("Strips by area · Allocation");
  const comparison = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  expect(comparison).toContain("Strips by value");

  await page.getByRole("tab", { name: "Scenarios" }).click();
  await page.getByTestId("export-menu").click();
  const geoDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /GeoJSON — property \+ “Strips by area”/ }).click();
  const geo = JSON.parse(await readFile((await (await geoDownload).path())!, "utf8"));
  const layers = geo.features.map(
    (f: { properties: { kesma_layer: string } }) => f.properties.kesma_layer,
  );
  expect(layers.filter((l: string) => l === "lot")).toHaveLength(4);
  expect(layers).toEqual(expect.arrayContaining(["parcel", "valueZone", "asset", "frontage"]));

  // ---------- comparison ----------
  await page.getByTestId("export-menu").click();
  await page.getByRole("menuitem", { name: "Compare scenarios…" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  const table = page.getByTestId("comparison-table");
  await expect(table).toBeVisible({ timeout: 20_000 });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Indicator",
    "AStrips by area",
    "BStrips by value",
    "Existing parcels",
  ]);
  // Area strips win on area deviation, value strips on value deviation.
  const maxArea = table.locator('tr[data-row="maxArea"] td');
  await expect(maxArea.nth(0)).toHaveAttribute("data-best", "true");
  await expect(table.locator('tr[data-row="maxValue"] td').nth(1)).toHaveAttribute(
    "data-best",
    "true",
  );
  // Ties are all highlighted: both strip scenarios give road access to everyone.
  const road = table.locator('tr[data-row="road"] td');
  await expect(road.nth(0)).toHaveAttribute("data-best", "true");
  await expect(road.nth(1)).toHaveAttribute("data-best", "true");
  await expect(road.nth(2)).not.toHaveAttribute("data-best", "true");

  // Both maps render and follow each other (same zoom → same scale bar).
  const canvases = page.locator(".maplibregl-canvas");
  await expect(canvases).toHaveCount(2);
  const box = (await page.getByTestId("compare-map-a").boundingBox())!;
  const views = () =>
    page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).__kesmaCompareMaps as any[]).map((m) => {
        const c = m.getCenter();
        return [+m.getZoom().toFixed(4), +c.lng.toFixed(6), +c.lat.toFixed(6)];
      }),
    );
  const before = await views();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(800);
  const after = await views();
  expect(after[0][0]).toBeGreaterThan(before[0][0]);
  expect(after[1]).toEqual(after[0]);
  // Dragging map B pans map A too.
  const boxB = (await page.getByTestId("compare-map-b").boundingBox())!;
  await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxB.x + boxB.width / 2 - 120, boxB.y + boxB.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const dragged = await views();
  expect(dragged[1][1]).not.toBe(after[1][1]);
  expect(dragged[0]).toEqual(dragged[1]);
  await shot(page, "s7-compare");

  // ---------- report ----------
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
  const paper = page.getByTestId("report-paper");
  await expect(paper).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("report-title")).toHaveText("Demo — Family olive farm");
  await expect(paper).toContainText("3. Proposed division — Strips by area");
  await expect(paper).toContainText("4 of 4 beneficiaries within tolerance");
  await expect(paper).toContainText("6. Geometry check");
  await expect(paper).toContainText("7. Comparison of scenarios");
  await expect(paper.locator("svg[role=img]")).toHaveCount(2);

  // Options: another scenario, notes and the coordinates appendix.
  await page.getByLabel("Scenario", { exact: true }).selectOption({ label: "Existing parcels" });
  await expect(paper).toContainText("3. Proposed division — Existing parcels");
  await page.getByLabel("Notes printed in the report").fill("Meeting on Friday.");
  await expect(paper).toContainText("Meeting on Friday.");
  await page.getByLabel("Append lot corner coordinates").check();
  await expect(paper).toContainText("Appendix — lot corner coordinates (WGS84)");
  await shot(page, "s7-report");
});
