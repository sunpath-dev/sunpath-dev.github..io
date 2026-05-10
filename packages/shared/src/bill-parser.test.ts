import { describe, expect, it } from "vitest";
import { parseBillText, parseBillDate } from "./bill-parser.js";

describe("parseBillDate", () => {
  it("parses MM/DD/YYYY", () => {
    expect(parseBillDate("04/12/2026")).toBe("2026-04-12");
  });
  it("parses M/D/YY", () => {
    expect(parseBillDate("4/12/26")).toBe("2026-04-12");
  });
  it("parses 'April 12, 2026'", () => {
    expect(parseBillDate("April 12, 2026")).toBe("2026-04-12");
  });
  it("returns null on garbage", () => {
    expect(parseBillDate("not a date")).toBeNull();
  });
});

describe("parseBillText", () => {
  it("extracts kWh, rate, total, period from a tidy bill", () => {
    const text = `Appalachian Power
      Service Period: 03/12/2026 to 04/11/2026
      Total Usage 1,234 kWh
      Rate: $0.1234 per kWh
      Amount Due: $152.32`;
    const r = parseBillText(text);
    expect(r.utility_name).toBe("Appalachian Power");
    expect(r.total_kwh).toBe(1234);
    expect(r.rate_kwh_usd).toBeCloseTo(0.1234, 4);
    expect(r.total_amount_usd).toBeCloseTo(152.32, 2);
    expect(r.billing_period_start).toBe("2026-03-12");
    expect(r.billing_period_end).toBe("2026-04-11");
  });

  it("derives rate from total and kWh when no explicit rate is shown", () => {
    const text = `Holston Electric
      Total Usage: 1000 kWh
      Total Due $123.00`;
    const r = parseBillText(text);
    expect(r.total_kwh).toBe(1000);
    expect(r.total_amount_usd).toBe(123);
    expect(r.rate_kwh_usd).toBeCloseTo(0.123, 3);
  });

  it("returns nulls when nothing parseable is present", () => {
    const r = parseBillText("just some random text without electric bill data");
    expect(r.total_kwh).toBeNull();
    expect(r.rate_kwh_usd).toBeNull();
    expect(r.total_amount_usd).toBeNull();
  });

  it("identifies known SW Virginia / TN utilities", () => {
    expect(parseBillText("Powell Valley Electric Coop bill").utility_name).toBe(
      "Powell Valley Electric",
    );
    expect(parseBillText("Tennessee Valley Authority").utility_name).toBe(
      "Tennessee Valley Authority",
    );
  });
});
