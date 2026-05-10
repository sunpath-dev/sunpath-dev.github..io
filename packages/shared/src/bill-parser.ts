// Pure utility-bill parser. Given OCR'd text from a residential electric
// bill, extracts kWh, $/kWh, total, billing-period dates, and the utility
// name when detectable. Designed to be tolerant — most bills are messy.
//
// Lives in @sunpath/shared so both the browser (Tesseract.js) and an
// optional server-side OCR pipeline can use the same extraction logic.

export interface BillFields {
  total_kwh: number | null;
  rate_kwh_usd: number | null;
  total_amount_usd: number | null;
  billing_period_start: string | null; // ISO yyyy-mm-dd
  billing_period_end: string | null;
  utility_name: string | null;
  /** Raw text we matched against, for debugging. */
  raw_excerpt: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Parse a date in any of:
 *   - 04/12/2026
 *   - 4/12/26
 *   - April 12, 2026
 *   - Apr 12 2026
 */
export function parseBillDate(s: string): string | null {
  const trimmed = s.trim();

  // Numeric MM/DD/YYYY or M/D/YY
  const numeric = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (numeric) {
    const m = Number(numeric[1]);
    const d = Number(numeric[2]);
    let y = Number(numeric[3]);
    if (y < 100) y += 2000;
    return toIso(y, m, d);
  }

  // Month-name "April 12, 2026" or "Apr 12 2026"
  const named = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (named) {
    const monKey = named[1]!.slice(0, 3).toLowerCase();
    const m = MONTHS[monKey];
    if (!m) return null;
    const d = Number(named[2]);
    let y = Number(named[3]);
    if (y < 100) y += 2000;
    return toIso(y, m, d);
  }

  return null;
}

const KNOWN_UTILITIES = [
  "Appalachian Power",
  "American Electric Power",
  "Dominion Energy",
  "Duke Energy",
  "Tennessee Valley Authority",
  "Holston Electric",
  "Powell Valley Electric",
  "BVU Authority",
];

function findUtility(text: string): string | null {
  const lc = text.toLowerCase();
  for (const u of KNOWN_UTILITIES) {
    if (lc.includes(u.toLowerCase())) return u;
  }
  return null;
}

function findKwh(text: string): number | null {
  // "Total Usage 1,234 kWh" or "kWh used: 1234" or "Energy Used (kWh) 1234"
  const candidates = [
    /(?:total[\s_]*(?:usage|kwh|energy(?:\s*used)?))\D{0,12}([\d,]+(?:\.\d+)?)\s*(?:k\s*wh|kwh)?/i,
    /([\d,]+(?:\.\d+)?)\s*k\s*wh\b/i,
    /kwh\s*(?:used|consumed)\D{0,5}([\d,]+(?:\.\d+)?)/i,
  ];
  for (const re of candidates) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]!.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0 && n < 50_000) return n;
    }
  }
  return null;
}

function findRate(text: string): number | null {
  // "$0.1234 per kWh" or "$0.12/kWh" or "rate ... 0.123"
  const m = text.match(
    /\$\s*(0?\.\d{2,5})\s*(?:per|\/)\s*k\s*wh/i,
  );
  if (m) {
    const n = Number(m[1]);
    if (n > 0 && n < 2) return n;
  }
  return null;
}

function findTotal(text: string): number | null {
  // "Total Due $123.45" or "Amount Due: $123.45" or "Total Charges 123.45"
  const m = text.match(
    /(?:total[\s_]*(?:due|charges|amount)|amount[\s_]*due|balance[\s_]*due)\D{0,8}\$?\s*([\d,]+\.\d{2})/i,
  );
  if (m) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (n > 0 && n < 100_000) return n;
  }
  return null;
}

function findPeriod(
  text: string,
): { start: string | null; end: string | null } {
  // "Service Period: 03/12/2026 to 04/11/2026" or
  // "Billing Period 03/12/2026 - 04/11/2026"
  // Match two date-shaped tokens (numeric or month-name) joined by to/-/through.
  const dateTok = "(?:[A-Za-z]{3,9}\\s+\\d{1,2},?\\s*\\d{2,4}|\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})";
  const re = new RegExp(
    `(?:service|billing)\\s*period[:\\s]*(${dateTok})\\s*(?:to|-|–|through)\\s*(${dateTok})`,
    "i",
  );
  const m = text.match(re);
  if (m) {
    return {
      start: parseBillDate(m[1]!),
      end: parseBillDate(m[2]!),
    };
  }
  return { start: null, end: null };
}

export function parseBillText(text: string): BillFields {
  const cleaned = text.replace(/\s+/g, " ");
  const period = findPeriod(cleaned);
  const total = findTotal(cleaned);
  const kwh = findKwh(cleaned);
  let rate = findRate(cleaned);
  // Backfill rate if we have total + kwh and no explicit rate
  if (rate === null && total !== null && kwh !== null && kwh > 0) {
    rate = Math.round((total / kwh) * 10000) / 10000;
  }
  return {
    total_kwh: kwh,
    rate_kwh_usd: rate,
    total_amount_usd: total,
    billing_period_start: period.start,
    billing_period_end: period.end,
    utility_name: findUtility(cleaned),
    raw_excerpt: cleaned.slice(0, 500),
  };
}
