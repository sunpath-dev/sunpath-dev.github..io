/**
 * Bill redaction — strips PII from raw OCR'd bill text before it leaves
 * the device. Goal: keep the parser inputs (kWh, $/kWh, totals, dates)
 * but scrub anything that could ID the customer.
 *
 * What we scrub:
 *  - Account numbers (after "account", "acct", "service no", etc.)
 *  - SSN-like 9-digit groups (123-45-6789 or 123456789 in context)
 *  - Credit-card-shaped 13-19 digit groups
 *  - Email addresses
 *
 * What we KEEP (the parser needs these):
 *  - kWh values, dollar amounts, dates, billing-period strings
 *  - Utility names, address-shaped lines (handled by parser, not us)
 *
 * This runs locally in the bill module BEFORE the text gets persisted
 * or shipped to Storage. It's intentionally conservative — false negatives
 * are okay (the user can hand-edit), false positives (mangling kWh values)
 * are not.
 */

const REDACTED = "[REDACTED]";

// "account #: 1234567890" / "acct no 12345-6789" / "service number: 9876543"
const ACCOUNT_KEY_DIGITS =
  /(\b(?:account(?:\s*(?:no|number|#))?|acct(?:\s*(?:no|number|#))?|service\s*(?:no|number|#)|customer\s*(?:no|number|#))\s*[:#]?\s*)([0-9][0-9\- ]{5,24})/gi;

// SSN — 3-2-4 hyphenated form.
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

// 13-19 contiguous digits with optional dashes/spaces (cards, long acct nums).
// We require at least 13 because $/kWh and totals don't reach that length.
const LONG_DIGIT_RUN = /\b(?:\d[\s-]?){12,18}\d\b/g;

// Email
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function redactBillText(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(ACCOUNT_KEY_DIGITS, (_m, key: string) => `${key}${REDACTED}`);
  out = out.replace(SSN, REDACTED);
  out = out.replace(LONG_DIGIT_RUN, REDACTED);
  out = out.replace(EMAIL, REDACTED);
  return out;
}
