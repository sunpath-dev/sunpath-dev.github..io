import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";
import { useAuth } from "@/lib/auth.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
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
  url: string;
  latencyMs: number | null;
  ok: boolean | null;
  label: string;
}

// ---------------------------------------------------------------------------
// Edge functions deployed (sourced from supabase functions list 2026-05-10)
// ---------------------------------------------------------------------------

const EDGE_FUNCTIONS = [
  "area-intel", "approve-access", "bill-ocr", "callback-submit",
  "doorcard-pdf", "forecast-fetch", "geo-reverse", "homeowner-export",
  "incentives-fetch", "ingest-area-signals", "invite-accept", "invite-create",
  "pvwatts-fetch", "push-send", "rate-watch-eia", "request-access",
  "rewarm-derive", "score-parcels", "solar-rooftop", "weather-now",
  "weather-now",
].filter((v, i, a) => a.indexOf(v) === i).sort();

// Known county FIPS → name mapping
const COUNTY_NAMES: Record<string, string> = {
  "51169": "Scott County",
  "51167": "Russell County",
  "51195": "Washington County",
  "51185": "Tazewell County",
  "51027": "Buchanan County",
  "51105": "Lee County",
};

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
// Tab components
// ---------------------------------------------------------------------------

function RepsTab({
  allReps, requests, invites, loading, busy, inviteEmail, inviteRole,
  inviteBusy, inviteError, inviteUrl, nowMs,
  setInviteEmail, setInviteRole,
  setRepStatus, setRepRole, decideRequest, createInvite, revokeInvite,
}: {
  allReps: RepRow[]; requests: AccessRequest[]; invites: InviteRow[];
  loading: boolean; busy: string | null; inviteEmail: string; inviteRole: "rep" | "admin";
  inviteBusy: boolean; inviteError: string | null; inviteUrl: string | null; nowMs: number;
  setInviteEmail: (v: string) => void; setInviteRole: (v: "rep" | "admin") => void;
  setRepStatus: (id: string, s: string) => void; setRepRole: (id: string, r: string) => void;
  decideRequest: (id: string, d: "approve" | "reject") => void;
  createInvite: (e: React.FormEvent) => void; revokeInvite: (id: string) => void;
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
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{r.display_name ?? "(no name)"}</div>
                  <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                </div>
                <Badge role={r.role} />
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "active")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Approve</button>
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
                <button type="button" disabled={busy === r.id + "-role"} onClick={() => setRepRole(r.id, r.role === "admin" ? "rep" : "admin")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {r.role === "admin" ? "Make rep" : "Make admin"}
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "suspended")} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Suspend</button>
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
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-700">{r.display_name ?? "(no name)"}</div>
                  <div className="text-xs text-slate-400">{ago(r.created_at)}</div>
                </div>
                <Badge role={r.role} />
                <button type="button" disabled={busy === r.id} onClick={() => setRepStatus(r.id, "active")} className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Reactivate</button>
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
          <form onSubmit={(e) => createInvite(e)} className="flex flex-col gap-2 sm:flex-row">
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

