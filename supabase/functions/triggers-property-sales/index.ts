// triggers-property-sales — Supabase Edge Function (cron-invoked, daily)
//
// Diffs each parcel's most recent property_signal of kind="sale" against
// the parcel's stored last_sale_date. When a newer sale is detected,
// updates parcel.last_sale_date / last_sale_amount_usd and emits a
// trigger_event of kind="sold" so the rewarm inbox surfaces it.
//
// Property signals get there via the parcel adapter ingest pipeline
// (parcel-adapters write property_signal rows when the source has sale
// history). This function is the differ — it doesn't fetch upstream.
//
// Server-side only.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Signal {
  id: string;
  parcel_id: string;
  observed_at: string;
  payload: { sale_date?: string; sale_amount_usd?: number } | null;
}

interface ParcelLite {
  id: string;
  last_sale_date: string | null;
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
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Fetch the most recent sale signal observed in the last 90 days.
  // 90d cap keeps the function bounded on cold starts.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sigUrl =
    `${supabaseUrl}/rest/v1/property_signal?select=id,parcel_id,observed_at,payload` +
    `&kind=eq.sale&observed_at=gte.${since}&order=observed_at.desc&limit=2000`;
  const sigRes = await fetch(sigUrl, { headers });
  if (!sigRes.ok) {
    return Response.json(
      { error: "list signals failed", status: sigRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const signals = (await sigRes.json()) as Signal[];

  // Keep only the newest sale per parcel.
  const newestByParcel = new Map<string, Signal>();
  for (const s of signals) {
    if (!newestByParcel.has(s.parcel_id)) newestByParcel.set(s.parcel_id, s);
  }

  let updated = 0;
  let triggered = 0;
  let skipped = 0;
  for (const [parcelId, sig] of newestByParcel) {
    const sale = sig.payload?.sale_date;
    if (!sale) {
      skipped += 1;
      continue;
    }
    // Read parcel current last_sale_date.
    const pUrl = `${supabaseUrl}/rest/v1/parcel?select=id,last_sale_date&id=eq.${parcelId}&limit=1`;
    const pRes = await fetch(pUrl, { headers });
    if (!pRes.ok) {
      skipped += 1;
      continue;
    }
    const rows = (await pRes.json()) as ParcelLite[];
    const parcel = rows[0];
    if (!parcel) {
      skipped += 1;
      continue;
    }
    if (parcel.last_sale_date && parcel.last_sale_date >= sale) {
      skipped += 1;
      continue;
    }
    // Update parcel
    const upRes = await fetch(`${supabaseUrl}/rest/v1/parcel?id=eq.${parcelId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        last_sale_date: sale,
        last_sale_amount_usd: sig.payload?.sale_amount_usd ?? null,
      }),
    });
    if (upRes.ok) updated += 1;

    // Emit trigger
    const insRes = await fetch(`${supabaseUrl}/rest/v1/trigger_event`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        parcel_id: parcelId,
        kind: "sold",
        fired_at: new Date().toISOString(),
        payload: {
          sale_date: sale,
          sale_amount_usd: sig.payload?.sale_amount_usd ?? null,
          previous_sale_date: parcel.last_sale_date,
          source_signal_id: sig.id,
        },
      }),
    });
    if (insRes.ok) triggered += 1;
  }

  return Response.json(
    {
      ok: true,
      candidates: newestByParcel.size,
      updated,
      triggered,
      skipped,
    },
    { headers: CORS_HEADERS },
  );
});
