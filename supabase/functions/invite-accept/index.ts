// invite-accept — consume an invite token after the invitee signs in.
//
// Caller is the freshly-authenticated invitee (anon key + user JWT).
// We validate the token, ensure it's not expired/revoked/accepted, and
// upsert a rep row tied to their auth.uid() with the invited role.
//
// Body: { token: string }
// Response: { ok: true, rep_id, role }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  token: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  created_by: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
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
  const token = body.token?.trim();
  if (!token) {
    return Response.json(
      { error: "token required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Resolve invitee identity from their JWT.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!userRes.ok) {
    return Response.json(
      { error: "auth lookup failed", status: userRes.status },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  const userJson = (await userRes.json()) as { id?: string; email?: string };
  if (!userJson.id) {
    return Response.json(
      { error: "no auth user" },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  const authUserId = userJson.id;
  const callerEmail = (userJson.email ?? "").toLowerCase();

  const svc = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Fetch the invite (service role bypasses RLS).
  const invRes = await fetch(
    `${supabaseUrl}/rest/v1/rep_invite?select=id,email,role,display_name,created_by,accepted_at,revoked_at,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`,
    { headers: svc },
  );
  const invRows = (await invRes.json()) as InviteRow[];
  const invite = invRows[0];
  if (!invite) {
    return Response.json(
      { error: "invite not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }
  if (invite.accepted_at) {
    return Response.json(
      { error: "invite already accepted" },
      { status: 409, headers: CORS_HEADERS },
    );
  }
  if (invite.revoked_at) {
    return Response.json(
      { error: "invite revoked" },
      { status: 410, headers: CORS_HEADERS },
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return Response.json(
      { error: "invite expired" },
      { status: 410, headers: CORS_HEADERS },
    );
  }
  if (callerEmail && invite.email.toLowerCase() !== callerEmail) {
    return Response.json(
      { error: "invite email does not match signed-in user" },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  // Upsert rep row for this auth user. The 0002 migration may already
  // auto-create one; if so we just patch role + invited_by.
  const repLookup = await fetch(
    `${supabaseUrl}/rest/v1/rep?select=id,role&auth_user_id=eq.${authUserId}&limit=1`,
    { headers: svc },
  );
  const repRows = (await repLookup.json()) as { id: string; role?: string }[];
  let repId: string;
  if (repRows[0]) {
    repId = repRows[0].id;
    await fetch(
      `${supabaseUrl}/rest/v1/rep?id=eq.${repId}`,
      {
        method: "PATCH",
        headers: svc,
        body: JSON.stringify({
          role: invite.role,
          invited_by: invite.created_by,
        }),
      },
    );
  } else {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/rep`, {
      method: "POST",
      headers: { ...svc, Prefer: "return=representation" },
      body: JSON.stringify({
        auth_user_id: authUserId,
        display_name: invite.display_name ?? invite.email.split("@")[0],
        role: invite.role,
        invited_by: invite.created_by,
      }),
    });
    if (!insertRes.ok) {
      return Response.json(
        { error: "rep insert failed", status: insertRes.status },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const newRep = (await insertRes.json()) as Array<{ id: string }>;
    repId = newRep[0]?.id ?? "";
  }

  // Mark invite consumed.
  await fetch(`${supabaseUrl}/rest/v1/rep_invite?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: svc,
    body: JSON.stringify({
      accepted_at: new Date().toISOString(),
      accepted_by: repId,
    }),
  });

  return Response.json(
    { ok: true, rep_id: repId, role: invite.role },
    { headers: CORS_HEADERS },
  );
});
