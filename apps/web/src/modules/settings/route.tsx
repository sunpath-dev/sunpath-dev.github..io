import { useState } from "react";
import { useAuth } from "@/lib/auth.js";
import { Button } from "@sunpath/ui";
import { PushOptIn } from "./PushOptIn.js";
import { InviteAdminPanel } from "@/components/InviteAdminPanel.js";

const SCREENS = [
  {
    name: "Today",
    desc: "Your daily dashboard. Shows current weather, sunset countdown, and your top 5 highest-scored doors. Use the address search to jump directly to any property on the map.",
  },
  {
    name: "Territory map",
    desc: "Search any address to fly the map there and open its full data sheet. Color-coded dots show knock scores — yellow is cold, orange is warm, red is hot. Tap any dot to open that property's data. Use Satellite toggle for roof visibility.",
  },
  {
    name: "Property detail sheet",
    desc: "Opens when you tap a parcel or search an address. Shows knock score, home facts, solar estimate (kWh/yr, payback years, 25-yr savings), Scott County census context, state incentives, and pitch scripts. Log your knock outcome with the 6 buttons at the bottom.",
  },
  {
    name: "Walk list",
    desc: "All parcels ranked by knock score with GPS walk distance. Tap a row to open the detail sheet. Use the 6 disposition buttons to log outcomes — data syncs automatically when you're back online.",
  },
  {
    name: "Bill capture",
    desc: "Snap a photo, upload a PDF, or enter kWh manually to capture a homeowner's utility bill. Stored by address only — no name, no account number, zero PII.",
  },
];

const DATA_SOURCES = [
  { name: "NOAA NWS", what: "Live weather — temperature, wind, precip, sunrise/sunset" },
  { name: "NREL PVWatts v8", what: "Solar production estimate — kWh/yr, financial payback" },
  { name: "US Census ACS 5-yr", what: "Area context — owner-occupancy, median income, home value" },
  { name: "DSIRE", what: "State solar incentives and rebate programs" },
  { name: "ArcGIS World Geocoding", what: "Address search — full US rural coverage including SW Virginia" },
  { name: "OpenStreetMap", what: "Map tiles and fallback geocoding" },
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
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export function SettingsRoute() {
  const { session, signOut } = useAuth();
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-50">
      <header className="border-b bg-white px-4 py-4">
        <h1 className="text-2xl font-bold">About</h1>
      </header>

      <div className="flex-1 space-y-3 p-4">

        {/* About / How to use */}
        <Section title="How to use Sunpath">
          <div className="space-y-3">
            {SCREENS.map((s) => (
              <div key={s.name}>
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-0.5">{s.name}</div>
                <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Data sources */}
        <Section title="Data sources">
          <ul className="space-y-2">
            {DATA_SOURCES.map((d) => (
              <li key={d.name} className="text-sm">
                <span className="font-medium text-slate-800">{d.name}</span>
                <span className="text-slate-500"> — {d.what}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            All third-party API calls run through Supabase Edge Functions — no keys ever leave the server.
          </p>
        </Section>

        {/* Privacy */}
        <Section title="Privacy & data handling">
          <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
            <p>
              <span className="font-medium text-slate-800">Zero PII stored.</span> Bill capture stores energy usage linked to a property address only — no homeowner name, no account number, no personal data.
            </p>
            <p>
              <span className="font-medium text-slate-800">Knock outcomes</span> are stored by parcel ID and your rep account only. No homeowner-identifiable data is written.
            </p>
            <p>
              <span className="font-medium text-slate-800">Location</span> is used locally for weather and walk distances. It is never stored on the server.
            </p>
            <p>
              <span className="font-medium text-slate-800">Data coverage</span> is currently Scott County, VA (25 seeded parcels). Additional counties will expand as parcel data is ingested.
            </p>
          </div>
        </Section>

        {/* Account */}
        <div className="rounded-xl border bg-white shadow-sm px-4 py-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Account</div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Signed in as</dt>
              <dd className="font-medium text-slate-800">{session?.user?.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Build</dt>
              <dd className="font-mono text-xs text-slate-500">{import.meta.env.MODE} · sunpath</dd>
            </div>
          </dl>
        </div>

        <div>
          <PushOptIn />
        </div>
        <InviteAdminPanel />

        <div className="pt-2">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
