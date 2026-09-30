import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
});

test("create a project, reload, it is still there", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "I understand" }).click();

  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("E2E Family Project");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByLabel("Project name")).toHaveValue("E2E Family Project");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "E2E Family Project" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "E2E Family Project" })).toBeVisible();
});
