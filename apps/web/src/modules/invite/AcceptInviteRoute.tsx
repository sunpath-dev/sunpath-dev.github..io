// AcceptInviteRoute — invitee lands here from the email deep link
// (`/#/accept-invite?token=...`). If they're not signed in, we show the
// magic-link sign-in screen and stash the token for after auth. If they
// are signed in, we POST to the invite-accept edge function and route
// them to /territory on success.
//
// Module: invite.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { SignInScreen } from "@/components/SignInScreen.js";
import { supabase } from "@/lib/supabase.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const PENDING_KEY = "sunpath:pending-invite";

type State = "checking" | "needs-auth" | "accepting" | "ok" | "error";

export function AcceptInviteRoute() {
  const [params] = useSearchParams();
  const tokenFromUrl = params.get("token") ?? "";
  const { session, loading } = useAuth();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  // Persist the token across the magic-link auth roundtrip.
  useEffect(() => {
    if (tokenFromUrl) {
      try {
        window.localStorage.setItem(PENDING_KEY, tokenFromUrl);
      } catch {
        /* ignore */
      }
    }
  }, [tokenFromUrl]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    if (!session) {
      queueMicrotask(() => {
        if (!cancelled) setState("needs-auth");
      });
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      let token = tokenFromUrl;
      if (!token) {
        try {
          token = window.localStorage.getItem(PENDING_KEY) ?? "";
        } catch {
          token = "";
        }
      }
      if (!token) {
        if (!cancelled) {
          setState("error");
          setError("No invite token in URL.");
        }
        return;
      }
      if (!SUPABASE_URL) {
        if (!cancelled) {
          setState("error");
          setError("Supabase URL not configured for this build.");
        }
        return;
      }
      setState("accepting");
      try {
        const accessToken = (await supabase.auth.getSession()).data.session
          ?.access_token;
        if (!accessToken) throw new Error("missing access token");
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/invite-accept`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token }),
          },
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `accept failed (${res.status})`);
        }
        try {
          window.localStorage.removeItem(PENDING_KEY);
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setState("ok");
          window.location.hash = "#/territory";
        }
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, tokenFromUrl]);

  if (state === "needs-auth") {
    return <SignInScreen />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 text-sm shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-slate-700">
          Accepting invite
        </h1>
        {state === "checking" || state === "accepting" ? (
          <p className="text-slate-600">Working on it…</p>
        ) : null}
        {state === "ok" ? (
          <p className="text-emerald-700">
            Welcome aboard. Redirecting to your territory…
          </p>
        ) : null}
        {state === "error" ? (
          <p className="text-red-700">
            Couldn&apos;t accept invite: {error ?? "unknown error"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
