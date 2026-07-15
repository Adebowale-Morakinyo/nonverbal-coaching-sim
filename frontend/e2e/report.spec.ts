import { expect, test } from "@playwright/test";
import { mockBackend, sessionID } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("ReportPage renders 4 score dimensions", async ({ page }) => {
  await page.goto(`/session/${sessionID}/report`);

  await expect(page.getByText("Answer Structure")).toBeVisible();
  await expect(page.getByText("Reasoning Clarity")).toBeVisible();
  await expect(page.getByText("Use of Examples")).toBeVisible();
  await expect(page.getByText("Communication Quality")).toBeVisible();
});

test('"Practice Again" button navigates to /', async ({ page }) => {
  await page.goto(`/session/${sessionID}/report`);

  await page.getByRole("link", { name: "Practice again" }).click();

  await expect(page).toHaveURL(/\/$/);
});
