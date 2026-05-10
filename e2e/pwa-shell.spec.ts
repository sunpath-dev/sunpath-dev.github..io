import { test, expect } from "@playwright/test";

// PWA shell sanity. The Vite PWA plugin emits a manifest at
// /manifest.webmanifest and registers a service worker; reps install
// from "Add to Home Screen" so a missing manifest = broken install.
test.describe("pwa shell", () => {
  test("manifest is reachable and has required fields", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    expect(res?.status()).toBe(200);
    const text = await page.content();
    // The body is JSON wrapped in <pre>, so just look for the key.
    expect(text).toMatch(/"name"\s*:/);
    expect(text).toMatch(/"display"\s*:/);
    expect(text).toMatch(/"icons"\s*:/);
  });

  test("registers a service worker on the root", async ({ page }) => {
    await page.goto("/");
    const supported = await page.evaluate(() => "serviceWorker" in navigator);
    expect(supported).toBe(true);
  });
});
