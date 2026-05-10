// rewarm-derive — Supabase Edge Function (cron-invoked)
//
// Walks recent area_signal rows and calls public.derive_rewarm_triggers()
// for each. Schedule via Supabase's pg_cron or an external scheduler.
// Requires service-role access (runs server-side; never call from browser).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  /** Lookback window in hours. Defaults to 24. */
  hours?: number;
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
  const hours = Math.max(1, Math.min(24 * 7, body.hours ?? 24));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // List recent signals
  const listUrl = `${supabaseUrl}/rest/v1/area_signal?select=id&observed_at=gte.${since}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) {
    return Response.json(
      { error: "failed to list area_signals", status: listRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const signals = (await listRes.json()) as { id: string }[];

  let totalInserted = 0;
  for (const s of signals) {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/derive_rewarm_triggers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ area_signal_id: s.id }),
    });
    if (rpcRes.ok) {
      const n = (await rpcRes.json()) as number;
      totalInserted += Number(n) || 0;
    }
  }

  return Response.json(
    { processed_signals: signals.length, triggers_inserted: totalInserted, since },
    { headers: CORS_HEADERS },
  );
});
