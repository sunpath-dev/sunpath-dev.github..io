// score-parcels — nightly batch knock-score recompute.
//
// Iterates `recompute_scores_batch(limit, offset)` until exhausted,
// updating `score_snapshot` rows for every parcel with the full v1
// scoring (joins property_signal, trigger_event, area_signal). See
// migration 0014. Service-role only.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const MAX_BATCHES_PER_RUN = 200; // hard cap → 100k parcels per invocation

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
      { error: "missing supabase env" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  let offset = 0;
  let total = 0;
  let batches = 0;
  while (batches < MAX_BATCHES_PER_RUN) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rpc/recompute_scores_batch`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_limit: BATCH_SIZE, p_offset: offset }),
      },
    );
    if (!res.ok) {
      return Response.json(
        {
          error: "rpc failed",
          status: res.status,
          body: await res.text(),
          completed: total,
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const count = (await res.json()) as number;
    total += count;
    batches += 1;
    if (count < BATCH_SIZE) break; // exhausted
    offset += BATCH_SIZE;
  }

  return Response.json(
    { ok: true, scored: total, batches },
    { headers: CORS_HEADERS },
  );
});
