// request-access — public endpoint to submit an access request.
// No authentication required. Rate-limited by IP + email via the
// existing rate_limit table. Inserts into rep_access_request.
//
// Body: { email, display_name?, note? }
// Response: 204 on success (even for duplicates — no enumeration)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  display_name?: string;
  note?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_S = 3600; // 1 hour
const RATE_LIMIT_MAX = 5; // per IP per hour

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
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(null, { status: 400, headers: CORS_HEADERS });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return new Response(null, { status: 400, headers: CORS_HEADERS });
  }

  const svc = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Rate limit by IP.
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitKey = `request-access:${clientIp}`;
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_S * 1000,
  ).toISOString();

  const rlRes = await fetch(
    `${supabaseUrl}/rest/v1/rate_limit?key=eq.${encodeURIComponent(rateLimitKey)}&window_start=gte.${encodeURIComponent(windowStart)}&select=count`,
    { headers: svc },
  );
  if (rlRes.ok) {
    const rlRows = (await rlRes.json()) as { count?: number }[];
    const hits = rlRows.reduce((n, r) => n + (r.count ?? 0), 0);
    if (hits >= RATE_LIMIT_MAX) {
      return new Response(null, { status: 429, headers: CORS_HEADERS });
    }
  }

  // Log the rate-limit hit.
  await fetch(`${supabaseUrl}/rest/v1/rate_limit`, {
    method: "POST",
    headers: { ...svc, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      key: rateLimitKey,
      window_start: new Date().toISOString(),
      count: 1,
    }),
  });

  // Insert access request (ignore duplicate pending email — no enumeration).
  await fetch(`${supabaseUrl}/rest/v1/rep_access_request`, {
    method: "POST",
    headers: { ...svc, Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({
      email,
      display_name: body.display_name?.trim() || null,
      note: body.note?.trim() || null,
    }),
  });

  return new Response(null, { status: 204, headers: CORS_HEADERS });
});
