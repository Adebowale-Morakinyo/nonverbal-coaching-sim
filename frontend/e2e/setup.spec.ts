import { expect, test } from "@playwright/test";
import { mockBackend, sessionID } from "./helpers";

test("SetupPage renders with all three interview type options", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Nonverbal Coaching Simulator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Behavioural" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Technical" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mixed" })).toBeVisible();
});

test("Submitting the form navigates to /session/:id", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");

  await page.getByLabel("Your name").fill("Taylor");
  await page.getByRole("button", { name: "Start interview session" }).click();

  await expect(page).toHaveURL(new RegExp(`/session/${sessionID}$`));
});
