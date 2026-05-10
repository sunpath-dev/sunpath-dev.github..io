// Auth hook for the rep app.
// POC mode: no real auth. Clicking "Enter the app" stores a flag + stable rep
// ID in localStorage. All session.user.id references get that stable ID.
// Replace this file when adding real auth.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

const POC_KEY = "sunpath_poc_entered";
const POC_REP_KEY = "sunpath_poc_rep_id";

function getPocRepId(): string {
  let id = localStorage.getItem(POC_REP_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(POC_REP_KEY, id);
  }
  return id;
}

function makePocSession(): Session {
  return {
    user: {
      id: getPocRepId(),
      email: "poc@sunpath.dev",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
    access_token: "poc-token",
    refresh_token: "poc-token",
    token_type: "bearer",
    expires_in: 9999999,
    expires_at: 9999999,
  } as unknown as Session;
}

export interface AuthState {
  session: Session | null;
  loading: boolean;
  enter: () => void;
  signOut: () => void;
}

let cached: AuthState | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

function enter() {
  localStorage.setItem(POC_KEY, "1");
  cached = { ...buildState() };
  emit();
}

function signOut() {
  localStorage.removeItem(POC_KEY);
  cached = { ...buildState() };
  emit();
}

function buildState(): AuthState {
  const entered = localStorage.getItem(POC_KEY) === "1";
  return {
    session: entered ? makePocSession() : null,
    loading: false,
    enter,
    signOut,
  };
}

cached = buildState();

export function useAuth(): AuthState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);
  return cached!;
}
