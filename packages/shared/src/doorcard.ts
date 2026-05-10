// Doorcard generator — pure helper that returns a printable HTML
// document for a leave-behind card. The rep opens this in a new
// window/tab; the browser's native Print → PDF flow handles export.
//
// Avoids a jsPDF dependency entirely. Works on iOS Safari (Share → Print
// → Save to Files) and Android Chrome (Print → Save as PDF).

export interface DoorcardData {
  /** Stable parcel id for the callback URL slug. */
  parcel_id: string;
  /** Street address, single line. */
  address: string;
  /** Knock score 0-100, or null when unscored / excluded. */
  score: number | null;
  /** PVWatts annual production estimate in kWh, optional. */
  est_annual_kwh?: number | null;
  /** Estimated annual savings in USD, optional. */
  est_annual_savings_usd?: number | null;
  /** Sales rep first name to sign the card. */
  rep_name?: string | null;
  /** Origin to build the callback short URL against (e.g. https://sunpath.dev). */
  origin: string;
}

/** Build the callback short URL for a parcel. */
export function callbackUrl(origin: string, parcelId: string): string {
  // Use first 8 chars of UUID as a friendly slug; rep page will accept full UUID too.
  const slug = parcelId.replace(/-/g, "").slice(0, 8);
  return `${origin.replace(/\/$/, "")}/#/d/${slug}`;
}

/** Render a self-contained printable HTML document for the doorcard. */
export function renderDoorcardHtml(data: DoorcardData): string {
  const url = callbackUrl(data.origin, data.parcel_id);
  const escAddr = escapeHtml(data.address);
  const escRep = escapeHtml(data.rep_name ?? "Your local installer");
  const score =
    data.score === null || data.score < 0
      ? "—"
      : String(Math.round(data.score));
  const kwhLine =
    data.est_annual_kwh && data.est_annual_kwh > 0
      ? `<p class="big">Estimated <b>${data.est_annual_kwh.toLocaleString()} kWh/yr</b> from rooftop solar</p>`
      : "";
  const savingsLine =
    data.est_annual_savings_usd && data.est_annual_savings_usd > 0
      ? `<p class="big">~ <b>$${Math.round(data.est_annual_savings_usd).toLocaleString()}</b> in annual savings</p>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sunpath — ${escAddr}</title>
<style>
  @page { size: letter; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 0; padding: 0.4in; }
  .card { border: 1px solid #d4d4d4; border-radius: 12px; padding: 18px 22px; max-width: 5.5in; }
  h1 { margin: 0 0 4px; font-size: 22px; color: #b45309; }
  h2 { margin: 12px 0 4px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .big { font-size: 16px; margin: 4px 0; }
  .score { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #fef3c7; color: #92400e; font-weight: 700; font-size: 13px; }
  .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; }
  .signoff { margin-top: 16px; font-style: italic; color: #444; }
  .small { font-size: 11px; color: #666; }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  button { background: #f59e0b; color: white; border: 0; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; }
  @media print { .actions { display: none; } body { padding: 0; } .card { border: none; } }
</style>
</head>
<body>
  <div class="card">
    <h1>Sunpath</h1>
    <p class="small">For the homeowner at <b>${escAddr}</b></p>
    <h2>Why we left this</h2>
    <p>Your home looks like a strong fit for rooftop solar. <span class="score">Roof score ${score}/100</span></p>
    ${kwhLine}
    ${savingsLine}
    <h2>Want a real number?</h2>
    <p>Snap a photo of your last electric bill and visit:</p>
    <p class="url"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
    <p class="small">No appointment, no spam. We come back only if you ask us to.</p>
    <p class="signoff">— ${escRep}</p>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
