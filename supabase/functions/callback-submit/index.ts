// callback-submit — Supabase Edge Function (PUBLIC; no auth required).
//
// Receives a homeowner submission from the public doorcard landing page
// at `#/d/<slug>` and writes a `lead` row using the service role.
//
// Slug is the first 8 hex chars of a parcel UUID; we look up the parcel
// by `id::text like <slug>%` (Postgres native text-prefix search).
// If no parcel matches, the lead is still recorded with parcel_id = null
// so reps can triage in-app — captured via the `notes` field.
//
// Rate-limit hardening (per-IP, abuse, captcha) is deferred to the
// production-hardening phase. For POC we accept the firehose risk.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  slug: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  ua?: string | null;
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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "invalid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!body.phone && !body.email) {
    return Response.json(
      { error: "phone or email required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return Response.json(
      { error: "service not configured" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Per-IP rate limit: 10 submissions / hour. Public form, must defend
  // against floods. Falls open if the RPC is unreachable so a DB hiccup
  // doesn't block legitimate leads.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  try {
    const rlRes = await fetch(`${url}/rest/v1/rpc/rate_limit_check`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_scope: "callback_submit",
        p_key: ip,
        p_limit: 10,
        p_window: "1 hour",
      }),
    });
    if (rlRes.ok) {
      const allowed = (await rlRes.json()) as boolean;
      if (allowed === false) {
        return Response.json(
          { error: "rate limited" },
          { status: 429, headers: CORS_HEADERS },
        );
      }
    }
  } catch {
    // fail-open
  }

  // Resolve parcel from slug, if any.
  let parcelId: string | null = null;
  if (body.slug && /^[0-9a-f]{4,32}$/i.test(body.slug)) {
    const lookupUrl =
      `${url}/rest/v1/parcel?select=id&id=ilike.${body.slug}%25&limit=1`;
    const lookup = await fetch(lookupUrl, { headers });
    if (lookup.ok) {
      const rows = (await lookup.json()) as Array<{ id: string }>;
      if (rows[0]) parcelId = rows[0].id;
    }
  }
  // Pick first rep as fallback recipient. Per-territory routing is a later phase.
  let repId: string | null = null;
  const repRes = await fetch(`${url}/rest/v1/rep?select=id&limit=1`, { headers });
  if (repRes.ok) {
    const rows = (await repRes.json()) as Array<{ id: string }>;
    repId = rows[0]?.id ?? null;
  }

  if (!repId) {
    return Response.json(
      { error: "no rep available to receive lead" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const lead = {
    parcel_id: parcelId,
    rep_id: repId,
    stage: "callback",
    contact_name: body.contact_name,
    phone: body.phone,
    email: body.email,
    notes: [
      body.notes ?? "",
      body.ua ? `\n[ua]: ${body.ua}` : "",
      body.slug ? `\n[slug]: ${body.slug}` : "",
      "\n[source]: doorcard-callback",
    ].join(""),
    next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const insertRes = await fetch(`${url}/rest/v1/lead`, {
    method: "POST",
    headers,
    body: JSON.stringify(lead),
  });
  if (!insertRes.ok) {
    const text = await insertRes.text();
    return Response.json(
      { error: "lead insert failed", detail: text.slice(0, 400) },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  return Response.json({ ok: true }, { headers: CORS_HEADERS });
});
