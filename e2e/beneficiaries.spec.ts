import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLES = join(__dirname, "..", "samples");

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

async function projectWithProperty(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E heirs");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Import file" }).first().click();
  await page
    .getByTestId("property-import-input")
    .setInputFiles(join(SAMPLES, "01-ben-ali-property.geojson"));
  await page.getByRole("button", { name: "Import 2 parcels" }).click();
  await expect(page.getByTestId("property-total-area")).toHaveText("10.8992 ha");
  await page.getByRole("tab", { name: "Heirs" }).click();
}

const row = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Beneficiaries" })
    .getByRole("button", { name: new RegExp(`^${name}`) });

test("spouse 1/8, remainder split 2:2:1 between children — exact shares and targets", async ({
  page,
}) => {
  await projectWithProperty(page);

  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Add a beneficiary" }).first().click();
  await expect(page.getByTestId("share-status")).toHaveText("Shares add up to the whole property.");
  await expect(page.getByTestId("beneficiary-share")).toHaveText(Array(4).fill("1/4 · 25%"));

  // Heir 1 → spouse, fixed 1/8
  await row(page, "Heir 1").click();
  await page.getByLabel("Name", { exact: true }).fill("Spouse");
  await page.getByRole("radio", { name: "Fraction" }).click();
  await expect(page.getByLabel("Fraction of the property")).toHaveValue("1/4");
  await page.getByLabel("Fraction of the property").fill("1/8");
  await page.getByLabel("Fraction of the property").press("Enter");

  // Heirs 2 and 3 → sons, weight 2 in the remainder
  for (const name of ["Heir 2", "Heir 3"]) {
    await row(page, name).click();
    await page.getByLabel("Weight in the remainder").fill("2");
    await page.getByLabel("Weight in the remainder").press("Enter");
  }

  await expect(page.getByTestId("beneficiary-share")).toHaveText([
    "1/8 · 12.5%",
    "7/20 · 35%",
    "7/20 · 35%",
    "7/40 · 17.5%",
  ]);
  await expect(page.getByTestId("share-status")).toHaveText("Shares add up to the whole property.");
  await expect(row(page, "Spouse")).toBeVisible();
});

test("fixed shares that do not add up are reported exactly", async ({ page }) => {
  await projectWithProperty(page);
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Add a beneficiary" }).first().click();

  for (const [name, value] of [
    ["Heir 1", "1/2"],
    ["Heir 2", "1/3"],
  ] as const) {
    await row(page, name).click();
    await page.getByRole("radio", { name: "Fraction" }).click();
    await page.getByLabel("Fraction of the property").fill(value);
    await page.getByLabel("Fraction of the property").press("Enter");
  }
  await expect(page.getByTestId("share-status")).toHaveText(
    /^Not yet allocated: 1\/6 · 16\.67% · /,
  );

  await page.getByLabel("Fraction of the property").fill("2/3");
  await page.getByLabel("Fraction of the property").press("Enter");
  await expect(page.getByTestId("share-status")).toHaveText(
    /^Shares exceed the property by 1\/6 · /,
  );

  await page.getByLabel("Fraction of the property").fill("1/0");
  await page.getByLabel("Fraction of the property").press("Enter");
  await expect(page.getByText("Enter a fraction such as 1/8")).toBeVisible();
});
