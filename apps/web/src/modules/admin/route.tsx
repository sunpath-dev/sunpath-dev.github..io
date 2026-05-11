import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";
import { useAuth } from "@/lib/auth.js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://sclisaylpwnffkkyepow.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbGlzYXlscHduZmZra3llcG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTM5NDAsImV4cCI6MjA5Mzk2OTk0MH0.UauOnRMirTmgvwfp0445noEC-du0_hEXjyEQ8lHNuBY";
const REPO = "https://github.com/sunpath-dev/sunpath-dev.github.io";
const SUPABASE_DASH = "https://supabase.com/dashboard/project/sclisaylpwnffkkyepow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface CountyRow {
  state_fips: string;
  county_fips: string;
  state: string;
  parcel_count: number;
  owner_occupied_count: number;
  solar_count: number;
  last_source_update: string | null;
  last_ingested_at: string | null;
}

interface AuditRow {
  id: number;
  event: string;
  target_table: string | null;
  ip_addr: string | null;
  occurred_at: string;
  rep_id: string | null;
}

interface ApiCheck {
  name: string;
  category: "direct" | "edge";
  endpoint: string;
  latencyMs: number | null;
  ok: boolean | null;
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Badge({ role }: { role: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
      {role}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />;
  return <span className={`h-2.5 w-2.5 rounded-full inline-block ${ok ? "bg-emerald-500" : "bg-red-500"}`} />;
}

// ---------------------------------------------------------------------------
// Edit Rep Modal
// ---------------------------------------------------------------------------

interface EditRepModalProps {
  rep: RepRow | null;
  onClose: () => void;
  onSave: (id: string, patch: { display_name?: string; role?: string; status?: string }) => Promise<void>;
}

function EditRepModal({ rep, onClose, onSave }: EditRepModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("rep");
  const [status, setStatus] = useState("pending");
  const [resetEmail, setResetEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (rep) {
      setName(rep.display_name ?? "");
      setRole(rep.role);
      setStatus(rep.status);
      setResetMsg(null);
      setSaveMsg(null);
    }
  }, [rep]);

  if (!rep) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    await onSave(rep.id, { display_name: name.trim() || undefined, role, status });
    setSaveMsg("Saved.");
    setSaving(false);
  };

