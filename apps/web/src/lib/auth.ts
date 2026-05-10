// Supabase magic-link auth hook for the rep app.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

export interface AuthState {
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

let cached: AuthState | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

async function init() {
  const { data } = await supabase.auth.getSession();
  cached = {
    session: data.session,
    loading: false,
    signInWithMagicLink: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? { error: error.message } : {};
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  emit();
}

void init();

supabase.auth.onAuthStateChange((_event, session) => {
  if (cached) {
    cached = { ...cached, session, loading: false };
    emit();
  }
});

export function useAuth(): AuthState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);
  return (
    cached ?? {
      session: null,
      loading: true,
      signInWithMagicLink: async () => ({ error: "auth not ready" }),
      signOut: async () => {},
    }
  );
}
