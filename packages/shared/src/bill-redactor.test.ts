import { describe, it, expect } from "vitest";
import { redactBillText } from "./bill-redactor.js";

describe("redactBillText", () => {
  it("redacts account numbers after the keyword", () => {
    const out = redactBillText("Account #: 1234567890\nUsage: 950 kWh");
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("950 kWh");
    expect(out).not.toContain("1234567890");
  });

  it("redacts acct: forms with dashes", () => {
    const out = redactBillText("Acct No 12-3456-7890");
    expect(out).not.toContain("12-3456-7890");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts SSN-shaped sequences", () => {
    const out = redactBillText("SSN 123-45-6789 on file");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("123-45-6789");
  });

  it("redacts long contiguous digit runs", () => {
    const out = redactBillText("4111 1111 1111 1111");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("4111 1111 1111 1111");
  });

  it("redacts emails", () => {
    const out = redactBillText("billing@example.com sent");
    expect(out).not.toContain("billing@example.com");
    expect(out).toContain("[REDACTED]");
  });

  it("preserves kWh and dollar amounts", () => {
    const text = "Total: $182.34 over 31 days at $0.119/kWh, 1532 kWh used";
    const out = redactBillText(text);
    expect(out).toContain("$182.34");
    expect(out).toContain("$0.119/kWh");
    expect(out).toContain("1532 kWh");
  });

  it("preserves short dates and amounts as-is", () => {
    const text = "Bill 04/15/2026 Due 05/01/2026";
    expect(redactBillText(text)).toBe(text);
  });

  it("is a no-op on empty/whitespace", () => {
    expect(redactBillText("")).toBe("");
    expect(redactBillText("   ")).toBe("   ");
  });
});
