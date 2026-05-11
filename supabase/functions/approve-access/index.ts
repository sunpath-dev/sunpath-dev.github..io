// approve-access — admin approves or rejects an access request.
// Caller must be an authenticated active admin.
//
// Body: { request_id: string, decision: 'approve' | 'reject' }
// On approve: marks request approved; if a pending rep with the same email
//   already exists (signed in before approval), flips their status to active.
// On reject: marks request rejected.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  request_id: string;
  decision: "approve" | "reject";
}

interface AccessRequest {
  id: string;
  email: string;
  status: string;
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
    return new Response(null, { status: 500, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return Response.json({ error: "missing auth" }, { status: 401, headers: CORS_HEADERS });
  }

  // Verify caller is an active admin.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!userRes.ok) {
    return Response.json({ error: "auth failed" }, { status: 401, headers: CORS_HEADERS });
  }
  const userJson = (await userRes.json()) as { id?: string };
  if (!userJson.id) {
    return Response.json({ error: "no auth user" }, { status: 401, headers: CORS_HEADERS });
  }

  const svc = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const repCheck = await fetch(
    `${supabaseUrl}/rest/v1/rep?select=id,role,status&auth_user_id=eq.${userJson.id}&limit=1`,
    { headers: svc },
  );
  const repRows = (await repCheck.json()) as { id: string; role: string; status: string }[];
  const caller = repRows[0];
  if (!caller || caller.role !== "admin" || caller.status !== "active") {
    return Response.json({ error: "admin required" }, { status: 403, headers: CORS_HEADERS });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!body.request_id || !["approve", "reject"].includes(body.decision)) {
    return Response.json({ error: "request_id and decision required" }, { status: 400, headers: CORS_HEADERS });
  }

  // Fetch the access request.
  const reqRes = await fetch(
    `${supabaseUrl}/rest/v1/rep_access_request?select=id,email,status&id=eq.${body.request_id}&limit=1`,
    { headers: svc },
  );
  const reqRows = (await reqRes.json()) as AccessRequest[];
  const accessReq = reqRows[0];
  if (!accessReq) {
    return Response.json({ error: "request not found" }, { status: 404, headers: CORS_HEADERS });
  }
  if (accessReq.status !== "pending") {
    return Response.json({ error: "request already decided" }, { status: 409, headers: CORS_HEADERS });
  }

  const newStatus = body.decision === "approve" ? "approved" : "rejected";

  await fetch(
    `${supabaseUrl}/rest/v1/rep_access_request?id=eq.${body.request_id}`,
    {
      method: "PATCH",
      headers: svc,
      body: JSON.stringify({
        status: newStatus,
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
      }),
    },
  );

  // If approving, find any pending rep with this email and flip to active.
  if (body.decision === "approve") {
    const email = accessReq.email.toLowerCase();
    // Find auth.users with this email, then find their rep row.
    const authUsers = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (authUsers.ok) {
      const authJson = (await authUsers.json()) as { users?: { id: string }[] };
      const authUser = authJson.users?.[0];
      if (authUser?.id) {
        await fetch(
          `${supabaseUrl}/rest/v1/rep?auth_user_id=eq.${authUser.id}&status=eq.pending`,
          {
            method: "PATCH",
            headers: svc,
            body: JSON.stringify({ status: "active" }),
          },
        );
      }
    }
  }

  return Response.json({ ok: true }, { headers: CORS_HEADERS });
});
