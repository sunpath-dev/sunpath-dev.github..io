// push-send — Supabase Edge Function (server-side only)
//
// Delivers Web Push notifications to a single rep or to every rep with
// subscriptions on file. Uses VAPID auth (Voluntary Application Server
// Identification) per RFC 8292.
//
// Required env vars:
//   VAPID_PUBLIC_KEY    — Base64URL-encoded P-256 public key
//   VAPID_PRIVATE_KEY   — Base64URL-encoded P-256 private key (raw scalar)
//   VAPID_SUBJECT       — mailto: or https: URL identifying us
//
// We deliberately avoid encrypted payloads — Web Push payload encryption
// (RFC 8291) is fiddly to implement without a library and the alternative
// is to send a "tickle" notification that the SW handles by fetching the
// actual content from Supabase. Sufficient for the daily rewarm digest.

import { create as createJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface RequestBody {
  /** If set, deliver only to this rep. Otherwise broadcast. */
  rep_id?: string;
  /** Optional title shown in the notification. */
  title?: string;
  /** Optional body text. */
  body?: string;
  /** Optional URL to open on click. */
  url?: string;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function importVapidPrivateKey(b64url: string): Promise<CryptoKey> {
  const raw = b64urlToBytes(b64url);
  // For djwt with ES256 we need a JWK — convert the raw scalar to JWK-ish.
  // Use the "pkcs8" import path: build a JWK from x/y derived via importing
  // as 'raw' over P-256 isn't exposed. Easier: import as JWK with d only.
  const pubB64 = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const pubBytes = b64urlToBytes(pubB64); // 65 bytes: 0x04 || x(32) || y(32)
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY must be uncompressed P-256 (65 bytes)");
  }
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: btoa(String.fromCharCode(...x))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    y: btoa(String.fromCharCode(...y))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    d: btoa(String.fromCharCode(...raw))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
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
  const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSub = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sunpath.dev";
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
  if (!vapidPub || !vapidPriv) {
    return Response.json(
      { error: "missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY" },
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

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const filter = body.rep_id ? `&rep_id=eq.${body.rep_id}` : "";
  const subsRes = await fetch(
    `${supabaseUrl}/rest/v1/push_subscription?select=endpoint,p256dh,auth${filter}`,
    { headers },
  );
  if (!subsRes.ok) {
    return Response.json(
      { error: "list subscriptions failed", status: subsRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const subs = (await subsRes.json()) as Subscription[];
  if (subs.length === 0) {
    return Response.json({ ok: true, sent: 0 }, { headers: CORS_HEADERS });
  }

  // Sign one VAPID JWT per push origin (audience). Key is reused across
  // subs to the same origin (e.g. fcm.googleapis.com).
  const privKey = await importVapidPrivateKey(vapidPriv);
  const jwtCache = new Map<string, string>();

  let sent = 0;
  let removed = 0;
  const errors: { endpoint: string; status: number }[] = [];
  for (const sub of subs) {
    let aud: string;
    try {
      const u = new URL(sub.endpoint);
      aud = `${u.protocol}//${u.host}`;
    } catch {
      continue;
    }
    let jwt = jwtCache.get(aud);
    if (!jwt) {
      const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
      jwt = await createJwt(
        { alg: "ES256", typ: "JWT" },
        { aud, exp, sub: vapidSub },
        privKey,
      );
      jwtCache.set(aud, jwt);
    }

    const pushRes = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidPub}`,
        // No payload (zero-length) — this is a "tickle". The SW fetches
        // /unread on click. Simpler than payload encryption (RFC 8291).
        "Content-Length": "0",
      },
    });
    if (pushRes.status === 410 || pushRes.status === 404) {
      // Subscription expired — clean up.
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscription?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
        { method: "DELETE", headers },
      );
      removed += 1;
      continue;
    }
    if (pushRes.ok || pushRes.status === 201 || pushRes.status === 202) {
      sent += 1;
    } else {
      errors.push({ endpoint: sub.endpoint, status: pushRes.status });
    }
  }

  // body is intentionally unused on the wire — title/body/url are conveyed
  // via the SW's fallback notification when there's no payload. Echoed in
  // the response for caller visibility.
  return Response.json(
    {
      ok: true,
      sent,
      removed,
      total: subs.length,
      errors,
      echo: { title: body.title, body: body.body, url: body.url },
    },
    { headers: CORS_HEADERS },
  );
});