  const handleReset = async () => {
    const email = resetEmail.trim();
    if (!email) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    setResetMsg(error ? `Error: ${error.message}` : `Reset email sent to ${email}.`);
    setResetting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50">
          <h3 className="font-semibold text-slate-900">Edit rep — {rep.display_name ?? "(no name)"}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="rep">rep</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="pending">pending</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
          </div>

          {saveMsg && <p className="text-sm text-emerald-700 font-medium">{saveMsg}</p>}

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <hr className="border-slate-200" />

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Send password reset email</div>
            <div className="text-xs text-slate-500 mb-2">Enter this rep&apos;s email address to send them a password reset link.</div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="rep@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="button"
                disabled={resetting || !resetEmail.trim()}
                onClick={() => void handleReset()}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {resetting ? "Sending…" : "Send"}
              </button>
            </div>
            {resetMsg && (
              <p className={`text-xs mt-1.5 font-medium ${resetMsg.startsWith("Error") ? "text-red-700" : "text-emerald-700"}`}>
                {resetMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reps Tab
// ---------------------------------------------------------------------------

function RepsTab({
  allReps, requests, invites, loading, busy, inviteEmail, inviteRole,
  inviteBusy, inviteError, inviteUrl, nowMs, hasRealSession,
  setInviteEmail, setInviteRole,
  setRepStatus, setRepRole, decideRequest, createInvite, revokeInvite, onEditRep,
}: {
  allReps: RepRow[]; requests: AccessRequest[]; invites: InviteRow[];
  loading: boolean; busy: string | null; inviteEmail: string; inviteRole: "rep" | "admin";
  inviteBusy: boolean; inviteError: string | null; inviteUrl: string | null;
  nowMs: number; hasRealSession: boolean;
  setInviteEmail: (v: string) => void; setInviteRole: (v: "rep" | "admin") => void;
  setRepStatus: (id: string, s: string) => void; setRepRole: (id: string, r: string) => void;
  decideRequest: (id: string, d: "approve" | "reject") => void;
  createInvite: (e: React.FormEvent) => void; revokeInvite: (id: string) => void;
  onEditRep: (rep: RepRow) => void;
}) {
  if (loading) return <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-500">Loading…</div>;

  const pending = allReps.filter((r) => r.status === "pending");
  const active = allReps.filter((r) => r.status === "active");
  const suspended = allReps.filter((r) => r.status === "suspended");

  return (
    <div className="space-y-4">

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
                  <button type="button" disabled={busy === r.id} onClick={() => decideRequest(r.id, "approve")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Approve</button>
                  <button type="button" disabled={busy === r.id} onClick={() => decideRequest(r.id, "reject")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Reject</button>
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
              <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{r.display_name ?? "(no name)"}</div>
                  <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                </div>
                <Badge role={r.role} />
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "active")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Approve</button>
                <button type="button" onClick={() => onEditRep(r)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Edit</button>
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
              <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{r.display_name ?? "(no name)"}</div>
                  <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                </div>
                <Badge role={r.role} />
                <button type="button" disabled={busy === r.id + "-role"} onClick={() => setRepRole(r.id, r.role === "admin" ? "rep" : "admin")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {r.role === "admin" ? "Make rep" : "Make admin"}
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "suspended")} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Suspend</button>
                <button type="button" onClick={() => onEditRep(r)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Edit</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suspended */}
      {suspended.length > 0 && (
        <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-red-50">
            <h2 className="text-sm font-semibold text-red-800">Suspended <span className="font-normal">({suspended.length})</span></h2>
          </div>
          <ul className="divide-y">
            {suspended.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-700">{r.display_name ?? "(no name)"}</div>
                  <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                </div>
                <Badge role={r.role} />
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "active")} className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Reactivate</button>
                <button type="button" onClick={() => onEditRep(r)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Edit</button>
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
          {!hasRealSession && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              You are in demo mode. Sign in with a real account (admin@sunpath.dev) to send invites.
            </div>
          )}
          <form onSubmit={(e) => createInvite(e)} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              placeholder="rep@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "rep" | "admin")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="rep">rep</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy || !inviteEmail.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {inviteBusy ? "Generating…" : "Create invite"}
            </button>
          </form>
          {inviteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 font-medium">
              {inviteError}
            </div>
          )}
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
                    <button type="button" onClick={() => revokeInvite(inv.id)} className="text-sm text-red-500 hover:underline">Revoke</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Territory Tab
// ---------------------------------------------------------------------------

interface CountyDef {
  countyFips: string;
  name: string;
}

interface StateDef {
  fips: string;
  abbrev: string;
  label: string;
  counties: CountyDef[];
}

// Counties listed roughly north→south within each state. Expand as needed.
const STATES: StateDef[] = [
  {
    fips: "51", abbrev: "VA", label: "Virginia",
    counties: [
      { countyFips: "027", name: "Buchanan County" },
      { countyFips: "051", name: "Dickenson County" },
      { countyFips: "071", name: "Giles County" },
      { countyFips: "077", name: "Grayson County" },
      { countyFips: "105", name: "Lee County" },
      { countyFips: "121", name: "Montgomery County" },
      { countyFips: "155", name: "Pulaski County" },
      { countyFips: "161", name: "Roanoke County" },
      { countyFips: "167", name: "Russell County" },
      { countyFips: "169", name: "Scott County" },
      { countyFips: "173", name: "Smyth County" },
      { countyFips: "185", name: "Tazewell County" },
      { countyFips: "191", name: "Washington County" },
      { countyFips: "195", name: "Wise County" },
      { countyFips: "197", name: "Wythe County" },
    ],
  },
];

const COUNTY_LABEL: Record<string, string> = Object.fromEntries(
  STATES.flatMap((s) => s.counties.map((c) => [`${s.fips}${c.countyFips}`, c.name]))
);

function TerritoryTab() {
  const [loadedCounties, setLoadedCounties] = useState<CountyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);
  const [selectedStateFips, setSelectedStateFips] = useState("51");
  const [selectedCountyFips, setSelectedCountyFips] = useState("169");
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("admin_county_summary").select("*");
      setLoadedCounties((data as CountyRow[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const stateDef = STATES.find((s) => s.fips === selectedStateFips) ?? STATES[0]!;

  const handleStateChange = (newStateFips: string) => {
    setSelectedStateFips(newStateFips);
    const newState = STATES.find((s) => s.fips === newStateFips);
    if (newState && newState.counties.length > 0) {
      setSelectedCountyFips(newState.counties[0]!.countyFips);
    }
    setIngestResult(null);
  };

  const triggerRescore = async (stateFips: string, countyFips: string) => {
    const key = `${stateFips}-${countyFips}`;
    setRescoring(key);
    setRescoreMsg(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) { setRescoring(null); return; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/score-parcels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state_fips: stateFips, county_fips: countyFips }),
    });
    setRescoreMsg(res.ok ? `Re-score triggered for ${countyLabel(stateFips, countyFips)}` : `Failed (${res.status})`);
    setRescoring(null);
  };

  const runIngest = async () => {
    setIngesting(true);
    setIngestResult(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setIngestResult("Error: Sign in with a real account to run ingest.");
      setIngesting(false);
      return;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-parcels`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state_fips: selectedStateFips, county_fips: selectedCountyFips }),
      });
      const json = (await res.json()) as { ok?: boolean; seen?: number; upserted?: number; capped?: boolean; error?: string };
      const elapsed = Math.round((Date.now() - t0) / 1000);
      if (res.ok && json.ok) {
        setIngestResult(`Done in ${elapsed}s — seen ${json.seen ?? 0} parcels, upserted ${json.upserted ?? 0}${json.capped ? " (hit 5k cap — run again to continue)" : ""}.`);
      } else {
        setIngestResult(`Failed (${res.status}): ${json.error ?? "unknown error"}`);
      }
    } catch (err) {
      setIngestResult(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setIngesting(false);
    const { data } = await supabase.from("admin_county_summary").select("*");
    setLoadedCounties((data as CountyRow[] | null) ?? []);
  };

  const countyLabel = (stateFips: string, countyFips: string) =>
    COUNTY_LABEL[`${stateFips}${countyFips}`] ?? `County ${countyFips}`;

  return (
    <div className="space-y-4">
      {rescoreMsg && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{rescoreMsg}</div>
      )}

      {/* Run ingest */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Run parcel ingest</h2>
          <p className="text-xs text-slate-500 mt-0.5">Incremental sync from VGIN ArcGIS (up to 5,000 parcels per run — re-run to continue a large county).</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
              <select
                value={selectedStateFips}
                onChange={(e) => handleStateChange(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {STATES.map((s) => (
                  <option key={s.fips} value={s.fips}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">County</label>
              <select
                value={selectedCountyFips}
                onChange={(e) => { setSelectedCountyFips(e.target.value); setIngestResult(null); }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {stateDef.counties.map((c) => (
                  <option key={c.countyFips} value={c.countyFips}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                disabled={ingesting}
                onClick={() => void runIngest()}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
              >
                {ingesting ? "Running…" : "Run ingest"}
              </button>
            </div>
          </div>
          {ingestResult && (
            <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${ingestResult.startsWith("Error") || ingestResult.startsWith("Failed") || ingestResult.startsWith("Network") ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {ingestResult}
            </div>
          )}
        </div>
      </section>

      {/* Loaded counties */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Loaded counties</h2>
          <span className="text-xs text-slate-500">{loadedCounties.length} {loadedCounties.length === 1 ? "county" : "counties"}</span>
        </div>
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : loadedCounties.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">No parcel data loaded yet. Run the ingest above to populate counties.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2">County</th>
                  <th className="px-4 py-2 text-right">Parcels</th>
                  <th className="px-4 py-2 text-right">Owner-occ</th>
                  <th className="px-4 py-2 text-right">Has solar</th>
                  <th className="px-4 py-2">Last ingest</th>
                  <th className="px-4 py-2">Last source</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadedCounties.map((c) => {
                  const key = `${c.state_fips}-${c.county_fips}`;
                  const name = countyLabel(c.state_fips, c.county_fips);
                  const ooPercent = c.parcel_count > 0 ? Math.round(c.owner_occupied_count / c.parcel_count * 100) : 0;
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {name}, {c.state}
                        <div className="text-xs text-slate-400 font-normal">{c.state_fips}-{c.county_fips}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.parcel_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{ooPercent}%</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.solar_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{c.last_ingested_at ? ago(c.last_ingested_at) : "—"}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{c.last_source_update ? ago(c.last_source_update) : "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={rescoring === key}
                          onClick={() => void triggerRescore(c.state_fips, c.county_fips)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40"
                        >
                          {rescoring === key ? "Scoring…" : "Re-score"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* GitHub Actions link */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Full county load (GitHub Actions)</h2>
        </div>
        <div className="px-4 py-4 space-y-2 text-sm text-slate-700">
          <p>For initial full loads (100k+ parcels), use the GitHub Actions workflow — no edge function 60s time limit:</p>
          <a
            href={`${REPO}/actions/workflows/ingest-parcels.yml`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-700"
          >
            <span>Run ingest-parcels workflow</span>
            <span className="text-slate-400">↗</span>
          </a>
          <p className="text-xs text-slate-500">Select adapter: scott-va, then optionally set limit or dry-run. Requires SUPABASE_SERVICE_ROLE_KEY in repo secrets.</p>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Tab
// ---------------------------------------------------------------------------

const DIRECT_CHECKS: ApiCheck[] = [
  { name: "NOAA NWS", category: "direct", endpoint: "https://api.weather.gov/", latencyMs: null, ok: null, label: "Weather API (primary)" },
  { name: "Supabase REST", category: "direct", endpoint: `${SUPABASE_URL ?? ""}/rest/v1/`, latencyMs: null, ok: null, label: "Database API" },
];

const EDGE_FN_CHECKS: ApiCheck[] = [
  { name: "weather-now", category: "edge", endpoint: "weather-now", latencyMs: null, ok: null, label: "NWS weather proxy" },
  { name: "pvwatts-fetch", category: "edge", endpoint: "pvwatts-fetch", latencyMs: null, ok: null, label: "NREL PVWatts v8" },
  { name: "incentives-fetch", category: "edge", endpoint: "incentives-fetch", latencyMs: null, ok: null, label: "DSIRE incentives" },
  { name: "rate-watch-eia", category: "edge", endpoint: "rate-watch-eia", latencyMs: null, ok: null, label: "EIA utility rates" },
  { name: "census-fetch", category: "edge", endpoint: "census-fetch", latencyMs: null, ok: null, label: "US Census ACS" },
  { name: "score-parcels", category: "edge", endpoint: "score-parcels", latencyMs: null, ok: null, label: "Knock scoring engine" },
  { name: "geo-reverse", category: "edge", endpoint: "geo-reverse", latencyMs: null, ok: null, label: "GPS → county/state" },
  { name: "ingest-parcels", category: "edge", endpoint: "ingest-parcels", latencyMs: null, ok: null, label: "VGIN parcel ingest" },
  { name: "invite-create", category: "edge", endpoint: "invite-create", latencyMs: null, ok: null, label: "Invite link creation" },
  { name: "approve-access", category: "edge", endpoint: "approve-access", latencyMs: null, ok: null, label: "Access request approval" },
  { name: "solar-rooftop", category: "edge", endpoint: "solar-rooftop", latencyMs: null, ok: null, label: "Solar rooftop analysis" },
  { name: "fema-flood-zone", category: "edge", endpoint: "fema-flood-zone", latencyMs: null, ok: null, label: "FEMA flood zone lookup" },
];

const EDGE_FUNCTIONS = [
  "approve-access", "callback-submit", "census-fetch", "doorcard-pdf",
  "fema-flood-zone", "forecast-fetch", "geo-reverse", "homeowner-export",
  "incentives-fetch", "ingest-area-signals", "ingest-parcels", "invite-accept",
  "invite-create", "pvwatts-fetch", "push-send", "rate-watch-eia",
  "request-access", "rewarm-derive", "rewarm-push", "score-parcels",
  "solar-rooftop", "triggers-callback-due", "triggers-property-sales",
  "triggers-scan-permits", "weather-now",
].sort();

function SystemTab() {
  const [directChecks, setDirectChecks] = useState<ApiCheck[]>(DIRECT_CHECKS);
  const [edgeFnChecks, setEdgeFnChecks] = useState<ApiCheck[]>(EDGE_FN_CHECKS);
  const [checking, setChecking] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState("");

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,event,target_table,ip_addr,occurred_at,rep_id")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) {
        setAuditError(error.code === "42501" ? "Run migration 0030 to enable admin audit log access." : error.message);
      } else {
        setAuditLog((data as AuditRow[] | null) ?? []);
      }
      setAuditLoading(false);
    })();
  }, []);

  const checkOne = async (check: ApiCheck): Promise<ApiCheck> => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const authKey = token ?? SUPABASE_ANON_KEY;
    const t0 = Date.now();
    try {
      if (check.category === "direct") {
        const headers: Record<string, string> = {
          "User-Agent": "Sunpath/1.0 (admin health check)",
        };
        if (check.name === "Supabase REST") {
          headers["apikey"] = SUPABASE_ANON_KEY;
          headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
        }
        const res = await fetch(check.endpoint, { headers, signal: AbortSignal.timeout(8000) });
        return { ...check, ok: res.ok, latencyMs: Date.now() - t0 };
      } else {
        // Edge function: send proper auth so CORS is clean, check for alive (not 502/503/404)
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${check.endpoint}`, {
          method: "GET",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authKey}` },
          signal: AbortSignal.timeout(8000),
        });
        const alive = res.status !== 503 && res.status !== 502 && res.status !== 404;
        return { ...check, ok: alive, latencyMs: Date.now() - t0 };
      }
    } catch {
      return { ...check, ok: false, latencyMs: Date.now() - t0 };
    }
  };

  const runSingleCheck = async (name: string) => {
    setCheckingId(name);
    const direct = directChecks.find((c) => c.name === name);
    if (direct) {
      const updated = await checkOne(direct);
      setDirectChecks((prev) => prev.map((c) => c.name === name ? updated : c));
    }
    const edge = edgeFnChecks.find((c) => c.name === name);
    if (edge) {
      const updated = await checkOne(edge);
      setEdgeFnChecks((prev) => prev.map((c) => c.name === name ? updated : c));
    }
    setCheckingId(null);
  };

  const runChecks = async () => {
    setChecking(true);
    const [updatedDirect, updatedEdge] = await Promise.all([
      Promise.all(directChecks.map(checkOne)),
      Promise.all(edgeFnChecks.map(checkOne)),
    ]);
    setDirectChecks(updatedDirect);
    setEdgeFnChecks(updatedEdge);
    setChecking(false);
  };

  const exportAuditCsv = () => {
    const rows = auditLog.filter((e) => !auditFilter || e.event.includes(auditFilter));
    const header = "id,event,target_table,ip_addr,rep_id,occurred_at\n";
    const csv = header + rows.map((e) =>
      [e.id, e.event, e.target_table ?? "", e.ip_addr ?? "", e.rep_id ?? "", e.occurred_at].join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunpath-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypes = [...new Set(auditLog.map((e) => e.event))].sort();
  const filteredAudit = auditFilter ? auditLog.filter((e) => e.event === auditFilter) : auditLog;

  return (
    <div className="space-y-4">

      {/* Edge function status chips */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Edge functions ({EDGE_FUNCTIONS.length} deployed)</h2>
          <a href={`${SUPABASE_DASH}/functions`} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline">Supabase logs ↗</a>
        </div>
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {EDGE_FUNCTIONS.map((fn) => (
              <div key={fn} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-mono text-slate-700">{fn}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Last deployed 2026-05-10. Use the Supabase edge function log link above to view live invocations and errors.</p>
        </div>
      </section>

      {/* API connectivity */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">API connectivity</h2>
            <p className="text-xs text-slate-500 mt-0.5">Direct: checks from your browser. Edge fn: checks if the function is deployed and responding.</p>
          </div>
          <button type="button" disabled={checking} onClick={() => void runChecks()} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {checking ? "Checking…" : "Run all checks"}
          </button>
        </div>

        <div className="px-4 py-2 border-b bg-slate-50">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Direct browser checks</div>
        </div>
        <ul className="divide-y">
          {directChecks.map((c) => (
            <li key={c.name} className="flex items-center gap-2 px-4 py-3">
              <StatusDot ok={c.ok} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-400">{c.label}</div>
              </div>
              {c.latencyMs !== null && <span className="text-xs tabular-nums text-slate-500 shrink-0">{c.latencyMs}ms</span>}
              {c.ok === null && <span className="text-xs text-slate-400 shrink-0 w-12 text-right">—</span>}
              {c.ok === false && c.latencyMs !== null && <span className="text-xs text-red-600 font-medium shrink-0 w-12 text-right">Failed</span>}
              {c.ok === true && <span className="text-xs text-emerald-600 font-medium shrink-0 w-12 text-right">OK</span>}
              <button
                type="button"
                disabled={checking || checkingId === c.name}
                onClick={() => void runSingleCheck(c.name)}
                className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {checkingId === c.name ? "…" : "Check"}
              </button>
            </li>
          ))}
        </ul>

        <div className="px-4 py-2 border-b border-t bg-slate-50">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edge function alive checks</div>
        </div>
        <ul className="divide-y">
          {edgeFnChecks.map((c) => (
            <li key={c.name} className="flex items-center gap-2 px-4 py-3">
              <StatusDot ok={c.ok} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 font-mono truncate">{c.name}</div>
                <div className="text-xs text-slate-400">{c.label}</div>
              </div>
              {c.latencyMs !== null && <span className="text-xs tabular-nums text-slate-500 shrink-0">{c.latencyMs}ms</span>}
              {c.ok === null && <span className="text-xs text-slate-400 shrink-0 w-16 text-right">—</span>}
              {c.ok === false && c.latencyMs !== null && <span className="text-xs text-red-600 font-medium shrink-0 w-16 text-right">Unreachable</span>}
              {c.ok === true && <span className="text-xs text-emerald-600 font-medium shrink-0 w-16 text-right">Alive</span>}
              <button
                type="button"
                disabled={checking || checkingId === c.name}
                onClick={() => void runSingleCheck(c.name)}
                className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {checkingId === c.name ? "…" : "Check"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Audit log */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Audit log</h2>
            <p className="text-xs text-slate-500 mt-0.5">Security events: rate limit hits, invite actions, access approvals, rep status changes.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {auditLog.length > 0 && (
              <button type="button" onClick={exportAuditCsv} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Export CSV
              </button>
            )}
          </div>
        </div>

        {auditLog.length > 0 && !auditError && (
          <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-2">
            <label className="text-xs text-slate-600 shrink-0">Filter by event:</label>
            <select
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="">All events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {auditFilter && (
              <button type="button" onClick={() => setAuditFilter("")} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>
            )}
            <span className="text-xs text-slate-400 ml-auto">{filteredAudit.length} events</span>
          </div>
        )}

        {auditLoading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : auditError ? (
          <div className="px-4 py-4">
            <p className="text-sm text-amber-700">{auditError}</p>
          </div>
        ) : filteredAudit.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">No audit events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">IP</th>
                  <th className="px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAudit.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{e.event}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{e.target_table ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{e.ip_addr ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{ago(e.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Docs Tab
// ---------------------------------------------------------------------------

function DocsTab() {
  const links = [
    {
      group: "Architecture & Planning",
      items: [
        { label: "Build Plan (all phases)", href: `${REPO}/blob/main/plan.md`, desc: "Full phase plan, deferred items, production hardening checklist" },
        { label: "Whitepaper", href: `${REPO}/blob/main/docs/whitepaper.md`, desc: "Product overview, knock score explanation, data sources" },
        { label: "Design Doc v1.3", href: `${REPO}/blob/main/docs/DESIGN.md`, desc: "Authoritative design specification" },
        { label: "CHANGELOG", href: `${REPO}/blob/main/CHANGELOG.md`, desc: "Version history" },
        { label: "ROADMAP", href: `${REPO}/blob/main/ROADMAP.md`, desc: "Upcoming features and phases" },
      ],
    },
    {
      group: "Data & APIs",
      items: [
        { label: "API Reference", href: `${REPO}/blob/main/docs/apis.md`, desc: "All external data sources and edge function specs" },
        { label: "Troubleshooting Guide", href: `${REPO}/blob/main/docs/troubleshooting.md`, desc: "Common issues and fixes" },
        { label: "Security Policy", href: `${REPO}/blob/main/SECURITY.md`, desc: "Auth model, RLS conventions, PII handling" },
        { label: "CONTRIBUTING", href: `${REPO}/blob/main/CONTRIBUTING.md`, desc: "Dev setup, conventions, testing approach" },
      ],
    },
    {
      group: "Supabase Dashboard",
      items: [
        { label: "Database → Tables", href: `${SUPABASE_DASH}/editor`, desc: "Browse and query tables" },
        { label: "Database → Migrations", href: `${SUPABASE_DASH}/database/migrations`, desc: "Applied migration history" },
        { label: "Edge Functions", href: `${SUPABASE_DASH}/functions`, desc: "Deploy status and invocation logs" },
        { label: "Auth → Users", href: `${SUPABASE_DASH}/auth/users`, desc: "Auth user management" },
        { label: "Auth → Configuration", href: `${SUPABASE_DASH}/auth/configuration`, desc: "Site URL, providers, email templates" },
        { label: "Storage", href: `${SUPABASE_DASH}/storage/buckets`, desc: "Bill capture images and other stored files" },
        { label: "Logs → Edge Functions", href: `${SUPABASE_DASH}/logs/edge-logs`, desc: "Live function invocation and error logs" },
        { label: "SQL Editor", href: `${SUPABASE_DASH}/sql/new`, desc: "Run ad-hoc queries" },
      ],
    },
    {
      group: "GitHub",
      items: [
        { label: "Repository", href: REPO, desc: "Source code" },
        { label: "Actions (CI/CD)", href: `${REPO}/actions`, desc: "Build and deploy status" },
        { label: "Ingest workflow", href: `${REPO}/actions/workflows/ingest-parcels.yml`, desc: "Manual parcel ingest trigger" },
        { label: "Issues", href: `${REPO}/issues`, desc: "Bug reports and feature requests" },
        { label: "Secrets & Variables", href: `${REPO}/settings/secrets/actions`, desc: "GitHub Actions secrets (NREL_API_KEY, etc.)" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {links.map((group) => (
        <section key={group.group} className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">{group.group}</h2>
          </div>
          <ul className="divide-y">
            {group.items.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-50 group"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800 group-hover:text-amber-700">{item.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                  <span className="text-slate-400 text-xs shrink-0 mt-0.5">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root route
// ---------------------------------------------------------------------------

type Tab = "reps" | "territory" | "system" | "docs";

export function AdminRoute() {
  const { rep } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("reps");
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
  const [editRep, setEditRep] = useState<RepRow | null>(null);
  const [hasRealSession, setHasRealSession] = useState(false);

  useEffect(() => {
    if (rep && rep.role !== "admin") { void navigate("/home"); }
  }, [rep, navigate]);

  useEffect(() => {
    void (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      setHasRealSession(!!session?.access_token);
    })();
  }, [rep]);

  const refresh = useCallback(async () => {
    const [repsRes, reqRes, invRes] = await Promise.all([
      supabase.from("rep").select("id,display_name,role,status,created_at").order("created_at", { ascending: true }),
      supabase.from("rep_access_request").select("id,email,display_name,note,status,created_at").eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("rep_invite").select("id,token,email,role,expires_at,accepted_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setAllReps((repsRes.data as RepRow[] | null) ?? []);
    setRequests((reqRes.data as AccessRequest[] | null) ?? []);
    setInvites((invRes.data as InviteRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (rep?.role === "admin") void refresh();
  }, [rep, refresh]);

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

  const updateRep = async (id: string, patch: { display_name?: string; role?: string; status?: string }) => {
    const update: Record<string, string> = {};
    if (patch.display_name !== undefined) update.display_name = patch.display_name;
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.status !== undefined) update.status = patch.status;
    await supabase.from("rep").update(update).eq("id", id);
    await refresh();
    // Keep modal open so admin can see the saved state
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
    if (!SUPABASE_URL) { setInviteError("Supabase URL not configured."); return; }
    setInviteBusy(true);
    setInviteError(null);
    setInviteUrl(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) { setInviteError("Sign in with a real account (not demo mode) to send invites."); setInviteBusy(false); return; }
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = (await res.json()) as { invite_url?: string; error?: string };
      if (!res.ok || !json.invite_url) {
        setInviteError(json.error ?? `Server returned ${res.status}`);
      } else {
        setInviteUrl(json.invite_url);
        setInviteEmail("");
        await refresh();
      }
    } catch (err) {
      setInviteError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setInviteBusy(false);
  };

  const revokeInvite = async (id: string) => {
    await supabase.from("rep_invite").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    await refresh();
  };

  if (!rep || rep.role !== "admin") return null;

  const totalPending = requests.length + allReps.filter((r) => r.status === "pending").length;

  const TABS: { id: Tab; label: string }[] = [
    { id: "reps", label: "Reps" },
    { id: "territory", label: "Territory" },
    { id: "system", label: "System" },
    { id: "docs", label: "Docs" },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
      <EditRepModal rep={editRep} onClose={() => setEditRep(null)} onSave={updateRep} />

      <header className="border-b bg-white px-4 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-0.5">System management, territory, and monitoring</p>
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

      {/* Tab bar */}
      <div className="border-b bg-white px-4 shrink-0">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-amber-500 text-amber-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {t.label}
              {t.id === "reps" && totalPending > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">{totalPending}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {tab === "reps" && (
          <RepsTab
            allReps={allReps} requests={requests} invites={invites}
            loading={loading} busy={busy}
            inviteEmail={inviteEmail} inviteRole={inviteRole}
            inviteBusy={inviteBusy} inviteError={inviteError} inviteUrl={inviteUrl}
            nowMs={nowMs} hasRealSession={hasRealSession}
            setInviteEmail={setInviteEmail} setInviteRole={setInviteRole}
            setRepStatus={(id, s) => void setRepStatus(id, s)}
            setRepRole={(id, r) => void setRepRole(id, r)}
            decideRequest={(id, d) => void decideRequest(id, d)}
            createInvite={(e) => void createInvite(e)}
            revokeInvite={(id) => void revokeInvite(id)}
            onEditRep={setEditRep}
          />
        )}
        {tab === "territory" && <TerritoryTab />}
        {tab === "system" && <SystemTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}
