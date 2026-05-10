// PushOptIn — settings widget that registers the current browser for
// Web Push notifications. Stores the subscription via the standard
// PostgREST endpoint (RLS scopes inserts to the current rep).
//
// Module: settings.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

type State =
  | "checking"
  | "unsupported"
  | "missing-key"
  | "denied"
  | "ready"
  | "subscribed"
  | "subscribing"
  | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) out[i] = rawData.charCodeAt(i);
  return out;
}

function arrayBufferToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    const c = bytes[i];
    if (c === undefined) continue;
    bin += String.fromCharCode(c);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function PushOptIn() {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setState("missing-key");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "subscribed" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubscribe = async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setState("subscribing");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      // PushManager.subscribe wants BufferSource over a fixed ArrayBuffer.
      // urlBase64ToUint8Array returns a Uint8Array<ArrayBufferLike> under
      // strict lib typings; copy into a fresh ArrayBuffer to satisfy it.
      const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const appKey = new Uint8Array(keyBytes.byteLength);
      appKey.set(keyBytes);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const p256dh =
        json.keys?.p256dh ?? arrayBufferToB64Url(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToB64Url(sub.getKey("auth"));
      const { data: authData } = await supabase.auth.getUser();
      const repId = authData.user?.id;
      if (!repId) throw new Error("no auth user");

      const { error: insErr } = await supabase
        .from("push_subscription")
        .upsert(
          {
            rep_id: repId,
            endpoint: json.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent.slice(0, 200),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );
      if (insErr) throw insErr;
      setState("subscribed");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onUnsubscribe = async () => {
    setState("subscribing");
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await supabase
          .from("push_subscription")
          .delete()
          .eq("endpoint", existing.endpoint);
        await existing.unsubscribe();
      }
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="rounded-lg border bg-white p-3 text-sm shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-700">
        Daily rewarm push
      </h2>
      <p className="mb-2 text-xs text-slate-500">
        Get a morning notification with your top trigger doors and any
        callbacks coming due.
      </p>
      {state === "unsupported" ? (
        <p className="text-xs text-slate-500">
          This browser doesn&apos;t support Web Push.
        </p>
      ) : null}
      {state === "missing-key" ? (
        <p className="text-xs text-slate-500">
          Push isn&apos;t configured for this build (VAPID key missing).
        </p>
      ) : null}
      {state === "denied" ? (
        <p className="text-xs text-red-700">
          Notifications are blocked in your browser settings.
        </p>
      ) : null}
      {state === "ready" || state === "checking" ? (
        <button
          type="button"
          onClick={() => void onSubscribe()}
          disabled={state === "checking"}
          className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {state === "checking" ? "Checking…" : "Enable push"}
        </button>
      ) : null}
      {state === "subscribing" ? (
        <p className="text-xs text-slate-500">Working…</p>
      ) : null}
      {state === "subscribed" ? (
        <button
          type="button"
          onClick={() => void onUnsubscribe()}
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Disable push
        </button>
      ) : null}
      {state === "error" ? (
        <p className="mt-2 text-xs text-red-700">Push error: {error}</p>
      ) : null}
    </section>
  );
}
