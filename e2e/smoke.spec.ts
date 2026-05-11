import { test, expect } from "@playwright/test";

test.describe("landing screen", () => {
  test("shows sign-in screen when no session is present", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/sunpath/i);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
