import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";
import { getRoute, type RouteEntry } from "@/lib/route.js";

interface Weather {
  temp_f: number;
  short_forecast: string;
  wind_mph: number;
  wind_dir: string;
  high_f: number;
  low_f: number;
  precip_chance_pct: number;
  sunrise: string;
  sunset: string;
}

interface AreaStats {
  owner_occupied_pct: number | null;
  median_household_income_usd: number | null;
  median_home_value_usd: number | null;
  utility_rate_kwh_usd: number | null;
  solar_permits_30d: number;
}

interface CallbackItem {
  parcel_id: string;
  address: string;
  occurred_at: string;
  days_ago: number;
}

interface CalDay {
  date: Date;
  label: string;
  isToday: boolean;
  callbackCount: number;
}

function sunsetCountdown(sunsetStr: string | undefined): string {
  if (!sunsetStr) return "";
  const sunset = new Date(sunsetStr);
  const now = new Date();
  const diffMs = sunset.getTime() - now.getTime();
  if (diffMs <= 0) return "Sun has set";
  const hrs = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return hrs > 0 ? `${hrs}h ${mins}m of daylight left` : `${mins}m of daylight left`;
}

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function buildCalWeek(callbackDates: string[]): CalDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: CalDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = callbackDates.filter((s) => s.startsWith(dateStr)).length;
    days.push({
      date: d,
      label: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
      isToday: i === 0,
      callbackCount: count,
    });
  }
  return days;
}

