// AdminPanel — settings widget for admins.
// Shows pending access requests, pending reps, and invite creation.
// Module: invite / settings.

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

interface AccessRequest {
  id: string;
  email: string;
  display_name: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

interface PendingRep {
  id: string;
  display_name: string;
  status: string;
  created_at: string;
}

export function AdminPanel() {
  const [me, setMe] = useState<{ role?: string; id?: string } | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [pendingReps, setPendingReps] = useState<PendingRep[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"rep" | "admin">("rep");
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("rep")
        .select("id, role")
        .eq("auth_user_id", userId)
        .maybeSingle();
      setMe(data ?? {});
    })();
  }, []);

  const refreshAll = async () => {
    const [invRes, reqRes, repRes] = await Promise.all([
      supabase
        .from("rep_invite")
        .select("id,token,email,role,expires_at,accepted_at,revoked_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("rep_access_request")
        .select("id,email,display_name,note,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("rep")
        .select("id,display_name,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
    ]);
    setInvites((invRes.data as InviteRow[] | null) ?? []);
    setRequests((reqRes.data as AccessRequest[] | null) ?? []);
    setPendingReps((repRes.data as PendingRep[] | null) ?? []);
  };

  useEffect(() => {
    if (!me?.role) return;
    if (me.role === "admin") {
      queueMicrotask(() => { void refreshAll(); });
    }
  }, [me]);

  const onCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL) { setError("Supabase URL not configured."); return; }
    setBusy(true);
    setError(null);
    setLastUrl(null);
    try {
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!accessToken) throw new Error("not signed in");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = (await res.json()) as { invite_url?: string; error?: string };
      if (!res.ok || !json.invite_url) throw new Error(json.error ?? `create failed (${res.status})`);
      setLastUrl(json.invite_url);
      setEmail("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevokeInvite = async (id: string) => {
    await supabase.from("rep_invite").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    await refreshAll();
  };

  const onDecideRequest = async (requestId: string, decision: "approve" | "reject") => {
    if (!SUPABASE_URL) return;
    setDecisionBusy(requestId);
    try {
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!accessToken) throw new Error("not signed in");
      await fetch(`${SUPABASE_URL}/functions/v1/approve-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
      await refreshAll();
    } finally {
      setDecisionBusy(null);
    }
  };

  const onApprovePendingRep = async (repId: string) => {
    setDecisionBusy(repId);
    try {
      await supabase.from("rep").update({ status: "active" }).eq("id", repId);
      await refreshAll();
    } finally {
      setDecisionBusy(null);
    }
  };

  if (!me) return null;
  if (me.role !== "admin") return null;

  const totalPending = requests.length + pendingReps.length;

  return (
    <section className="mt-4 rounded-lg border bg-white p-3 text-sm shadow-sm space-y-4">
      <h2 className="font-semibold text-slate-700">
        Admin panel
        {totalPending > 0 ? (
          <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{totalPending}</span>
        ) : null}
      </h2>

      {/* Pending access requests */}
      {requests.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Pending access requests ({requests.length})
          </div>
          <ul className="divide-y border rounded text-xs">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start gap-2 p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">{r.email}</div>
                  {r.display_name ? <div className="text-slate-500">{r.display_name}</div> : null}
                  {r.note ? <div className="text-slate-400 italic">{r.note}</div> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={decisionBusy === r.id}
                    onClick={() => void onDecideRequest(r.id, "approve")}
                    className="rounded bg-emerald-500 px-2 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={decisionBusy === r.id}
                    onClick={() => void onDecideRequest(r.id, "reject")}
                    className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending reps (signed in but not yet approved) */}
      {pendingReps.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Pending accounts ({pendingReps.length})
          </div>
          <ul className="divide-y border rounded text-xs">
            {pendingReps.map((r) => (
              <li key={r.id} className="flex items-center gap-2 p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 truncate">{r.display_name}</div>
                  <div className="text-slate-400">Signed in, awaiting approval</div>
                </div>
                <button
                  type="button"
                  disabled={decisionBusy === r.id}
                  onClick={() => void onApprovePendingRep(r.id)}
                  className="rounded bg-emerald-500 px-2 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create invite */}
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Create invite link</div>
        <form onSubmit={(e) => void onCreateInvite(e)} className="flex flex-col gap-2 sm:flex-row">
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
        {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
        {lastUrl ? (
          <div className="mt-2 break-all rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
            <div className="mb-1 font-semibold">Invite link (copy &amp; send):</div>
            <code>{lastUrl}</code>
          </div>
        ) : null}
      </div>

      {/* Invite list */}
      {invites.length > 0 ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Invites</div>
          <ul className="divide-y border-t text-xs">
            {invites.map((inv) => {
              const status = inv.accepted_at
                ? "accepted"
                : inv.revoked_at
                  ? "revoked"
                  : new Date(inv.expires_at).getTime() < nowMs
                    ? "expired"
                    : "pending";
              return (
                <li key={inv.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{inv.email}</div>
                    <div className="text-slate-500">{inv.role} · {status}</div>
                  </div>
                  {status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void onRevokeInvite(inv.id)}
                      className="text-red-600 hover:underline shrink-0"
                    >
                      revoke
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
