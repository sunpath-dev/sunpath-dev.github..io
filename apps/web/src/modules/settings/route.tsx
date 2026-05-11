import { useState, useEffect } from "react";
import { useAuth, enterAsPoc } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";
import { Button } from "@sunpath/ui";
import { PushOptIn } from "./PushOptIn.js";
import { AdminPanel } from "@/components/AdminPanel.js";

const REPO = "https://github.com/sunpath-dev/sunpath-dev.github.io";
const SUPPORT_EMAIL = "support@sunpath.dev";

const SCREENS = [
  {
    name: "Home",
    desc: "Your daily briefing. Check the weather, see your walkability window, review callbacks due today, and scan Area Intelligence (owner-occupancy, median income, home value, utility rate, recent solar permits) for your current county. Start your walk directly from here.",
  },
  {
    name: "Properties",
    desc: "Browse, search, and manage your properties. Address search geocodes any US address and opens it on the map. Today's Walk Plan shows the stops you've queued for the day, ordered by knock score. Recently Viewed lets you jump back to any property you've opened. Tap a row to open its full data dashboard.",
  },
  {
    name: "Properties — full dashboard (/properties/:id)",
    desc: "Every data point for one property: knock score, owner info, home facts, census area context, energy & solar estimate, roof analysis, financial model, state incentives, neighborhood permits, and your own notes. Sections are drag-to-reorder and collapsible. Log a knock, add to your route, or capture a utility bill from the action bar at the bottom.",
  },
  {
    name: "Map",
    desc: "Score-tinted pins for every parcel in the viewport — amber to red = cold to hot leads. Tap any pin to open the property preview sheet, then tap 'Open full dashboard →' for the full view. Toggle Satellite for roof visibility. Use Filters to narrow by score range, owner-occupancy, or existing solar. Heat Map toggle shows a density overlay.",
  },
  {
    name: "Walk",
    desc: "Active walking session inside Properties. Shows your route stops GPS-ordered by proximity. Tap a stop to see its summary and log an outcome: No Answer, Soft No, Hard No, Callback, Sit, or Sale. Knocks sync automatically when you're back online. 'Open full dashboard →' is one tap away for notes or bill capture.",
  },
  {
    name: "Bill capture",
    desc: "Snap a photo, upload a PDF, or enter kWh manually to link a homeowner's utility bill to a specific property. Stored by address only — no name, no account number, zero PII. Once captured, the financial model on that property's dashboard switches from estimated to actual savings.",
  },
  {
    name: "Build My Solar",
    desc: "Coming soon — aerial roof imagery with panel layout, exact system size, and per-panel production. Will be your selling tool on the porch.",
  },
  {
    name: "Reports",
    desc: "Coming soon — daily and weekly door summaries, conversion funnel by trigger reason, best-time-of-day patterns, note search across all properties, and PDF/text export.",
  },
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
        <span className="text-slate-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export function SettingsRoute() {
  const { session, rep, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pocTaps, setPocTaps] = useState(0);

  useEffect(() => {
    if (!rep?.id || rep.id === "poc-guest") return;
    void supabase.from("rep").select("display_name").eq("id", rep.id).maybeSingle()
      .then(({ data }) => { setDisplayName((data as { display_name?: string | null } | null)?.display_name ?? null); });
  }, [rep?.id]);

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
            <h1 className="text-2xl font-bold text-slate-900">About Sunpath</h1>
            <p className="text-sm text-slate-600 mt-0.5">Field intelligence for solar reps</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-mono bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
              v{__APP_VERSION__}
            </span>
            <span className="text-xs font-mono text-slate-500">{__GIT_HASH__}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 p-4">

        {/* Roadmap + quick links */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-semibold text-slate-800">Roadmap &amp; feedback</div>
          </div>
          <div className="divide-y">
            <a
              href={`${REPO}/blob/main/ROADMAP.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>📋 Features &amp; roadmap</span>
              <span className="text-slate-500 text-xs">↗</span>
            </a>
            <a
              href={`${REPO}/blob/main/CHANGELOG.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>📝 Changelog — what&apos;s new</span>
              <span className="text-slate-500 text-xs">↗</span>
            </a>
            <a
              href={`${REPO}/issues/new?template=feature_request.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>💡 Request a feature</span>
              <span className="text-slate-500 text-xs">↗</span>
            </a>
            <a
              href={`${REPO}/issues/new?template=bug_report.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>🐛 Report a bug</span>
              <span className="text-slate-500 text-xs">↗</span>
            </a>
          </div>
        </div>

        {/* Support */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-semibold text-slate-800">Support</div>
          </div>
          <div className="divide-y">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>✉ Email support</span>
              <span className="text-slate-600 text-xs">{SUPPORT_EMAIL}</span>
            </a>
            <a
              href={`${REPO}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              <span>🔧 GitHub Issues</span>
              <span className="text-slate-500 text-xs">↗</span>
            </a>
          </div>
        </div>

        {/* How to use */}
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

        {/* Data sources */}
        <Section title="Data sources">
          <ul className="space-y-2">
            {DATA_SOURCES.map((d) => (
              <li key={d.name} className="text-sm">
                <span className="font-semibold text-slate-800">{d.name}</span>
                <span className="text-slate-600"> — {d.what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-600">
            All third-party API calls run through Supabase Edge Functions — no API keys ever reach the browser.
          </p>
        </Section>

        {/* Privacy */}
        <Section title="Privacy &amp; data handling">
          <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
            <p>
              <span className="font-semibold text-slate-800">Zero PII stored.</span> Bill capture stores energy usage linked to a property address only — no homeowner name, no account number, no personal data.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Knock outcomes</span> are stored by parcel ID and your rep account only. No homeowner-identifiable data is written.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Location</span> is used locally for weather, walk distances, and area intelligence. It is never stored on the server.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Data coverage</span> is currently Scott County, VA (25 seeded parcels for POC). Additional counties will expand as parcel data is ingested.
            </p>
          </div>
        </Section>

        {/* Account / Profile */}
        <div className="rounded-xl border bg-white shadow-sm px-4 py-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Account</div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Name</dt>
              <dd className="font-medium text-slate-800">
                {rep?.id === "poc-guest" ? "POC Guest" : (displayName ?? "—")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Email</dt>
              <dd className="font-medium text-slate-800">{session?.user?.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-600">Role</dt>
              <dd>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${rep?.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  {rep?.role ?? "rep"}
                </span>
              </dd>
            </div>
            {session?.user?.identities && session.user.identities.length > 0 ? (
              <div className="flex justify-between">
                <dt className="text-slate-600">Sign-in</dt>
                <dd className="text-slate-700 capitalize">
                  {session.user.identities.map((i) => i.provider === "azure" ? "Microsoft" : i.provider).join(", ")}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between items-center">
              <dt className="text-slate-600">Version</dt>
              <dd>
                <button type="button" onClick={handleVersionTap} className="font-mono text-xs text-slate-700 select-none" aria-label="version">
                  v{__APP_VERSION__} · {__GIT_HASH__}
                </button>
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <PushOptIn />
        </div>
        <AdminPanel />

        <div className="pt-2">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
