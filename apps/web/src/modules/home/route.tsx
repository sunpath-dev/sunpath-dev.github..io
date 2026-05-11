import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";
import { getRoute, type RouteEntry } from "@/lib/route.js";
import { DashboardCard } from "@/components/DashboardCard.js";
import { DashboardCardList } from "@/components/DashboardCardList.js";
import { useDashboardLayout } from "@/hooks/useDashboardLayout.js";

const STORAGE_KEY = "dashboard:home";
const DEFAULT_ORDER = [
  "full-forecast",
  "walk-window",
  "calendar",
  "planning",
  "area-intel",
  "quick-actions",
  "pitch",
];

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
  county: string;
  state: string;
  owner_occupied_pct: number | null;
  median_household_income_usd: number | null;
  median_home_value_usd: number | null;
  utility_rate_kwh_usd: number | null;
  solar_permits_30d: number;
}

interface CallbackItem {
  parcel_id: string;
  address: string;
  days_ago: number;
}

interface CalDay {
  date: Date;
  isToday: boolean;
  callbackCount: number;
}

function parseSunsetDate(sunsetStr: string): Date | null {
  // NWS may return ISO 8601 ("2026-05-10T20:14:00-04:00") or bare time ("20:14")
  if (!sunsetStr) return null;
  if (sunsetStr.includes("T") || sunsetStr.includes("-", 4)) {
    const d = new Date(sunsetStr);
    return isNaN(d.getTime()) ? null : d;
  }
  // Bare time string like "20:14" — combine with today's local date
  const now = new Date();
  const parts = sunsetStr.split(":");
  if (parts.length < 2) return null;
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(parts[0]),
    Number(parts[1]),
    parts[2] ? Number(parts[2]) : 0,
  );
  return isNaN(d.getTime()) ? null : d;
}

function sunsetCountdown(sunsetStr: string | undefined): string {
  if (!sunsetStr) return "";
  const sunset = parseSunsetDate(sunsetStr);
  if (!sunset) return "";
  const diffMs = sunset.getTime() - Date.now();
  // NWS sometimes returns tomorrow's sunset after today's has passed; cap at 16h
  if (diffMs <= 0 || diffMs > 16 * 3_600_000) return "Sun has set";
  const hrs = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return hrs > 0 ? `${hrs}h ${mins}m of daylight left` : `${mins}m of daylight left`;
}

function sunsetTime(sunsetStr: string | undefined): string {
  if (!sunsetStr) return "";
  const sunset = parseSunsetDate(sunsetStr);
  if (!sunset) return "";
  return sunset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
    days.push({ date: d, isToday: i === 0, callbackCount: count });
  }
  return days;
}

