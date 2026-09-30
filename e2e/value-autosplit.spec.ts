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

async function toScreen(page: Page, lngLat: number[]) {
  return page.evaluate(([lng, lat]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__kesmaMap;
    const rect = map.getCanvas().getBoundingClientRect();
    const p = map.project([lng, lat]);
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, lngLat);
}

async function clickAt(page: Page, lngLat: number[]) {
  const p = await toScreen(page, lngLat);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
}

test("value model → automatic division by value along the road → undo/redo → versions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E value");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "01-ben-ali-property.geojson"));
  await page.getByRole("button", { name: "Import 2 parcels" }).click();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.waitForFunction(() => (window as any).__kesmaMap?.isStyleLoaded(), undefined, {
    timeout: 20_000,
  });

  // Two heirs, equal shares.
  await page.getByRole("tab", { name: "Heirs" }).click();
  await page.getByRole("button", { name: "Add a beneficiary" }).first().click();
  await page.getByRole("button", { name: "Add a beneficiary" }).first().click();

  // ---------- value model ----------
  await page.getByRole("tab", { name: "Property" }).click();
  await page.getByRole("tab", { name: "Value & access" }).click();
  await page.getByLabel("Base value per m² (TND)").fill("10");
  await page.getByLabel("Base value per m² (TND)").press("Enter");

  // Farmland ring (as imported): [0]=SW, [1]=SE, [2]=NE, [3]=N, [4]=NW.
  const farm: number[][] = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (window as any).__kesmaMap.getSource("property").getData();
    const biggest = data.features.sort(
      (
        a: { geometry: { coordinates: number[][][] } },
        b: { geometry: { coordinates: number[][][] } },
      ) => b.geometry.coordinates[0].length - a.geometry.coordinates[0].length,
    )[0];
    return biggest.geometry.coordinates[0];
  });
  const [sw, se, ne, , nw] = farm;
  const mid = (a: number[], b: number[], t = 0.5) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];

  // A ×3 zone over the east half.
  await page.getByRole("button", { name: "Add zone" }).click();
  for (const p of [mid(sw, se), mid(se, se, 0), mid(ne, ne, 0), mid(nw, ne)])
    await clickAt(page, p);
  await page.keyboard.press("Enter");
  await page.getByLabel("Multiplier (e.g. 1.5)").fill("3");
  await page.getByLabel("Multiplier (e.g. 1.5)").press("Enter");

  // A well in the west half.
  await page.getByRole("button", { name: "Point" }).click();
  await clickAt(page, mid(mid(sw, nw), mid(se, ne), 0.25));
  await page.getByLabel("Value (TND)").fill("15000");
  await page.getByLabel("Value (TND)").press("Enter");

  // The road along the southern edge.
  await page.getByRole("button", { name: "Draw road" }).click();
  await clickAt(page, sw);
  await clickAt(page, se);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("property-value")).not.toHaveText("—");
  await shot(page, "s6-01-value-model");

  // ---------- automatic division ----------
  await page.getByRole("tab", { name: "Scenarios" }).click();
  await page.getByRole("button", { name: "Automatic division…" }).click();
  await page.getByRole("radio", { name: "Estimated value" }).click();
  await page.getByRole("button", { name: "Perpendicular to the road" }).click();
  await shot(page, "s6-02-autosplit-dialog");
  await page.getByRole("button", { name: "Create scenario" }).click();
  await expect(page.getByText(/^Scenario created/)).toBeVisible();

  // Allocation by value: both heirs within tolerance, both with road access.
  await page.getByRole("tab", { name: "Value", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Value", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("allocation-row").first()).toContainText("TND");
  const rows = page.getByTestId("allocation-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-status", "ok");
  await expect(rows.nth(1)).toHaveAttribute("data-status", "ok");
  await expect(page.locator('[data-testid="road-access"][data-access="true"]')).toHaveCount(2);
  await shot(page, "s6-03-allocation-value");

  // ---------- undo / redo ----------
  const scenarioSelect = page.getByLabel("Scenario", { exact: true });
  await expect(scenarioSelect.locator("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.getByText("No scenarios yet")).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(scenarioSelect.locator("option")).toHaveCount(1);

  // ---------- versions ----------
  await page.getByRole("tab", { name: /^Lots/ }).click();
  const lotRows = page.getByRole("list", { name: "Lots" }).locator("> li > button");
  const lotCount = await lotRows.count();
  await page.getByRole("button", { name: "Scenario actions" }).click();
  await page.getByRole("menuitem", { name: /^Versions/ }).click();
  await page.getByLabel("Version name").fill("Before deleting");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Before deleting", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await lotRows.first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(lotRows).toHaveCount(lotCount - 1);

  await page.getByRole("button", { name: "Scenario actions" }).click();
  await page.getByRole("menuitem", { name: /^Versions/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(lotRows).toHaveCount(lotCount);
  await shot(page, "s6-04-restored");
});
