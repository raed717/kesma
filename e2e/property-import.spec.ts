import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLES = join(__dirname, "..", "samples");

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

async function newProject(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/projects\//);
}

test("import a Tunisian Shapefile (.prj Carthage / Nord Tunisie) and see it on the map", async ({
  page,
}) => {
  await newProject(page, "E2E Shapefile import");

  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "04-ben-ali-shapefile-carthage-nord.zip"));

  await expect(page.getByText("Read from the .prj file: Carthage / Nord Tunisie.")).toBeVisible();
  await expect(page.getByText("Located in Tunisia")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 parcels" }).click();

  await expect(page.getByTestId("property-total-area")).toHaveText("10.8992 ha");
  const list = page.getByRole("list", { name: "Original parcels" });
  await expect(list.getByText("Terre agricole — Henchir")).toBeVisible();
  await expect(list.getByText("Maison familiale")).toBeVisible();

  // Persisted: survives a reload.
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("property-total-area")).toHaveText("10.8992 ha");
});

test("CSV without CRS: map columns, accept the suggested Carthage system", async ({ page }) => {
  await newProject(page, "E2E CSV import");

  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "05-ben-ali-boundary-carthage-nord.csv"));

  await expect(page.getByLabel("X / Longitude column")).toHaveValue("1");
  await expect(page.getByLabel("Y / Latitude column")).toHaveValue("2");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByLabel("Coordinate system of the file")).toHaveValue("EPSG:22391");
  await expect(page.getByText(/No coordinate system declared/)).toBeVisible();
  await page.getByRole("button", { name: "Import 1 parcel" }).click();

  await expect(page.getByTestId("property-total-area")).toHaveText("10.5986 ha");
});

test("unsupported file shows a readable error", async ({ page }) => {
  await newProject(page, "E2E bad file");
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page.getByTestId("property-import-input").setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByRole("alert")).toHaveText("This file type is not supported.");
});
