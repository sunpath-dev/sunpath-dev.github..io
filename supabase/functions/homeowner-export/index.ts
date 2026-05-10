// homeowner-export — Supabase Edge Function (admin-only).
//
// GDPR/CCPA subject-access-request endpoint. Accepts {phone, email,
// lead_id} (any one), calls the SECURITY DEFINER RPC
// `public.export_homeowner_pii`, and streams a JSON bundle back to the
// caller. Companion to `erase_homeowner_pii` (shipped 0016).
//
// AUTH: requires the X-Admin-Token header to match HOMEOWNER_EXPORT_TOKEN.
// This is intentionally a separate token from SUPABASE_SERVICE_ROLE_KEY
// so it can be rotated independently and handed to a privacy officer
// without granting full DB access. The function uses the service-role
// key internally to call the RPC.
//
// Returns:
//   200 application/json — the export bundle (lead/bill_capture/door_event)
//   400 — bad input
//   401 — bad/missing token
//   500 — RPC failure (logged via record_audit on success only)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-admin-token, x-client-info, apikey, content-type",
};

interface RequestBody {
  phone?: string | null;
  email?: string | null;
  lead_id?: string | null;
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

  const expected = Deno.env.get("HOMEOWNER_EXPORT_TOKEN");
  const provided = req.headers.get("x-admin-token");
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;
  const leadId = body.lead_id?.trim() || null;
  if (!phone && !email && !leadId) {
    return new Response(
      JSON.stringify({ error: "phone, email, or lead_id required" }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/export_homeowner_pii`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      p_phone: phone,
      p_email: email,
      p_lead_id: leadId,
    }),
  });

  if (!rpcRes.ok) {
    const text = await rpcRes.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: "rpc_failed", detail: text }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      },
    );
  }

  const payload = await rpcRes.json();
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
      "content-disposition": `attachment; filename="homeowner-export-${Date.now()}.json"`,
    },
  });
});
