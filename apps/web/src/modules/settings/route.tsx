import { useState, useEffect } from "react";
import { useAuth, enterAsPoc } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";
import { Button } from "@sunpath/ui";
import { PushOptIn } from "./PushOptIn.js";
import { AdminPanel } from "@/components/AdminPanel.js";

const REPO = "https://github.com/sunpath-dev/sunpath-dev.github.io";
const SUPPORT_EMAIL = "support@sunpath.dev";

const SCREENS = [
  { name: "Home", desc: "Your daily briefing. Check the weather, see your walkability window, review callbacks due today, and scan Area Intelligence (owner-occupancy, median income, home value, utility rate, recent solar permits) for your current county. Start your walk directly from here." },
  { name: "Properties", desc: "Browse, search, and manage your properties. Address search geocodes any US address and opens it on the map. Today's Walk Plan shows the stops you've queued for the day, ordered by knock score. Recently Viewed lets you jump back to any property you've opened. Tap a row to open its full data dashboard." },
  { name: "Properties — full dashboard", desc: "Every data point for one property: knock score, owner info, home facts, census area context, energy & solar estimate, roof analysis, financial model, state incentives, neighborhood permits, and your own notes. Sections are drag-to-reorder and collapsible. Log a knock, add to your route, or capture a utility bill from the action bar at the bottom." },
  { name: "Map", desc: "Score-tinted pins for every parcel in the viewport — amber to red = cold to hot leads. Tap any pin to open the property preview sheet, then tap 'Open full dashboard →' for the full view. Toggle Satellite for roof visibility. Use Filters to narrow by score range, owner-occupancy, or existing solar. Heat Map toggle shows a density overlay." },
  { name: "Walk", desc: "Active walking session inside Properties. Shows your route stops GPS-ordered by proximity. Tap a stop to see its summary and log an outcome: No Answer, Soft No, Hard No, Callback, Sit, or Sale. Knocks sync automatically when you're back online." },
  { name: "Bill capture", desc: "Snap a photo, upload a PDF, or enter kWh manually to link a homeowner's utility bill to a specific property. Stored by address only — zero PII. Once captured, the financial model switches from estimated to actual savings." },
  { name: "Build My Solar", desc: "Coming soon — aerial roof imagery with panel layout, exact system size, and per-panel production." },
  { name: "Reports", desc: "Coming soon — daily and weekly door summaries, conversion funnel, best-time-of-day patterns, note search, and PDF/text export." },
];

