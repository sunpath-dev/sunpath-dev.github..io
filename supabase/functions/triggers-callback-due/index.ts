// triggers-callback-due — Supabase Edge Function (cron-invoked, hourly)
//
// Walks open leads whose `next_action_at` has passed, and emits a
// `trigger_event` row of kind="callback_due" for each one (de-duped on
// payload->>lead_id so a stuck callback doesn't spam the inbox every
// hour). The pipeline UI's TriggersInbox surfaces these so the rep
// remembers to act.
//
// Server-side only.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Lead {
  id: string;
  parcel_id: string | null;
  rep_id: string;
  stage: string;
  next_action_at: string | null;
}

interface RequestBody {
  /** How long after next_action_at before we re-fire. Default 0 (immediately). */
  grace_minutes?: number;
}

const OPEN_STAGES = ["callback", "lead", "sit", "warming"];

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

  const grace = Math.max(0, body.grace_minutes ?? 0);
  const cutoff = new Date(Date.now() - grace * 60 * 1000).toISOString();

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Open leads whose next_action_at has passed.
  const stages = OPEN_STAGES.map((s) => `"${s}"`).join(",");
  const leadsUrl =
    `${supabaseUrl}/rest/v1/lead?` +
    `select=id,parcel_id,rep_id,stage,next_action_at` +
    `&stage=in.(${stages})` +
    `&next_action_at=lte.${cutoff}` +
    `&parcel_id=not.is.null` +
    `&limit=500`;

  const leadsRes = await fetch(leadsUrl, { headers });
  if (!leadsRes.ok) {
    return Response.json(
      { error: "list leads failed", status: leadsRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const leads = (await leadsRes.json()) as Lead[];

  let inserted = 0;
  let skipped = 0;
  for (const l of leads) {
    if (!l.parcel_id) {
      skipped += 1;
      continue;
    }
    // De-dup: any open trigger_event for this lead already?
    const dedupUrl =
      `${supabaseUrl}/rest/v1/trigger_event?select=id` +
      `&kind=eq.callback_due` +
      `&payload->>lead_id=eq.${l.id}` +
      `&dismissed_at=is.null&limit=1`;
    const dedupRes = await fetch(dedupUrl, { headers });
    if (dedupRes.ok) {
      const rows = (await dedupRes.json()) as unknown[];
      if (rows.length > 0) {
        skipped += 1;
        continue;
      }
    }

    const insRes = await fetch(`${supabaseUrl}/rest/v1/trigger_event`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        parcel_id: l.parcel_id,
        kind: "callback_due",
        fired_at: new Date().toISOString(),
        notified_rep_id: l.rep_id,
        payload: {
          lead_id: l.id,
          stage: l.stage,
          due_at: l.next_action_at,
        },
      }),
    });
    if (insRes.ok) inserted += 1;
  }

  return Response.json(
    { ok: true, candidates: leads.length, inserted, skipped, cutoff },
    { headers: CORS_HEADERS },
  );
});
