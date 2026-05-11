import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";
import { useAuth } from "@/lib/auth.js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://sclisaylpwnffkkyepow.supabase.co";

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold ${role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
      {role}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white leading-none">{count}</span>
      )}
    </div>
  );
}

export function AdminPanel() {
  const { rep } = useAuth();
  const [allReps, setAllReps] = useState<RepRow[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"rep" | "admin">("rep");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const refresh = async () => {
    const [repsRes, reqRes, invRes] = await Promise.all([
      supabase.from("rep").select("id,display_name,role,status,created_at").order("created_at", { ascending: true }),
      supabase.from("rep_access_request").select("id,email,display_name,note,status,created_at").eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("rep_invite").select("id,token,email,role,expires_at,accepted_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setAllReps((repsRes.data as RepRow[] | null) ?? []);
    setRequests((reqRes.data as AccessRequest[] | null) ?? []);
    setInvites((invRes.data as InviteRow[] | null) ?? []);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (rep?.role === "admin") void refresh();
  }, [rep?.role]);

  const setRepStatus = async (repId: string, status: string) => {
    setActionBusy(repId);
    await supabase.from("rep").update({ status }).eq("id", repId);
    await refresh();
    setActionBusy(null);
  };

  const setRepRole = async (repId: string, role: string) => {
    setActionBusy(repId + "-role");
    await supabase.from("rep").update({ role }).eq("id", repId);
    await refresh();
    setActionBusy(null);
  };

  const decideRequest = async (requestId: string, decision: "approve" | "reject") => {
    if (!SUPABASE_URL) return;
    setActionBusy(requestId);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    if (accessToken) {
      await fetch(`${SUPABASE_URL}/functions/v1/approve-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
    }
    await refresh();
    setActionBusy(null);
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SUPABASE_URL) { setInviteError("Supabase URL not configured."); return; }
    setInviteBusy(true);
    setInviteError(null);
    setInviteUrl(null);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    if (!accessToken) { setInviteError("Not signed in."); setInviteBusy(false); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const json = (await res.json()) as { invite_url?: string; error?: string };
    if (!res.ok || !json.invite_url) {
      setInviteError(json.error ?? `Failed (${res.status})`);
    } else {
      setInviteUrl(json.invite_url);
      setInviteEmail("");
      await refresh();
    }
    setInviteBusy(false);
  };

  const revokeInvite = async (id: string) => {
    await supabase.from("rep_invite").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    await refresh();
  };

  if (!rep || rep.role !== "admin") return null;

  const pendingReps = allReps.filter((r) => r.status === "pending");
  const activeReps = allReps.filter((r) => r.status === "active");
  const suspendedReps = allReps.filter((r) => r.status === "suspended");
  const totalPending = requests.length + pendingReps.length;

  return (
    <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Admin portal</span>
          {totalPending > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{totalPending}</span>
          )}
        </div>
        <button type="button" onClick={() => void refresh()} className="text-xs text-slate-500 hover:text-slate-700">
          Refresh
        </button>
      </div>

      <div className="divide-y">

        {/* Pending access requests */}
        <div className="px-4 py-3 space-y-2">
          <SectionHeader title="Access requests" count={requests.length} />
          {requests.length === 0 ? (
            <p className="text-xs text-slate-400">No pending requests.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">{r.email}</div>
                      {r.display_name && <div className="text-slate-600">{r.display_name}</div>}
                      {r.note && <div className="text-slate-500 italic mt-0.5">{r.note}</div>}
                      <div className="text-slate-400 mt-0.5">{relativeTime(r.created_at)}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={actionBusy === r.id}
                        onClick={() => void decideRequest(r.id, "approve")}
                        className="rounded bg-emerald-500 px-2 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy === r.id}
                        onClick={() => void decideRequest(r.id, "reject")}
                        className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending accounts */}
        <div className="px-4 py-3 space-y-2">
          <SectionHeader title="Pending accounts" count={pendingReps.length} />
          {pendingReps.length === 0 ? (
            <p className="text-xs text-slate-400">No pending accounts.</p>
          ) : (
            <ul className="space-y-1">
              {pendingReps.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{r.display_name ?? "(no name)"}</div>
                    <div className="text-slate-400">{relativeTime(r.created_at)}</div>
                  </div>
                  <RoleBadge role={r.role} />
                  <button
                    type="button"
                    disabled={actionBusy === r.id}
                    onClick={() => void setRepStatus(r.id, "active")}
                    className="rounded bg-emerald-500 px-2 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Approve
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active reps */}
        <div className="px-4 py-3 space-y-2">
          <SectionHeader title={`Active reps (${activeReps.length})`} />
          {activeReps.length === 0 ? (
            <p className="text-xs text-slate-400">No active reps.</p>
          ) : (
            <ul className="space-y-1">
              {activeReps.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{r.display_name ?? "(no name)"}</div>
                    <div className="text-slate-400">{relativeTime(r.created_at)}</div>
                  </div>
                  <RoleBadge role={r.role} />
                  <button
                    type="button"
                    disabled={actionBusy === r.id + "-role"}
                    onClick={() => void setRepRole(r.id, r.role === "admin" ? "rep" : "admin")}
                    className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {r.role === "admin" ? "Make rep" : "Make admin"}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy === r.id}
                    onClick={() => void setRepStatus(r.id, "suspended")}
                    className="rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Suspend
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Suspended reps */}
        {suspendedReps.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            <SectionHeader title={`Suspended (${suspendedReps.length})`} />
            <ul className="space-y-1">
              {suspendedReps.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{r.display_name ?? "(no name)"}</div>
                    <div className="text-slate-400">{relativeTime(r.created_at)}</div>
                  </div>
                  <RoleBadge role={r.role} />
                  <button
                    type="button"
                    disabled={actionBusy === r.id}
                    onClick={() => void setRepStatus(r.id, "active")}
                    className="rounded bg-slate-600 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Reactivate
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Create invite */}
        <div className="px-4 py-3 space-y-2">
          <SectionHeader title="Send invite link" />
          <form onSubmit={(e) => void createInvite(e)} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              placeholder="rep@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "rep" | "admin")}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="rep">rep</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy || !inviteEmail.trim()}
              className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {inviteBusy ? "Generating…" : "Create invite"}
            </button>
          </form>
          {inviteError && <p className="text-xs text-red-700">{inviteError}</p>}
          {inviteUrl && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
              <div className="font-semibold mb-1">Copy and send this link:</div>
              <code className="break-all">{inviteUrl}</code>
            </div>
          )}
        </div>

        {/* Invite list */}
        {invites.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            <SectionHeader title="Invites" />
            <ul className="divide-y text-xs">
              {invites.map((inv) => {
                const status = inv.accepted_at ? "accepted"
                  : inv.revoked_at ? "revoked"
                  : new Date(inv.expires_at).getTime() < nowMs ? "expired"
                  : "pending";
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-700 truncate">{inv.email}</div>
                      <div className="text-slate-400">{inv.role} · {status} · {relativeTime(inv.created_at)}</div>
                    </div>
                    {status === "pending" && (
                      <button type="button" onClick={() => void revokeInvite(inv.id)} className="text-red-500 hover:underline shrink-0">
                        revoke
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      </div>
    </section>
  );
}
