// doorcard-pdf — Supabase Edge Function
//
// Generates a printable doorcard PDF for a single parcel (or a batch).
// Output is a quarter-sheet (4.25" × 5.5") with: Sunpath header, the
// homeowner's address, an estimated annual production / savings line
// pulled from the most recent `property_signal`, and a callback short
// URL pointing at /#/d/<slug> where slug = first 8 hex chars of the
// parcel UUID.
//
// Body: { parcel_id: string }                 → one card, application/pdf
//        { parcel_ids: string[] }             → batch (one card per page)
//
// PDF generation: pdf-lib via esm.sh (works in Deno).

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1?target=deno";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  parcel_id?: string;
  parcel_ids?: string[];
  /** Override the public URL used for the callback link. */
  base_url?: string;
}

interface ParcelRow {
  id: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
}

interface PropertySignal {
  est_annual_kwh: number | null;
  est_annual_savings_usd: number | null;
}const PAGE_WIDTH = 4.25 * 72; // 306 pt
const PAGE_HEIGHT = 5.5 * 72; // 396 pt
const MARGIN = 28;
const ACCENT = rgb(0.96, 0.62, 0.04); // amber-500
const SLATE = rgb(0.2, 0.25, 0.33);

function shortSlug(parcelId: string): string {
  return parcelId.replace(/-/g, "").slice(0, 8);
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function fmtKwh(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("en-US")} kWh/yr`;
}

function drawCard(
  page: PDFPage,
  fontBold: PDFFont,
  font: PDFFont,
  parcel: ParcelRow,
  signal: PropertySignal | null,
  baseUrl: string,
): void {
  const slug = shortSlug(parcel.id);

  // Accent bar.
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 18,
    width: PAGE_WIDTH,
    height: 18,
    color: ACCENT,
  });
  page.drawText("SUNPATH", {
    x: MARGIN,
    y: PAGE_HEIGHT - 14,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Body
  let y = PAGE_HEIGHT - 50;
  page.drawText("We knocked at your door", {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: SLATE,
  });
  y -= 22;

  page.drawText(parcel.address_line1, {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
    color: SLATE,
  });
  y -= 16;
  page.drawText(`${parcel.city}, ${parcel.state} ${parcel.postal_code}`, {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: SLATE,
  });
  y -= 32;

  page.drawText("Estimated solar at this address", {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: SLATE,
  });
  y -= 16;
  page.drawText(fmtKwh(signal?.est_annual_kwh ?? null), {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: SLATE,
  });
  y -= 22;

  page.drawText("Estimated first-year savings", {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: SLATE,
  });
  y -= 16;
  page.drawText(fmtUsd(signal?.est_annual_savings_usd ?? null), {
    x: MARGIN,
    y,
    size: 13,
    font: fontBold,
    color: ACCENT,
  });
  y -= 36;

  // CTA box.
  const ctaY = MARGIN + 56;
  page.drawRectangle({
    x: MARGIN - 6,
    y: ctaY - 6,
    width: PAGE_WIDTH - (MARGIN - 6) * 2,
    height: 60,
    borderColor: ACCENT,
    borderWidth: 1.2,
    color: rgb(1, 0.97, 0.9),
  });
  page.drawText("See your custom estimate:", {
    x: MARGIN,
    y: ctaY + 36,
    size: 9,
    font,
    color: SLATE,
  });
  const cleanedBase = baseUrl.replace(/\/$/, "");
  const url = `${cleanedBase}/#/d/${slug}`;
  page.drawText(url, {
    x: MARGIN,
    y: ctaY + 18,
    size: 10,
    font: fontBold,
    color: SLATE,
  });
  page.drawText("Or text us back at this number.", {
    x: MARGIN,
    y: ctaY + 4,
    size: 8,
    font,
    color: SLATE,
  });

  // Footer
  page.drawText("sunpath.dev", {
    x: MARGIN,
    y: MARGIN - 12,
    size: 8,
    font,
    color: SLATE,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicAppUrl =
    Deno.env.get("PUBLIC_APP_URL") ?? "https://sunpath.dev";
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "missing supabase env" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "invalid json" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const ids = body.parcel_ids?.length
    ? body.parcel_ids
    : body.parcel_id
      ? [body.parcel_id]
      : [];
  if (!ids.length) {
    return Response.json(
      { error: "parcel_id or parcel_ids required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (ids.length > 200) {
    return Response.json(
      { error: "too many parcels (max 200)" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const inList = ids.map(encodeURIComponent).join(",");
  const parcelRes = await fetch(
    `${supabaseUrl}/rest/v1/parcel?select=id,address_line1,city,state,postal_code&id=in.(${inList})`,
    { headers },
  );
  if (!parcelRes.ok) {
    return Response.json(
      { error: "parcel fetch failed", status: parcelRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const parcels = (await parcelRes.json()) as ParcelRow[];

  // Best-effort property_signal lookup; not all parcels will have one yet.
  // PVWatts payload lives in `payload` jsonb (see pvwatts-fetch).
  const sigRes = await fetch(
    `${supabaseUrl}/rest/v1/property_signal?select=parcel_id,kind,payload,observed_at&parcel_id=in.(${inList})&kind=eq.pvwatts&order=observed_at.desc`,
    { headers },
  );
  const sigsRaw = sigRes.ok
    ? ((await sigRes.json()) as Array<{
        parcel_id: string;
        payload: {
          ac_annual_kwh?: number;
          est_annual_savings_usd?: number;
        } | null;
      }>)
    : [];
  const sigByParcel = new Map<string, PropertySignal>();
  for (const s of sigsRaw) {
    if (!sigByParcel.has(s.parcel_id)) {
      sigByParcel.set(s.parcel_id, {
        est_annual_kwh: s.payload?.ac_annual_kwh ?? null,
        est_annual_savings_usd: s.payload?.est_annual_savings_usd ?? null,
      });
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const baseUrl = body.base_url ?? publicAppUrl;

  for (const parcel of parcels) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawCard(page, fontBold, font, parcel, sigByParcel.get(parcel.id) ?? null, baseUrl);
  }

  const bytes = await pdf.save();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition":
        ids.length === 1
          ? `inline; filename="doorcard-${shortSlug(ids[0]!)}.pdf"`
          : `inline; filename="doorcards-${parcels.length}.pdf"`,
    },
  });
});
