import { expect, test } from "@playwright/test";
import { installMockWebSocket, mockBackend, sessionID } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installMockWebSocket(page);
  await mockBackend(page);
});

test("WebSocket connects within 5 seconds of arriving at /session/:id", async ({
  page,
}) => {
  await page.goto(`/session/${sessionID}`);

  await expect(page.getByText("connected")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Welcome. Tell me about the role")).toBeVisible();
});

test("Sending a turn receives an AI response within 10 seconds", async ({
  page,
}) => {
  await page.goto(`/session/${sessionID}`);

  await page.getByLabel("Candidate answer").fill("I led a product launch.");
  await page.getByRole("button", { name: "Send answer" }).click();

  await expect(
    page.getByText("Good. What was the measurable outcome?"),
  ).toBeVisible({
    timeout: 10_000,
  });
});

test("End Session modal appears when button is clicked", async ({ page }) => {
  await page.goto(`/session/${sessionID}`);

  await page
    .getByRole("button", { name: "End interview session" })
    .first()
    .click();

  await expect(page.getByText("End this interview?")).toBeVisible();
});

test("Confirming End Session navigates to /report page", async ({ page }) => {
  await page.goto(`/session/${sessionID}`);

  await page
    .getByRole("button", { name: "End interview session" })
    .first()
    .click();
  await page.getByRole("button", { name: "End Session" }).click();

  await expect(page).toHaveURL(new RegExp(`/session/${sessionID}/report$`));
});
