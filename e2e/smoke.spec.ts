import { test, expect } from "@playwright/test";

test.describe("sign-in screen", () => {
  test("shows the sign-in form when no session is present", async ({ page }) => {
    await page.goto("/");
    // The SignInScreen renders before any module — assert by what's stable.
    await expect(page).toHaveTitle(/sunpath/i);
    // Either an email input or a magic-link CTA must be visible.
    const candidates = page.locator(
      'input[type="email"], input[name="email"], button:has-text("Send"), button:has-text("Sign in")',
    );
    await expect(candidates.first()).toBeVisible({ timeout: 10_000 });
  });
});
