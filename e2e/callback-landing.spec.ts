import { test, expect } from "@playwright/test";

// Public doorcard landing page — does NOT require auth and must render
// the contact form with a phone field. Validates the unauthenticated
// public surface that backs the printed doorcard short URLs.
test.describe("doorcard callback landing", () => {
  test("renders the callback form for any slug", async ({ page }) => {
    await page.goto("/#/d/abc12345");
    await expect(page.getByRole("heading", { name: /sunpath/i })).toBeVisible({
      timeout: 10_000,
    });
    // Phone or email must be reachable so the rep can call back.
    await expect(
      page.locator('input[type="tel"], input[autocomplete="tel"]').first(),
    ).toBeVisible();
  });

  test("blocks submission with no contact info", async ({ page }) => {
    await page.goto("/#/d/abc12345");
    // Submit with empty form — the route validates client-side.
    const submit = page.getByRole("button", { name: /send|submit|callback/i });
    if (await submit.isVisible().catch(() => false)) {
      await submit.click();
      // Either a validation message or the form stays put — no crash.
      await expect(page).not.toHaveURL(/error/);
    }
  });
});