export function TodayRoute() {
  const { rep } = useAuth();
  const navigate = useNavigate();

  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [route, setRoute] = useState<RouteEntry[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackItem[]>([]);
  const [areaStats, setAreaStats] = useState<AreaStats | null>(null);
  const [calDays, setCalDays] = useState<CalDay[]>(buildCalWeek([]));
  const [doorsToday, setDoorsToday] = useState(0);
  const [doorsWeek, setDoorsWeek] = useState(0);
  const [showPitches, setShowPitches] = useState(false);

  // Route from localStorage — refresh when tab becomes visible
  useEffect(() => {
    const refresh = () => setRoute(getRoute());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setGeo({ lat: p.coords.latitude, lon: p.coords.longitude }),
      undefined,
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Weather
  useEffect(() => {
    if (!geo) return;
    let cancelled = false;
    supabase.functions
      .invoke("weather-now", { body: { lat: geo.lat, lon: geo.lon } })
      .then(({ data }) => {
        if (!cancelled && data) setWeather(data as Weather);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [geo]);

  // Door stats (today + week)
  useEffect(() => {
    if (!rep?.id) return;
    const repId = rep.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    Promise.all([
      supabase.from("door_event").select("id", { count: "exact", head: true })
        .eq("rep_id", repId).gte("occurred_at", todayStart.toISOString()),
      supabase.from("door_event").select("id", { count: "exact", head: true })
        .eq("rep_id", repId).gte("occurred_at", weekStart.toISOString()),
    ]).then(([t, w]) => {
      setDoorsToday(t.count ?? 0);
      setDoorsWeek(w.count ?? 0);
    });
  }, [rep?.id]);

  // Callbacks from door_events (outcome='callback' last 30d)
  useEffect(() => {
    if (!rep?.id) return;
    let cancelled = false;
    void (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("door_event")
        .select("parcel_id, occurred_at, parcel:parcel_id(address_line1)")
        .eq("rep_id", rep!.id)
        .eq("outcome", "callback")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(10);
      if (cancelled || !Array.isArray(data)) return;
      const items: CallbackItem[] = data.map((r) => {
        const raw = r as unknown as {
          parcel_id: string;
          occurred_at: string;
          parcel: { address_line1: string } | null;
        };
        const daysAgo = Math.round(
          (Date.now() - new Date(raw.occurred_at).getTime()) / 86_400_000,
        );
        return {
          parcel_id: raw.parcel_id,
          address: raw.parcel?.address_line1 ?? raw.parcel_id,
          occurred_at: raw.occurred_at,
          days_ago: daysAgo,
        };
      });
      setCallbacks(items);
      setCalDays(buildCalWeek(data.map((r) => (r as { occurred_at: string }).occurred_at)));
    })();
    return () => { cancelled = true; };
  }, [rep?.id]);

  // Area Intelligence — Census + EIA for Scott County VA
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [censusRes, rateRes, triggerRes] = await Promise.all([
        supabase.functions.invoke("census-fetch", {
          body: { state_fips: "51", county_fips: "169" },
        }),
        supabase
          .from("utility_rate_observation")
          .select("rate_kwh_usd, period")
          .eq("state", "VA")
          .eq("sector", "RES")
          .is("utility_id", null)
          .order("period", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("trigger_event")
          .select("id", { count: "exact", head: true })
          .gte("fired_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);
      if (cancelled) return;
      const c = censusRes.data as {
        owner_occupied_pct: number | null;
        median_household_income_usd: number | null;
        median_home_value_usd: number | null;
      } | null;
      const rate = rateRes.data as { rate_kwh_usd: number } | null;
      setAreaStats({
        owner_occupied_pct: c?.owner_occupied_pct ?? null,
        median_household_income_usd: c?.median_household_income_usd ?? null,
        median_home_value_usd: c?.median_home_value_usd ?? null,
        utility_rate_kwh_usd: rate?.rate_kwh_usd ?? null,
        solar_permits_30d: triggerRes.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-50">

      {/* ── WEATHER STRIP ── */}
      <div className="bg-amber-500 px-4 py-3 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">{today}</span>
          {(doorsToday > 0 || doorsWeek > 0) && (
            <span className="text-xs opacity-90">
              {doorsToday} doors today · {doorsWeek} this week
            </span>
          )}
        </div>
        {weather ? (
          <>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{weather.temp_f}°F</span>
              <span className="text-sm opacity-90">{weather.short_forecast}</span>
            </div>
            <div className="mt-0.5 text-xs opacity-80">
              High {weather.high_f}° · Low {weather.low_f}° · Wind {weather.wind_mph} mph{" "}
              {weather.wind_dir} · Precip {weather.precip_chance_pct}%
              {weather.sunset ? <> · {sunsetCountdown(weather.sunset)}</> : null}
            </div>
          </>
        ) : !geo ? (
          <div className="mt-1 text-sm opacity-75">Allow location for weather</div>
        ) : (
          <div className="mt-1 text-sm opacity-75">Weather unavailable</div>
        )}
      </div>

      <div className="flex-1 space-y-3 p-4">

        {/* ── TODAY'S ROUTE ── */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">
              Today's Route
            </span>
            <span className="text-xs text-slate-500">
              {route.length} {route.length === 1 ? "house" : "houses"} queued
            </span>
          </div>
          {route.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-slate-500">No route planned yet.</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Open the map, tap any property, and hit "Add to route."
              </p>
              <button
                type="button"
                onClick={() => navigate("/territory")}
                className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600"
              >
                Open map →
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {route.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={[
                      "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                      r.existing
                        ? "bg-slate-400"
                        : r.score >= 80
                          ? "bg-red-500"
                          : r.score >= 60
                            ? "bg-orange-400"
                            : r.score >= 40
                              ? "bg-yellow-400"
                              : "bg-amber-200",
                    ].join(" ")}
                  />
                  <span className="flex-1 truncate text-slate-800">{r.address}</span>
                  {r.score >= 0 && (
                    <span className="shrink-0 text-xs font-semibold text-slate-500">
                      {r.score}
                    </span>
                  )}
                </div>
              ))}
              {route.length > 3 && (
                <div className="px-4 py-2 text-xs text-slate-400">
                  +{route.length - 3} more
                </div>
              )}
              <div className="px-4 py-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/walk")}
                  className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600"
                >
                  ▶ Start route
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/territory")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── PLANNING / CALLBACKS ── */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">Planning</span>
            {callbacks.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {callbacks.length} callback{callbacks.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {callbacks.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">
              <p>No callbacks logged yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                When you knock a door and they want you to come back, log a
                "Callback" outcome — it will appear here as a follow-up.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {callbacks.map((cb) => (
                <li key={`${cb.parcel_id}-${cb.occurred_at}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {cb.address}
                    </div>
                    <div className="text-xs text-slate-500">
                      Knocked {cb.days_ago === 0 ? "today" : `${cb.days_ago}d ago`} · follow up
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/territory")}
                    className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── CALENDAR PLACEHOLDER ── */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">Calendar</span>
            <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Coming soon
            </span>
          </div>
          <div className="px-4 py-3">
            {/* Mini week strip */}
            <div className="grid grid-cols-7 gap-1 mb-3">
              {calDays.map((d) => (
                <div
                  key={d.date.toISOString()}
                  className={[
                    "flex flex-col items-center rounded-lg py-1.5 text-center",
                    d.isToday ? "bg-amber-500 text-white" : "bg-slate-50 text-slate-600",
                  ].join(" ")}
                >
                  <span className="text-[10px] font-semibold">
                    {d.date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="text-xs font-bold">{d.date.getDate()}</span>
                  {d.callbackCount > 0 && (
                    <span
                      className={[
                        "mt-0.5 h-1.5 w-1.5 rounded-full",
                        d.isToday ? "bg-white" : "bg-blue-400",
                      ].join(" ")}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Blue dot = callback scheduled. Calendar sync will show appointments here.
            </p>
            <button
              type="button"
              disabled
              className="w-full rounded border border-slate-200 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
            >
              Connect Google Calendar (coming soon)
            </button>
          </div>
        </div>

        {/* ── AREA INTELLIGENCE ── */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">
              Area Intelligence · Scott County, VA
            </span>
          </div>
          {areaStats ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
              {areaStats.owner_occupied_pct !== null && (
                <>
                  <dt className="text-slate-500">Owner-occupied</dt>
                  <dd className="font-medium text-slate-800">
                    {areaStats.owner_occupied_pct}%
                  </dd>
                </>
              )}
              {areaStats.median_household_income_usd !== null && (
                <>
                  <dt className="text-slate-500">Median income</dt>
                  <dd className="font-medium text-slate-800">
                    {fmt$(areaStats.median_household_income_usd)}
                  </dd>
                </>
              )}
              {areaStats.median_home_value_usd !== null && (
                <>
                  <dt className="text-slate-500">Median home value</dt>
                  <dd className="font-medium text-slate-800">
                    {fmt$(areaStats.median_home_value_usd)}
                  </dd>
                </>
              )}
              {areaStats.utility_rate_kwh_usd !== null && (
                <>
                  <dt className="text-slate-500">Utility rate</dt>
                  <dd className="font-medium text-slate-800">
                    ${areaStats.utility_rate_kwh_usd.toFixed(4)}/kWh
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Solar permits (30d)</dt>
              <dd className="font-medium text-slate-800">
                {areaStats.solar_permits_30d === 0 ? "None on record" : areaStats.solar_permits_30d}
              </dd>
            </dl>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400 animate-pulse">
              Loading area data…
            </div>
          )}
          <div className="border-t px-4 py-2 text-xs text-slate-400">
            Sources: US Census ACS 5-yr · EIA residential rate · FEMA NFHL
          </div>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate("/walk")}
            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600"
          >
            ▶ Start walking
          </button>
          <button
            type="button"
            onClick={() => navigate("/territory")}
            className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50"
          >
            🗺 Open map
          </button>
        </div>

        {/* ── PITCH SCRIPTS ── */}
        <button
          type="button"
          onClick={() => setShowPitches(true)}
          className="flex w-full items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <span>💬</span>
          <span>Pitch scripts &amp; objection rebuttals</span>
        </button>
      </div>

      {/* Pitch scripts modal */}
      {showPitches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Pitch scripts</h2>
              <button type="button" onClick={() => setShowPitches(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-5 text-sm">
              <PitchCard title="Rate hike pitch" body="Your utility raised rates 9% last year — that's nearly double inflation. A solar system locks in your cost for 25 years. At today's rate, a 7 kW system saves you about $1,400 a year. After the 30% federal tax credit, payback is under 9 years." />
              <PitchCard title="Neighbor just went solar" body="Three of your neighbors within a quarter mile just pulled solar permits this month. They're all locking in today's rate before the next increase. Demand is up — installation slots are filling fast." />
              <PitchCard title="Federal ITC ending" body="The 30% federal Investment Tax Credit is available through 2032, then steps down. There's no cap — that's 30 cents on every dollar of your installed system cost back in your pocket at tax time." />
              <PitchCard title="'I rent' objection" body="That's totally fair — when you're ready to buy or if you know someone who owns their home, this offer stays open. If this is a rental, is the landlord around? Adding solar increases property value and lowers their tenants' bills." />
              <PitchCard title="'Not interested' soft-no" body="No problem at all. Can I ask — is it more the upfront cost, the commitment, or just not the right time? There are $0-down options that start saving from day one. Even if it's not for you, a lot of folks don't know that." />
              <PitchCard title="'I already have solar'" body="That's great — you're already saving. A lot of solar owners we talk to find their system is undersized for what they're using now, especially with EVs or heat pumps added later. Would you like a quick comparison to see if you're leaving savings on the table?" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PitchCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
      <div className="mb-1 font-semibold text-amber-900">{title}</div>
      <div className="text-slate-700 leading-relaxed">{body}</div>
    </div>
  );
}
