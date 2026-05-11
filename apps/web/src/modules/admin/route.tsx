import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";
import { useAuth } from "@/lib/auth.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

interface RepRow {
  id: string;
  display_name: string | null;
  role: string;
  status: string;
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

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Badge({ role }: { role: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
      {role}
    </span>
  );
}

export function AdminRoute() {
  const { rep } = useAuth();
  const navigate = useNavigate();
  const [allReps, setAllReps] = useState<RepRow[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"rep" | "admin">("rep");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    if (rep && rep.role !== "admin") { void navigate("/home"); }
  }, [rep, navigate]);

  const refresh = async () => {
    setLoading(true);
    const [repsRes, reqRes, invRes] = await Promise.all([
      supabase.from("rep").select("id,display_name,role,status,created_at").order("created_at", { ascending: true }),
      supabase.from("rep_access_request").select("id,email,display_name,note,status,created_at").eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("rep_invite").select("id,token,email,role,expires_at,accepted_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setAllReps((repsRes.data as RepRow[] | null) ?? []);
    setRequests((reqRes.data as AccessRequest[] | null) ?? []);
    setInvites((invRes.data as InviteRow[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (rep?.role === "admin") void refresh();
  }, [rep?.role]);

  const setRepStatus = async (id: string, status: string) => {
    setBusy(id);
    await supabase.from("rep").update({ status }).eq("id", id);
    await refresh();
    setBusy(null);
  };

  const setRepRole = async (id: string, role: string) => {
    setBusy(id + "-role");
    await supabase.from("rep").update({ role }).eq("id", id);
    await refresh();
    setBusy(null);
  };

  const decideRequest = async (requestId: string, decision: "approve" | "reject") => {
    if (!SUPABASE_URL) return;
    setBusy(requestId);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) {
      await fetch(`${SUPABASE_URL}/functions/v1/approve-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
    }
    await refresh();
    setBusy(null);
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteUrl(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) { setInviteError("Sign in with a real account to send invites."); setInviteBusy(false); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const json = (await res.json()) as { invite_url?: string; error?: string };
    if (!res.ok || !json.invite_url) { setInviteError(json.error ?? `Failed (${res.status})`); }
    else { setInviteUrl(json.invite_url); setInviteEmail(""); await refresh(); }
    setInviteBusy(false);
  };

  const revokeInvite = async (id: string) => {
    await supabase.from("rep_invite").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    await refresh();
  };

  if (!rep || rep.role !== "admin") return null;

  const pending = allReps.filter((r) => r.status === "pending");
  const active = allReps.filter((r) => r.status === "active");
  const suspended = allReps.filter((r) => r.status === "suspended");
  const totalPending = requests.length + pending.length;

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
      <header className="border-b bg-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage reps, access requests, and invites</p>
        </div>
        <div className="flex items-center gap-3">
          {totalPending > 0 && (
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-sm font-bold text-white">{totalPending} pending</span>
          )}
          <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="flex-1 space-y-4 p-4">

          {/* Access requests */}
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Access requests</h2>
              {requests.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{requests.length}</span>}
            </div>
            {requests.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">No pending requests.</p>
            ) : (
              <ul className="divide-y">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{r.email}</div>
                      {r.display_name && <div className="text-sm text-slate-600">{r.display_name}</div>}
                      {r.note && <div className="text-sm text-slate-400 italic">{r.note}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">{ago(r.created_at)}</div>
                    </div>
                    <div className="flex gap-2 shrink-0 pt-0.5">
                      <button type="button" disabled={busy === r.id} onClick={() => void decideRequest(r.id, "approve")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Approve</button>
                      <button type="button" disabled={busy === r.id} onClick={() => void decideRequest(r.id, "reject")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pending accounts */}
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Pending accounts</h2>
              {pending.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{pending.length}</span>}
            </div>
            {pending.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">No pending accounts.</p>
            ) : (
              <ul className="divide-y">
                {pending.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{r.display_name ?? "(no name)"}</div>
                      <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                    </div>
                    <Badge role={r.role} />
                    <button type="button" disabled={busy === r.id} onClick={() => void setRepStatus(r.id, "active")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Approve</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Active reps */}
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Active reps <span className="text-slate-400 font-normal">({active.length})</span></h2>
            </div>
            {active.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">No active reps.</p>
            ) : (
              <ul className="divide-y">
                {active.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{r.display_name ?? "(no name)"}</div>
                      <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                    </div>
                    <Badge role={r.role} />
                    <button type="button" disabled={busy === r.id + "-role"} onClick={() => void setRepRole(r.id, r.role === "admin" ? "rep" : "admin")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {r.role === "admin" ? "Make rep" : "Make admin"}
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => void setRepStatus(r.id, "suspended")} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Suspend</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Suspended reps */}
          {suspended.length > 0 && (
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-red-50">
                <h2 className="text-sm font-semibold text-red-800">Suspended <span className="font-normal">({suspended.length})</span></h2>
              </div>
              <ul className="divide-y">
                {suspended.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-700">{r.display_name ?? "(no name)"}</div>
                      <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                    </div>
                    <Badge role={r.role} />
                    <button type="button" disabled={busy === r.id} onClick={() => void setRepStatus(r.id, "active")} className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Reactivate</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Send invite */}
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800">Send invite link</h2>
            </div>
            <div className="px-4 py-4 space-y-3">
              <form onSubmit={(e) => void createInvite(e)} className="flex flex-col gap-2 sm:flex-row">
                <input type="email" required placeholder="rep@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "rep" | "admin")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="rep">rep</option>
                  <option value="admin">admin</option>
                </select>
                <button type="submit" disabled={inviteBusy || !inviteEmail.trim()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                  {inviteBusy ? "Generating…" : "Create invite"}
                </button>
              </form>
              {inviteError && <p className="text-sm text-red-700">{inviteError}</p>}
              {inviteUrl && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="font-semibold mb-1">Copy and send this link:</div>
                  <code className="break-all text-xs">{inviteUrl}</code>
                </div>
              )}
            </div>
          </section>

          {/* Invite history */}
          {invites.length > 0 && (
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">Invite history</h2>
              </div>
              <ul className="divide-y">
                {invites.map((inv) => {
                  const status = inv.accepted_at ? "accepted" : inv.revoked_at ? "revoked" : new Date(inv.expires_at).getTime() < nowMs ? "expired" : "pending";
                  return (
                    <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{inv.email}</div>
                        <div className="text-xs text-slate-400">{inv.role} · {status} · {ago(inv.created_at)}</div>
                      </div>
                      {status === "pending" && (
                        <button type="button" onClick={() => void revokeInvite(inv.id)} className="text-sm text-red-500 hover:underline">Revoke</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