const DATA_SOURCES = [
  { name: "NOAA NWS", what: "Live weather — temperature, wind, precip, alerts, sunrise/sunset, hourly forecast" },
  { name: "NREL PVWatts v8", what: "Solar production estimate — kWh/yr per system size" },
  { name: "NREL Solar Resource", what: "Peak sun hours per day by location" },
  { name: "EIA v2", what: "State average utility rate ($/kWh) and year-over-year trend" },
  { name: "US Census ACS 5-yr", what: "Area context — owner-occupancy %, median household income, median home value" },
  { name: "DSIRE", what: "State solar incentives, rebate programs, and net-metering rules" },
  { name: "US Census Geocoder", what: "Reverse geocode GPS → county FIPS for area intelligence" },
  { name: "Nominatim (OpenStreetMap)", what: "Reverse geocode GPS → county name and state" },
  { name: "ArcGIS World Geocoding", what: "Address search — full US coverage including rural SW Virginia" },
  { name: "OpenStreetMap / Overpass", what: "Map tiles, building footprints, parcel geometry" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
      >
        {title}
        <span className="text-slate-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export function SettingsRoute() {
  const { session, rep, signOut } = useAuth();

  // Profile state
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password change state
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Hidden POC backdoor
  const [pocTaps, setPocTaps] = useState(0);

  const isEmailUser = session?.user?.app_metadata?.provider === "email";
  const isPoc = rep?.id === "poc-guest";

  useEffect(() => {
    if (!rep?.id || isPoc) return;
    void supabase.from("rep").select("display_name").eq("id", rep.id).maybeSingle()
      .then(({ data }) => { setDisplayName((data as { display_name?: string | null } | null)?.display_name ?? null); });
  }, [rep?.id, isPoc]);

  const startEditName = () => {
    setNameInput(displayName ?? "");
    setEditingName(true);
  };

  const saveName = async () => {
    if (!rep?.id || isPoc) return;
    setSavingName(true);
    const trimmed = nameInput.trim();
    await supabase.from("rep").update({ display_name: trimmed }).eq("id", rep.id);
    setDisplayName(trimmed);
    setEditingName(false);
    setSavingName(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (newPw.length < 6) { setPwError("Minimum 6 characters."); return; }
    setPwBusy(true);
    setPwError(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess(true);
      setNewPw("");
      setConfirmPw("");
      setShowPwForm(false);
    }
    setPwBusy(false);
  };

  const handleVersionTap = () => {
    const n = pocTaps + 1;
    setPocTaps(n);
    if (n >= 5) enterAsPoc();
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
      <header className="border-b bg-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Profile &amp; Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">Sunpath · Field intelligence for solar reps</p>
          </div>
          <button type="button" onClick={handleVersionTap} className="flex flex-col items-end gap-1 select-none" aria-label="version">
            <span className="text-xs font-mono bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
              v{__APP_VERSION__}
            </span>
            <span className="text-xs font-mono text-slate-400">{__GIT_HASH__}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 p-4">

        {/* Profile card */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Profile</div>
          </div>
          <div className="px-4 py-3 space-y-3">

            {/* Name */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500 shrink-0">Name</span>
              {editingName ? (
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                    className="flex-1 max-w-[180px] rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setEditingName(false); }}
                  />
                  <button type="button" disabled={savingName} onClick={() => void saveName()} className="text-xs font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50">
                    {savingName ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingName(false)} className="text-xs text-slate-400 hover:text-slate-600">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {isPoc ? "POC Guest" : (displayName ?? "—")}
                  </span>
                  {!isPoc && (
                    <button type="button" onClick={startEditName} className="text-xs text-slate-400 hover:text-amber-600">
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Email</span>
              <span className="text-sm font-medium text-slate-800">{session?.user?.email ?? "—"}</span>
            </div>

            {/* Role */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Role</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${rep?.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {rep?.role ?? "rep"}
              </span>
            </div>

            {/* Sign-in method */}
            {session?.user?.identities && session.user.identities.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Sign-in</span>
                <span className="text-sm text-slate-700 capitalize">
                  {session.user.identities.map((i) => i.provider === "azure" ? "Microsoft" : i.provider === "email" ? "Email / password" : i.provider).join(", ")}
                </span>
              </div>
            )}
          </div>

          {/* Change password — email users only */}
          {isEmailUser && !isPoc && (
            <div className="border-t px-4 py-3">
              {pwSuccess && (
                <p className="mb-2 text-xs text-emerald-700 font-medium">Password updated.</p>
              )}
              {!showPwForm ? (
                <button type="button" onClick={() => { setShowPwForm(true); setPwSuccess(false); }} className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                  Change password
                </button>
              ) : (
                <form onSubmit={(e) => void changePassword(e)} className="space-y-2">
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="New password (min 6 characters)"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {pwError && <p className="text-xs text-red-700">{pwError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={pwBusy} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                      {pwBusy ? "Saving…" : "Update password"}
                    </button>
                    <button type="button" onClick={() => { setShowPwForm(false); setPwError(null); }} className="text-xs text-slate-500 hover:text-slate-700">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Push notifications */}
        <div>
          <PushOptIn />
        </div>

        {/* Admin portal — admins only */}
        <AdminPanel />

        {/* Roadmap + quick links */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-semibold text-slate-800">Roadmap &amp; feedback</div>
          </div>
          <div className="divide-y">
            <a href={`${REPO}/blob/main/ROADMAP.md`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>Features &amp; roadmap</span><span className="text-slate-400 text-xs">↗</span>
            </a>
            <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>Changelog — what&apos;s new</span><span className="text-slate-400 text-xs">↗</span>
            </a>
            <a href={`${REPO}/issues/new?template=feature_request.yml`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>Request a feature</span><span className="text-slate-400 text-xs">↗</span>
            </a>
            <a href={`${REPO}/issues/new?template=bug_report.yml`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>Report a bug</span><span className="text-slate-400 text-xs">↗</span>
            </a>
          </div>
        </div>

        {/* Support */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-semibold text-slate-800">Support</div>
          </div>
          <div className="divide-y">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>Email support</span><span className="text-slate-500 text-xs">{SUPPORT_EMAIL}</span>
            </a>
            <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span>GitHub Issues</span><span className="text-slate-400 text-xs">↗</span>
            </a>
          </div>
        </div>

        <Section title="How to use Sunpath">
          <div className="space-y-4">
            {SCREENS.map((s) => (
              <div key={s.name}>
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-0.5">{s.name}</div>
                <p className="text-sm text-slate-700 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Data sources">
          <ul className="space-y-2">
            {DATA_SOURCES.map((d) => (
              <li key={d.name} className="text-sm">
                <span className="font-semibold text-slate-800">{d.name}</span>
                <span className="text-slate-600"> — {d.what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-600">All third-party API calls run through Supabase Edge Functions — no API keys ever reach the browser.</p>
        </Section>

        <Section title="Privacy &amp; data handling">
          <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
            <p><span className="font-semibold text-slate-800">Zero PII stored.</span> Bill capture stores energy usage linked to a property address only — no homeowner name, no account number, no personal data.</p>
            <p><span className="font-semibold text-slate-800">Knock outcomes</span> are stored by parcel ID and your rep account only.</p>
            <p><span className="font-semibold text-slate-800">Location</span> is used locally for weather, walk distances, and area intelligence. Never stored on the server.</p>
          </div>
        </Section>

        <div className="pt-2 pb-4">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

      </div>
    </div>
  );
}
