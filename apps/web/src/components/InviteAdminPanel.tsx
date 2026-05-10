// InviteAdminPanel — settings widget that lets a `lead` or `admin`
// generate invite tokens for new reps. The actual email send is up to
// the inviter for now (copy the URL and paste it into whatever channel).
//
// Module: invite.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

interface InviteRow {
  id: string;
  token: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function InviteAdminPanel() {
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"rep" | "lead" | "admin">("rep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  // Captured at first render so the JSX below doesn't read Date.now() impurely.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("rep")
        .select("role")
        .eq("auth_user_id", userId)
        .maybeSingle();
      setMe(data ?? {});
    })();
  }, []);

  const refreshList = async () => {
    const { data } = await supabase
      .from("rep_invite")
      .select(
        "id,token,email,role,expires_at,accepted_at,revoked_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setInvites((data as InviteRow[] | null) ?? []);
  };

  useEffect(() => {
    if (!me) return;
    if (me.role === "lead" || me.role === "admin") {
      queueMicrotask(() => {
        void refreshList();
      });
    }
  }, [me]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL) {
      setError("Supabase URL not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    setLastUrl(null);
    try {
      const accessToken = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (!accessToken) throw new Error("not signed in");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = (await res.json()) as {
        invite_url?: string;
        error?: string;
      };
      if (!res.ok || !json.invite_url) {
        throw new Error(json.error ?? `create failed (${res.status})`);
      }
      setLastUrl(json.invite_url);
      setEmail("");
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    await supabase
      .from("rep_invite")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    await refreshList();
  };

  if (!me) return null;
  if (me.role !== "lead" && me.role !== "admin") return null;

  return (
    <section className="mt-4 rounded-lg border bg-white p-3 text-sm shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-700">Team invites</h2>
      <p className="mb-2 text-xs text-slate-500">
        Generate a one-time invite link for a new rep. They sign in via
        magic-link and the link binds them to your team.
      </p>
      <form onSubmit={onCreate} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          placeholder="rep@example.com"
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="rounded border px-2 py-1 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="rep">rep</option>
          <option value="lead">lead</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : "Create invite"}
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : null}
      {lastUrl ? (
        <div className="mt-2 break-all rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
          <div className="mb-1 font-semibold">Invite link (copy & send):</div>
          <code>{lastUrl}</code>
        </div>
      ) : null}

      {invites.length > 0 ? (
        <ul className="mt-3 divide-y border-t text-xs">
          {invites.map((inv) => {
            const status = inv.accepted_at
              ? "accepted"
              : inv.revoked_at
                ? "revoked"
                : new Date(inv.expires_at).getTime() < nowMs
                  ? "expired"
                  : "pending";
            return (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-700">{inv.email}</div>
                  <div className="text-slate-500">
                    {inv.role} · {status}
                  </div>
                </div>
                {status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => void onRevoke(inv.id)}
                    className="text-red-600 hover:underline"
                  >
                    revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
