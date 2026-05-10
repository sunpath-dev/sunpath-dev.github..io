// rewarm-push — Supabase Edge Function (cron-invoked, daily ~7am local)
//
// For each rep that has at least one open trigger_event, sends a Web Push
// notification via the `push-send` function. Designed to be the morning
// nudge that gets the rep to open the Triggers Inbox first thing.
//
// Server-side only.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  /** Lookback for triggers to surface, in days. Default 14. */
  days?: number;
}

interface TriggerRow {
  id: string;
  parcel_id: string;
  notified_rep_id: string | null;
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
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Find open triggers in the lookback window.
  const trigUrl =
    `${supabaseUrl}/rest/v1/trigger_event?` +
    `select=id,parcel_id,notified_rep_id` +
    `&fired_at=gte.${since}` +
    `&dismissed_at=is.null` +
    `&limit=2000`;
  const trigRes = await fetch(trigUrl, { headers });
  if (!trigRes.ok) {
    return Response.json(
      { error: "list triggers failed", status: trigRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const triggers = (await trigRes.json()) as TriggerRow[];

  // Group by rep_id. Triggers without a notified_rep_id broadcast (null
  // bucket) — for now we only push to reps with explicit assignment.
  const byRep = new Map<string, number>();
  for (const t of triggers) {
    if (!t.notified_rep_id) continue;
    byRep.set(t.notified_rep_id, (byRep.get(t.notified_rep_id) ?? 0) + 1);
  }

  let dispatched = 0;
  const errors: { rep_id: string; status: number }[] = [];
  for (const [repId, count] of byRep) {
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        rep_id: repId,
        title: "Sunpath rewarm",
        body: `${count} door${count === 1 ? "" : "s"} to revisit today`,
        url: "/#/pipeline",
      }),
    });
    if (sendRes.ok) {
      dispatched += 1;
    } else {
      errors.push({ rep_id: repId, status: sendRes.status });
    }
  }

  return Response.json(
    {
      ok: true,
      since,
      open_triggers: triggers.length,
      reps_with_triggers: byRep.size,
      dispatched,
      errors,
    },
    { headers: CORS_HEADERS },
  );
});