// Geo-cache key rounded to ~1km grid
function geoCacheKey(lat: number, lon: number): string {
  return `geo-reverse:${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
}

export function HomeRoute() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { order, collapsed, reorder, toggleCollapsed, resetLayout } =
    useDashboardLayout(STORAGE_KEY, DEFAULT_ORDER);

  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  // Tick increments every 60s so sunsetCountdown recalculates without storing derived string as state
  const [tick, setTick] = useState(0);
  const [route, setRoute] = useState<RouteEntry[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackItem[]>([]);
  const [calDays, setCalDays] = useState<CalDay[]>(buildCalWeek([]));
  const [areaStats, setAreaStats] = useState<AreaStats | null>(null);
  const [areaLabel, setAreaLabel] = useState("Detecting location…");
  const [doorsToday, setDoorsToday] = useState(0);
  const [doorsWeek, setDoorsWeek] = useState(0);
  const [showPitches, setShowPitches] = useState(false);

  // Derived: recomputes whenever weather changes OR tick fires
  const countdown = useMemo(
    () => sunsetCountdown(weather?.sunset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weather?.sunset, tick],
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Route
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
      () => setAreaLabel("Location unavailable"),
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Weather — refetch when GPS changes
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

  // Tick every 60s so countdown stays fresh
  useEffect(() => {
    if (!weather?.sunset) return;
    tickRef.current = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [weather?.sunset]);

  // fetchAreaStats — defined before the geo-reverse effect that calls it
  const fetchAreaStats = useCallback(
    (stateFips: string, countyFips: string, state: string, county: string) => {
      void (async () => {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        // census-fetch requires exactly 2-char state_fips and 3-char county_fips
        const canFetchCensus = stateFips.length === 2 && countyFips.length === 3;
        const [censusRes, rateRes, triggerRes] = await Promise.all([
          canFetchCensus
            ? supabase.functions.invoke("census-fetch", {
                body: { state_fips: stateFips, county_fips: countyFips },
              })
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from("utility_rate_observation")
            .select("rate_kwh_usd")
            .eq("state", state)
            .eq("sector", "RES")
            .is("utility_id", null)
            .order("period", { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from("trigger_event")
            .select("id", { count: "exact", head: true })
            .eq("kind", "neighbor_permit")
            .gte("fired_at", since30d),
        ]);
        const c = censusRes.data as {
          owner_occupied_pct: number | null;
          median_household_income_usd: number | null;
          median_home_value_usd: number | null;
        } | null;
        const rate = rateRes.data as { rate_kwh_usd: number } | null;
        setAreaStats({
          county,
          state,
          owner_occupied_pct: c?.owner_occupied_pct ?? null,
          median_household_income_usd: c?.median_household_income_usd ?? null,
          median_home_value_usd: c?.median_home_value_usd ?? null,
          utility_rate_kwh_usd: rate?.rate_kwh_usd ?? null,
          solar_permits_30d: triggerRes.count ?? 0,
        });
      })();
    },
    [setAreaStats],
  );

  // Geo-reverse (county/state from GPS)
  useEffect(() => {
    if (!geo) return;
    const cacheKey = geoCacheKey(geo.lat, geo.lon);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { county: string; state: string; state_fips: string; county_fips: string };
        // Don't use cached result if county_fips is missing — geo-reverse Census lookup may have
        // timed out previously. Delete stale entry so the next GPS tick retries it.
        if (!parsed.county_fips) {
          localStorage.removeItem(cacheKey);
        } else {
          const label = `${parsed.county}, ${parsed.state}`;
          Promise.resolve().then(() => {
            setAreaLabel(label);
            fetchAreaStats(parsed.state_fips, parsed.county_fips, parsed.state, parsed.county);
          });
          return;
        }
      } catch (_e) {
        void _e;
      }
    }
    let cancelled = false;
    supabase.functions
      .invoke("geo-reverse", { body: { lat: geo.lat, lon: geo.lon } })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const r = data as { county: string; state: string; state_fips: string; county_fips: string };
        // Only cache if we got a complete result (county_fips needed for census-fetch)
        if (r.county_fips) {
          localStorage.setItem(cacheKey, JSON.stringify(r));
        }
        setAreaLabel(`${r.county}, ${r.state}`);
        fetchAreaStats(r.state_fips, r.county_fips, r.state, r.county);
      })
      .catch(() => {
        setAreaLabel("Scott County, VA");
        fetchAreaStats("51", "169", "VA", "Scott County");
      });
    return () => { cancelled = true; };
  }, [geo, fetchAreaStats]);

  // Door stats
  useEffect(() => {
    if (!session?.user.id) return;
    const repId = session.user.id;
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
  }, [session]);

  // Callbacks
  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    void (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("door_event")
        .select("parcel_id, occurred_at, parcel:parcel_id(address_line1)")
        .eq("rep_id", session!.user.id)
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
        return {
          parcel_id: raw.parcel_id,
          address: raw.parcel?.address_line1 ?? raw.parcel_id,
          days_ago: Math.round((Date.now() - new Date(raw.occurred_at).getTime()) / 86_400_000),
        };
      });
      setCallbacks(items);
      setCalDays(buildCalWeek(data.map((r) => (r as { occurred_at: string }).occurred_at)));
    })();
    return () => { cancelled = true; };
  }, [session]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const cardMap: Record<string, React.ReactNode> = {
    "full-forecast": (
      <DashboardCard
        key="full-forecast"
        id="full-forecast"
        title="Today's Forecast"
        collapsed={!!collapsed["full-forecast"]}
        onToggleCollapse={() => toggleCollapsed("full-forecast")}
      >
        {weather ? (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-600">High {weather.high_f}° · Low {weather.low_f}°</span>
              <span className="text-slate-600">Precip {weather.precip_chance_pct}%</span>
            </div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-600">Wind {weather.wind_mph} mph {weather.wind_dir}</span>
              {weather.sunset && <span className="text-slate-600">Sunset {sunsetTime(weather.sunset)}</span>}
            </div>
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {weather.short_forecast}
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-slate-400">{!geo ? "Allow location for forecast" : "Loading forecast…"}</div>
        )}
      </DashboardCard>
    ),

    "walk-window": (
      <DashboardCard
        key="walk-window"
        id="walk-window"
        title="Walk Window"
        collapsed={!!collapsed["walk-window"]}
        onToggleCollapse={() => toggleCollapsed("walk-window")}
      >
        <div className="px-4 py-3">
          {route.length > 0 ? (
            <>
              <p className="text-sm text-slate-700">
                Route: <strong>{route.length} stops</strong>
                {weather ? ` · ${weather.short_forecast}` : ""}
              </p>
              {weather?.sunset && (
                <p className="mt-1 text-xs text-slate-500">
                  Sunset {sunsetTime(weather.sunset)} · {countdown}
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate("/properties/walk")}
                className="mt-3 w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                ▶ Start Walking
              </button>
            </>
          ) : (
            <div className="text-center">
              <p className="text-sm text-slate-500">No route planned yet.</p>
              <p className="mt-0.5 text-xs text-slate-400">Build your route in Properties → Walk Plan.</p>
              <button
                type="button"
                onClick={() => navigate("/properties")}
                className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Go to Properties
              </button>
            </div>
          )}
        </div>
      </DashboardCard>
    ),

    "calendar": (
      <DashboardCard
        key="calendar"
        id="calendar"
        title="Calendar"
        badge="Coming soon"
        collapsed={!!collapsed["calendar"]}
        onToggleCollapse={() => toggleCollapsed("calendar")}
      >
        <div className="px-4 py-3">
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
                  <span className={["mt-0.5 h-1.5 w-1.5 rounded-full", d.isToday ? "bg-white" : "bg-blue-400"].join(" ")} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mb-2">Blue dot = callback scheduled.</p>
          <div className="flex flex-col gap-1.5">
            {(["Connect Google Calendar", "Connect Outlook", "Connect Apple Calendar"] as const).map((label) => (
              <button key={label} type="button" disabled className="w-full rounded border border-slate-200 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed">
                {label} (coming soon)
              </button>
            ))}
          </div>
        </div>
      </DashboardCard>
    ),

    "planning": (
      <DashboardCard
        key="planning"
        id="planning"
        title="Planning"
        badge={callbacks.length > 0 ? callbacks.length : undefined}
        collapsed={!!collapsed["planning"]}
        onToggleCollapse={() => toggleCollapsed("planning")}
      >
        {callbacks.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            <p>No callbacks logged yet.</p>
            <p className="mt-1 text-xs text-slate-400">Log a "Callback" outcome when knocking a door to track follow-ups here.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {callbacks.map((cb) => (
              <li key={`${cb.parcel_id}-${cb.days_ago}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{cb.address}</div>
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
      </DashboardCard>
    ),

    "area-intel": (
      <DashboardCard
        key="area-intel"
        id="area-intel"
        title={`Area Intelligence · ${areaLabel}`}
        collapsed={!!collapsed["area-intel"]}
        onToggleCollapse={() => toggleCollapsed("area-intel")}
      >
        {areaStats ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
              {areaStats.owner_occupied_pct !== null && (
                <><dt className="text-slate-500">Owner-occupied</dt><dd className="font-medium text-slate-800">{areaStats.owner_occupied_pct}%</dd></>
              )}
              {areaStats.median_household_income_usd !== null && (
                <><dt className="text-slate-500">Median income</dt><dd className="font-medium text-slate-800">{fmt$(areaStats.median_household_income_usd)}</dd></>
              )}
              {areaStats.median_home_value_usd !== null && (
                <><dt className="text-slate-500">Median home value</dt><dd className="font-medium text-slate-800">{fmt$(areaStats.median_home_value_usd)}</dd></>
              )}
              {areaStats.utility_rate_kwh_usd !== null && (
                <><dt className="text-slate-500">Utility rate</dt><dd className="font-medium text-slate-800">${areaStats.utility_rate_kwh_usd.toFixed(4)}/kWh</dd></>
              )}
              <dt className="text-slate-500">Solar permits (30d)</dt>
              <dd className="font-medium text-slate-800">{areaStats.solar_permits_30d === 0 ? "None on record" : areaStats.solar_permits_30d}</dd>
            </dl>
            <div className="border-t px-4 py-2 text-xs text-slate-400">Sources: US Census ACS 5-yr · EIA residential rate · trigger events</div>
          </>
        ) : (
          <div className="px-4 py-3 text-sm text-slate-400 animate-pulse">Loading area data…</div>
        )}
      </DashboardCard>
    ),

    "quick-actions": (
      <DashboardCard
        key="quick-actions"
        id="quick-actions"
        title="Quick Actions"
        collapsed={!!collapsed["quick-actions"]}
        onToggleCollapse={() => toggleCollapsed("quick-actions")}
      >
        <div className="grid grid-cols-2 gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/properties/walk")}
            disabled={route.length === 0}
            className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ▶ Start route
          </button>
          <button
            type="button"
            onClick={() => navigate("/territory")}
            className="rounded-lg border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50"
          >
            🗺 Open map
          </button>
        </div>
      </DashboardCard>
    ),

    "pitch": (
      <DashboardCard
        key="pitch"
        id="pitch"
        title="Pitch Scripts"
        collapsed={!!collapsed["pitch"]}
        onToggleCollapse={() => toggleCollapsed("pitch")}
      >
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowPitches(true)}
            className="flex w-full items-center gap-2 rounded-lg border bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
          >
            <span>💬</span>
            <span>Open pitch scripts &amp; objection rebuttals</span>
          </button>
        </div>
      </DashboardCard>
    ),
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">
      {/* Weather strip — non-draggable header */}
      <div className="bg-amber-500 px-4 py-3 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">{today}</span>
          {(doorsToday > 0 || doorsWeek > 0) && (
            <span className="text-xs opacity-90">{doorsToday} doors today · {doorsWeek} this week</span>
          )}
        </div>
        {weather ? (
          <>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{weather.temp_f}°F</span>
              <span className="text-sm opacity-90">{weather.short_forecast}</span>
            </div>
            <div className="mt-0.5 text-xs opacity-80">
              {countdown && <>{countdown} · </>}
              Wind {weather.wind_mph} mph {weather.wind_dir}
            </div>
          </>
        ) : !geo ? (
          <div className="mt-1 text-sm opacity-75">Allow location for weather</div>
        ) : (
          <div className="mt-1 text-sm opacity-75">Loading weather…</div>
        )}
      </div>

      {/* Draggable sections */}
      <div className="flex-1 p-4">
        <DashboardCardList order={order} onReorder={reorder}>
          {order.map((id) => cardMap[id]).filter(Boolean)}
        </DashboardCardList>

        <button
          type="button"
          onClick={resetLayout}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-400 hover:bg-slate-50"
        >
          ↺ Reset layout
        </button>
      </div>

      {/* Pitch scripts modal */}
      {showPitches && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:shadow-2xl max-h-[90vh]">
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
