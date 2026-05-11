// invite-create — generate a one-time invite token for a new rep.
//
// Caller must be authenticated (anon key + user JWT). We resolve the
// caller's rep row, generate a random token, insert into rep_invite,
// and return the token + a deep link the caller can copy into an
// email/SMS. We do NOT send the email here — that's a separate concern
// (Supabase Auth magic-link, SES, etc.) the inviter handles manually
// for now.
//
// Body: { email: string, role?: 'rep'|'lead'|'admin', display_name?: string }
// Response: { token, invite_url, expires_at }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  role?: "rep" | "lead" | "admin";
  display_name?: string;
}

function genToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publicAppUrl =
    Deno.env.get("PUBLIC_APP_URL") ?? "https://sunpath.dev";
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return Response.json(
      { error: "missing supabase env" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return Response.json(
      { error: "missing authorization header" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "invalid json body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return Response.json(
      { error: "valid email required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const role = body.role ?? "rep";
  if (!["rep", "admin"].includes(role)) {
    return Response.json(
      { error: "invalid role" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Resolve caller's rep row using the user's JWT (anon key + their auth).
  const meRes = await fetch(
    `${supabaseUrl}/rest/v1/rep?select=id&auth_user_id=eq.` +
      `(select%20auth.uid())&limit=1`,
    {
      headers: {
        apikey: anonKey,
        Authorization: authHeader,
      },
    },
  );
  // The select=eq.(select auth.uid()) trick doesn't work via PostgREST;
  // fall back to using the user JWT against an RLS-restricted view.
  // Easiest: hit /auth/v1/user to get the auth user id, then look up rep.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!userRes.ok) {
    return Response.json(
      { error: "auth lookup failed", status: userRes.status },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  const userJson = (await userRes.json()) as { id?: string };
  const authUserId = userJson.id;
  if (!authUserId) {
    return Response.json(
      { error: "no auth user" },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  void meRes; // ignored

  const repLookup = await fetch(
    `${supabaseUrl}/rest/v1/rep?select=id,role&auth_user_id=eq.${authUserId}&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  const repRows = (await repLookup.json()) as { id: string; role?: string }[];
  const me = repRows[0];
  if (!me) {
    return Response.json(
      { error: "caller has no rep row" },
      { status: 403, headers: CORS_HEADERS },
    );
  }
  // Only `admin` can invite.
  if (me.role !== "admin") {
    return Response.json(
      { error: "insufficient role to invite" },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const token = genToken();
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/rep_invite`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      token,
      email,
      role,
      display_name: body.display_name ?? null,
      created_by: me.id,
    }),
  });
  if (!insertRes.ok) {
    return Response.json(
      { error: "insert failed", status: insertRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const inserted = (await insertRes.json()) as Array<{ expires_at: string }>;
  const expiresAt = inserted[0]?.expires_at;

  const inviteUrl = `${publicAppUrl}/#/accept-invite?token=${token}`;
  return Response.json(
    { ok: true, token, invite_url: inviteUrl, expires_at: expiresAt },
    { headers: CORS_HEADERS },
  );
});
