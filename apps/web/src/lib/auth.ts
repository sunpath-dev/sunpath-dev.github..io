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
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signInWithProvider: (provider: "google" | "azure" | "linkedin_oidc") => Promise<void>;
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

const POC_KEY = "sunpath:poc-bypass";
const POC_REP: RepInfo = { id: "poc-guest", role: "rep", status: "active" };

async function signInWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

async function signUp(email: string, password: string, displayName?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName ?? "", full_name: displayName ?? "" },
    },
  });
  return { error: error?.message ?? null };
}

async function resetPassword(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/",
  });
  return { error: error?.message ?? null };
}

async function signInWithProvider(provider: "google" | "azure" | "linkedin_oidc"): Promise<void> {
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

let cached: AuthState | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

let resolveInitial: (() => void) | undefined;
const initialReady = new Promise<void>((resolve) => {
  resolveInitial = resolve;
});

function makeState(session: Session | null, rep: RepInfo | null): AuthState {
  return { session, rep, loading: false, signInWithEmail, signUp, resetPassword, signInWithProvider, signOut };
}

(async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session ?? null;
  let rep: RepInfo | null = null;
  if (session) {
    rep = await fetchRep(session.user.id);
  } else if (localStorage.getItem(POC_KEY) === "1") {
    rep = POC_REP;
  }
  cached = makeState(session, rep);
  resolveInitial?.();
  emit();
})();

supabase.auth.onAuthStateChange((_event, session) => {
  void (async () => {
    let rep: RepInfo | null = null;
    if (session) {
      rep = await fetchRep(session.user.id);
    } else if (localStorage.getItem(POC_KEY) === "1") {
      rep = POC_REP;
    }
    cached = makeState(session ?? null, rep);
    emit();
  })();
});

export function useAuth(): AuthState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
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
      signInWithEmail,
      signUp,
      resetPassword,
      signInWithProvider,
      signOut,
    }
  );
}
