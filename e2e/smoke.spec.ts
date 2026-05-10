import { test, expect } from "@playwright/test";

test.describe("landing screen", () => {
  test("shows the Enter the app button when no session is present", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/sunpath/i);
    await expect(page.getByRole("button", { name: /enter the app/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