function TerritoryTab() {
  const [counties, setCounties] = useState<CountyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from("admin_county_summary").select("*");
      setCounties((data as CountyRow[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const triggerRescore = async (stateFips: string, countyFips: string) => {
    if (!SUPABASE_URL) return;
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
    setRescoreMsg(res.ok ? `Re-score triggered for ${stateFips}-${countyFips}` : `Failed (${res.status})`);
    setRescoring(null);
  };

  const countyName = (state: string, fips: string) =>
    COUNTY_NAMES[`${state === "VA" ? "51" : "?"}${fips}`] ?? `County ${fips}`;

  return (
    <div className="space-y-4">
      {rescoreMsg && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{rescoreMsg}</div>
      )}

      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Loaded counties</h2>
          <span className="text-xs text-slate-500">{counties.length} {counties.length === 1 ? "county" : "counties"}</span>
        </div>
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : counties.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">No parcel data loaded yet. Run the ingest script to populate counties.</p>
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
                  <th className="px-4 py-2">Last source update</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {counties.map((c) => {
                  const key = `${c.state_fips}-${c.county_fips}`;
                  const name = countyName(c.state, c.county_fips);
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

      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Ingest script reference</h2>
        </div>
        <div className="px-4 py-4 space-y-2 text-sm text-slate-700">
          <p>To load a new county, run the parcel ingest script locally with your Supabase credentials:</p>
          <pre className="rounded-lg bg-slate-900 text-emerald-400 px-4 py-3 text-xs overflow-x-auto whitespace-pre-wrap">
            {`SUPABASE_URL=https://sclisaylpwnffkkyepow.supabase.co \\
SUPABASE_SERVICE_ROLE_KEY=<key> \\
npx tsx scripts/ingest-parcels.ts --county scott-va`}
          </pre>
          <p className="text-xs text-slate-500">Target counties in order: Scott VA → Russell VA → surrounding SW Virginia</p>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SystemTab() {
  const [apiChecks, setApiChecks] = useState<ApiCheck[]>([
    { name: "NOAA NWS", url: "https://api.weather.gov/", latencyMs: null, ok: null, label: "Weather API" },
    { name: "NREL PVWatts", url: "", latencyMs: null, ok: null, label: "Via edge fn" },
    { name: "EIA v2", url: "", latencyMs: null, ok: null, label: "Via edge fn" },
    { name: "US Census", url: "", latencyMs: null, ok: null, label: "Via edge fn" },
    { name: "DSIRE", url: "", latencyMs: null, ok: null, label: "Via edge fn" },
  ]);
  const [checking, setChecking] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setAuditLoading(true);
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,event,target_table,ip_addr,occurred_at,rep_id")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) {
        setAuditError(error.code === "42501" ? "Run migration 0030 to enable admin audit log access." : error.message);
      } else {
        setAuditLog((data as AuditRow[] | null) ?? []);
      }
      setAuditLoading(false);
    })();
  }, []);

  const runChecks = async () => {
    setChecking(true);
    const updated = await Promise.all(
      apiChecks.map(async (check) => {
        if (!check.url) return { ...check, ok: null, latencyMs: null };
        const t0 = Date.now();
        try {
          const res = await fetch(check.url, {
            headers: { "User-Agent": "Sunpath/1.0 (admin health check; contact admin@sunpath.dev)" },
            signal: AbortSignal.timeout(8000),
          });
          return { ...check, ok: res.ok, latencyMs: Date.now() - t0 };
        } catch {
          return { ...check, ok: false, latencyMs: Date.now() - t0 };
        }
      })
    );
    setApiChecks(updated);
    setChecking(false);
  };

  return (
    <div className="space-y-4">

      {/* Edge functions */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Edge functions</h2>
          <a href={`${SUPABASE_DASH}/functions`} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline">View in Supabase ↗</a>
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
          <p className="mt-3 text-xs text-slate-400">All {EDGE_FUNCTIONS.length} functions deployed as of 2026-05-10. Check Supabase dashboard for live invocation logs.</p>
        </div>
      </section>

      {/* External API health */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">External API connectivity</h2>
          <button type="button" disabled={checking} onClick={() => void runChecks()} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {checking ? "Checking…" : "Run checks"}
          </button>
        </div>
        <ul className="divide-y">
          {apiChecks.map((c) => (
            <li key={c.name} className="flex items-center gap-3 px-4 py-3">
              <StatusDot ok={c.ok} />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-400">{c.label}</div>
              </div>
              {c.latencyMs !== null && (
                <span className="text-xs tabular-nums text-slate-500">{c.latencyMs}ms</span>
              )}
              {c.ok === null && <span className="text-xs text-slate-400">—</span>}
              {c.ok === false && c.latencyMs !== null && <span className="text-xs text-red-600 font-medium">Failed</span>}
              {c.ok === true && <span className="text-xs text-emerald-600 font-medium">OK</span>}
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t bg-slate-50">
          <p className="text-xs text-slate-500">NREL, EIA, Census, and DSIRE are called via edge functions — direct browser checks not applicable. Use Supabase function logs to diagnose those.</p>
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Audit log</h2>
          <span className="text-xs text-slate-500">Last 50 events</span>
        </div>
        {auditLoading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : auditError ? (
          <div className="px-4 py-4">
            <p className="text-sm text-amber-700">{auditError}</p>
          </div>
        ) : auditLog.length === 0 ? (
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
                {auditLog.map((e) => (
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

  useEffect(() => {
    if (rep && rep.role !== "admin") { void navigate("/home"); }
  }, [rep, navigate]);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (rep?.role === "admin") void refresh();
  }, [rep?.role, refresh]);

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

  const totalPending = requests.length + allReps.filter((r) => r.status === "pending").length;

  const TABS: { id: Tab; label: string }[] = [
    { id: "reps", label: "Reps" },
    { id: "territory", label: "Territory" },
    { id: "system", label: "System" },
    { id: "docs", label: "Docs" },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
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
            inviteBusy={inviteBusy} inviteError={inviteError} inviteUrl={inviteUrl} nowMs={nowMs}
            setInviteEmail={setInviteEmail} setInviteRole={setInviteRole}
            setRepStatus={(id, s) => void setRepStatus(id, s)}
            setRepRole={(id, r) => void setRepRole(id, r)}
            decideRequest={(id, d) => void decideRequest(id, d)}
            createInvite={(e) => void createInvite(e)}
            revokeInvite={(id) => void revokeInvite(id)}
          />
        )}
        {tab === "territory" && <TerritoryTab />}
        {tab === "system" && <SystemTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}
