import { test, expect } from "@playwright/test";

test.describe("landing screen", () => {
  test("shows the POC entry button when no session is present", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/sunpath/i);
    await expect(page.getByRole("button", { name: /enter as guest/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
