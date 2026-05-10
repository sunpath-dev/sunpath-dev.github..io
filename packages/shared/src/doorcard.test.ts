import { describe, it, expect } from "vitest";
import { callbackUrl, renderDoorcardHtml } from "./doorcard.js";

describe("callbackUrl", () => {
  it("strips dashes and uses first 8 hex chars", () => {
    const u = callbackUrl(
      "https://sunpath.dev",
      "11111111-2222-3333-4444-555555555555",
    );
    expect(u).toBe("https://sunpath.dev/#/d/11111111");
  });
  it("trims trailing slash on origin", () => {
    const u = callbackUrl("https://sunpath.dev/", "abcdef01-0000-0000-0000-000000000000");
    expect(u).toBe("https://sunpath.dev/#/d/abcdef01");
  });
});

describe("renderDoorcardHtml", () => {
  it("includes address, score, callback URL, and savings", () => {
    const html = renderDoorcardHtml({
      parcel_id: "abcdef01-0000-0000-0000-000000000000",
      address: "123 Main St & Co",
      score: 78,
      est_annual_kwh: 9500,
      est_annual_savings_usd: 1300,
      rep_name: "Tom",
      origin: "https://sunpath.dev",
    });
    expect(html).toContain("123 Main St &amp; Co");
    expect(html).toContain("78/100");
    expect(html).toContain("9,500 kWh");
    expect(html).toContain("$1,300");
    expect(html).toContain("/#/d/abcdef01");
    expect(html).toContain("Tom");
  });
  it("renders em-dash for missing score and skips empty estimates", () => {
    const html = renderDoorcardHtml({
      parcel_id: "abcdef01-0000-0000-0000-000000000000",
      address: "1 A St",
      score: null,
      origin: "https://sunpath.dev",
    });
    expect(html).toContain("Roof score —");
    expect(html).not.toContain("kWh/yr");
    expect(html).not.toContain("annual savings");
  });
  it("escapes script tags in address", () => {
    const html = renderDoorcardHtml({
      parcel_id: "abcdef01-0000-0000-0000-000000000000",
      address: "<script>alert(1)</script>",
      score: 50,
      origin: "https://sunpath.dev",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
