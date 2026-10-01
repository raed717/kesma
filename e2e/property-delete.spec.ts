import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLES = join(__dirname, "..", "samples");

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

test("scenarios follow the property: adapted when a parcel is deleted, removed with the last one", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E property delete");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "01-ben-ali-property.geojson"));
  await page.getByRole("button", { name: "Import 2 parcels" }).click();

  // A scenario made from the property: one lot per parcel.
  await page.getByRole("tab", { name: "Scenarios" }).click();
  await page.getByRole("button", { name: "New scenario from the property" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  const lotRows = page.getByRole("list", { name: "Lots" }).locator("> li > button");
  await expect(lotRows).toHaveCount(2);

  // Delete the house plot: the dialog explains the impact; its lot disappears.
  await page.getByRole("tab", { name: "Property" }).click();
  const parcels = page.getByRole("list", { name: "Original parcels" });
  await parcels.getByRole("button", { name: /Maison familiale/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("delete-impact")).toContainText("adapted");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/^Parcel deleted/)).toBeVisible();

  await page.getByRole("tab", { name: "Scenarios" }).click();
  await expect(lotRows).toHaveCount(1);

  // Delete the last parcel: the scenario goes with it.
  await page.getByRole("tab", { name: "Property" }).click();
  await parcels.getByRole("button", { name: /Terre agricole/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("delete-impact")).toContainText("last parcel");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("tab", { name: "Scenarios" }).click();
  await expect(page.getByText("Import the property first")).toBeVisible();

  // One Ctrl+Z restores the parcel and its scenario together.
  await page.keyboard.press("Control+z");
  await expect(lotRows).toHaveCount(1);
});
