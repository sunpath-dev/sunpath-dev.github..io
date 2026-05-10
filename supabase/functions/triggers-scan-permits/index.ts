// triggers-scan-permits — Supabase Edge Function (cron-invoked)
//
// Walks each registered permit adapter, collects new permits issued since
// the last scan, and writes a `trigger_event` row (kind="permit_pulled")
// for any permit that lands within ~500m of an existing parcel.
//
// Adapters live in parcel-adapters/<state>/<county>-permits.ts. They are
// imported directly here (not via npm) — Deno resolves bare specifiers
// through an import-map. Until adapters are wired with real upstream
// sources, this is a no-op against zero adapters.
//
// Hard rule: server-side only. Never call from the browser.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PermitRecord {
  upstream_id: string;
  kind: string;
  issued_on: string;
  address_line1?: string;
  geo_lat?: number;
  geo_lon?: number;
  description?: string;
  raw: Record<string, unknown>;
}

interface PermitAdapter {
  readonly meta: { source: string; stateFips: string; countyFips: string };
  fetchSince(since: string): Promise<PermitRecord[]>;
}

// No adapters wired yet (Scott VA is a PDF; Russell VA TBD). Real
// imports will look like:
//   import { scottCountyVaPermitsAdapter } from "../../../parcel-adapters/virginia/scott-permits.ts";
const ADAPTERS: PermitAdapter[] = [];

interface RequestBody {
  /** Lookback window in days. Defaults to 14. */
  days?: number;
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

  let body: RequestBody = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = (await req.json()) as RequestBody;
    }
  } catch {
    body = {};
  }
  const days = Math.max(1, Math.min(60, body.days ?? 14));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  let totalFetched = 0;
  let totalInserted = 0;
  const errors: { source: string; error: string }[] = [];

  for (const adapter of ADAPTERS) {
    let permits: PermitRecord[];
    try {
      permits = await adapter.fetchSince(since);
    } catch (err) {
      errors.push({
        source: adapter.meta.source,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    totalFetched += permits.length;

    for (const p of permits) {
      // De-dup against trigger_event.payload->>'upstream_id'
      const dedupUrl = `${supabaseUrl}/rest/v1/trigger_event?select=id&kind=eq.permit_pulled&payload->>upstream_id=eq.${encodeURIComponent(p.upstream_id)}&limit=1`;
      const existsRes = await fetch(dedupUrl, { headers });
      if (existsRes.ok) {
        const rows = (await existsRes.json()) as unknown[];
        if (rows.length > 0) continue;
      }

      // Find the closest parcel (best-effort) — currently requires geo.
      // Without PostGIS distance helpers exposed via REST, we stash the
      // permit on a "broadcast" parcel selected per-jurisdiction. For the
      // POC, skip permits with no coords; stronger matching comes later.
      if (typeof p.geo_lat !== "number" || typeof p.geo_lon !== "number") {
        continue;
      }
      const parcelUrl =
        `${supabaseUrl}/rest/v1/parcel?select=id&limit=1` +
        `&state_fips=eq.${adapter.meta.stateFips}` +
        `&county_fips=eq.${adapter.meta.countyFips}`;
      const parcelRes = await fetch(parcelUrl, { headers });
      if (!parcelRes.ok) continue;
      const parcels = (await parcelRes.json()) as { id: string }[];
      const parcelId = parcels[0]?.id;
      if (!parcelId) continue;

      const insRes = await fetch(`${supabaseUrl}/rest/v1/trigger_event`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          parcel_id: parcelId,
          kind: "permit_pulled",
          fired_at: new Date().toISOString(),
          payload: {
            upstream_id: p.upstream_id,
            issued_on: p.issued_on,
            permit_kind: p.kind,
            address: p.address_line1 ?? null,
            description: p.description ?? null,
            source: adapter.meta.source,
          },
        }),
      });
      if (insRes.ok) totalInserted += 1;
    }
  }

  return Response.json(
    {
      ok: true,
      since,
      adapters: ADAPTERS.length,
      fetched: totalFetched,
      inserted: totalInserted,
      errors,
    },
    { headers: CORS_HEADERS },
  );
});
