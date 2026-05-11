// Real Supabase OAuth auth hook.
// Exposes session + rep row (id, role, status) to the app.
// Replaces the old POC fake-session module.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

export type RepStatus = "pending" | "active" | "suspended";

export interface RepInfo {
  id: string;
  role: "rep" | "admin";
  status: RepStatus;
}

export interface AuthState {
  session: Session | null;
  rep: RepInfo | null;
  loading: boolean;
  signInWithProvider: (provider: "google" | "azure") => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchRep(authUserId: string): Promise<RepInfo | null> {
  const { data } = await supabase
    .from("rep")
    .select("id, role, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    role: (data.role as "rep" | "admin") ?? "rep",
    status: (data.status as RepStatus) ?? "pending",
  };
}

let cached: AuthState | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

async function signInWithProvider(provider: "google" | "azure"): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + "/" },
  });
}

async function signOut(): Promise<void> {
  localStorage.removeItem(POC_KEY);
  await supabase.auth.signOut();
}

export function enterAsPoc(): void {
  localStorage.setItem(POC_KEY, "1");
  window.location.reload();
}

// Bootstrap: resolve initial session synchronously if available.
let resolveInitial: (() => void) | undefined;
const initialReady = new Promise<void>((resolve) => {
  resolveInitial = resolve;
});

// POC bypass: localStorage flag set by the "Enter as guest" button.
// Lets the app be used before OAuth providers are configured in Supabase.
const POC_KEY = "sunpath:poc-bypass";
const POC_REP: RepInfo = { id: "poc-guest", role: "admin", status: "active" };

(async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session ?? null;
  let rep: RepInfo | null = null;
  if (session) {
    rep = await fetchRep(session.user.id);
  } else if (localStorage.getItem(POC_KEY) === "1") {
    rep = POC_REP;
  }
  cached = { session, rep, loading: false, signInWithProvider, signOut };
  resolveInitial?.();
  emit();
})();

// Subscribe to auth state changes.
supabase.auth.onAuthStateChange((_event, session) => {
  void (async () => {
    let rep: RepInfo | null = null;
    if (session) {
      rep = await fetchRep(session.user.id);
    }
    cached = {
      session: session ?? null,
      rep,
      loading: false,
      signInWithProvider,
      signOut,
    };
    emit();
  })();
});

export function useAuth(): AuthState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
    // Force a re-render once the initial session is resolved.
    void initialReady.then(() => cb());
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return (
    cached ?? {
      session: null,
      rep: null,
      loading: true,
      signInWithProvider,
      signOut,
    }
  );
}
