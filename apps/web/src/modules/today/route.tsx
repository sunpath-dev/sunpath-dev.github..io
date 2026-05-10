import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";

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

interface TopDoor {
  id: string;
  address_line1: string;
  city: string;
  knock_score: number;
  trigger_reason: string | null;
}

interface DoorStats {
  today: number;
  week: number;
}

function scoreColor(s: number) {
  if (s >= 80) return "bg-red-500";
  if (s >= 60) return "bg-orange-400";
  if (s >= 40) return "bg-yellow-400";
  return "bg-green-500";
}

function ScoreDot({ score }: { score: number }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${scoreColor(score)}`}
    />
  );
}

function sunsetCountdown(sunsetStr: string | undefined): string {
  if (!sunsetStr) return "";
  const sunset = new Date(sunsetStr);
  const now = new Date();
  const diffMs = sunset.getTime() - now.getTime();
  if (diffMs <= 0) return "Sun has set";
  const hrs = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return hrs > 0 ? `${hrs}h ${mins}m walk left` : `${mins}m walk left`;
}

export function TodayRoute() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [topDoors, setTopDoors] = useState<TopDoor[]>([]);
  const [stats, setStats] = useState<DoorStats>({ today: 0, week: 0 });
  const [showPitches, setShowPitches] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setGeo({ lat: p.coords.latitude, lon: p.coords.longitude }),
      undefined,
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!geo) return;
    setLoadingWeather(true);
    supabase.functions
      .invoke("weather-now", { body: { lat: geo.lat, lon: geo.lon } })
      .then(({ data }) => {
        if (data) setWeather(data as Weather);
      })
      .catch(() => {})
      .finally(() => setLoadingWeather(false));
  }, [geo]);

  useEffect(() => {
    supabase
      .from("parcel")
      .select("id, address_line1, city, knock_score")
      .order("knock_score", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!data) return;
        setTopDoors(
          data.map((p) => ({
            id: p.id as string,
            address_line1: p.address_line1 as string,
            city: p.city as string,
            knock_score: (p.knock_score as number | null) ?? 0,
            trigger_reason: null,
          })),
        );
      });
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    const repId = session.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    Promise.all([
      supabase
        .from("door_event")
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .gte("occurred_at", todayStart.toISOString()),
      supabase
        .from("door_event")
        .select("id", { count: "exact", head: true })
        .eq("rep_id", repId)
        .gte("occurred_at", weekStart.toISOString()),
    ]).then(([todayRes, weekRes]) => {
      setStats({
        today: todayRes.count ?? 0,
        week: weekRes.count ?? 0,
      });
    });
  }, [session]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-50">
      {/* Weather strip */}
      <div className="bg-amber-500 px-4 py-3 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">{today}</span>
          {stats.today > 0 && (
            <span className="text-xs opacity-90">
              {stats.today} doors today · {stats.week} this week
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
              High {weather.high_f}° · Low {weather.low_f}° · Wind{" "}
              {weather.wind_mph} mph {weather.wind_dir} · Precip{" "}
              {weather.precip_chance_pct}%
              {weather.sunset ? (
                <> · {sunsetCountdown(weather.sunset)}</>
              ) : null}
            </div>
          </>
        ) : loadingWeather ? (
          <div className="mt-1 text-sm opacity-75">Fetching weather…</div>
        ) : !geo ? (
          <div className="mt-1 text-sm opacity-75">
            Allow location to see weather
          </div>
        ) : (
          <div className="mt-1 text-sm opacity-75">Weather unavailable</div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Address search shortcut */}
        <button
          type="button"
          onClick={() => navigate("/territory")}
          className="flex w-full items-center gap-2 rounded-xl border bg-white px-4 py-3 text-left text-sm text-slate-500 shadow-sm"
        >
          <svg
            className="h-4 w-4 shrink-0 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
            />
          </svg>
          Search an address…
        </button>

        {/* Forecast */}
        {weather && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Forecast
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500">High</span>{" "}
                <span className="font-medium">{weather.high_f}°</span>
              </div>
              <div>
                <span className="text-slate-500">Low</span>{" "}
                <span className="font-medium">{weather.low_f}°</span>
              </div>
              <div>
                <span className="text-slate-500">Precip</span>{" "}
                <span className="font-medium">{weather.precip_chance_pct}%</span>
              </div>
              <div>
                <span className="text-slate-500">Wind</span>{" "}
                <span className="font-medium">
                  {weather.wind_mph} mph {weather.wind_dir}
                </span>
              </div>
              {weather.sunrise && (
                <div>
                  <span className="text-slate-500">Sunrise</span>{" "}
                  <span className="font-medium">
                    {new Date(weather.sunrise).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              {weather.sunset && (
                <div>
                  <span className="text-slate-500">Sunset</span>{" "}
                  <span className="font-medium">
                    {new Date(weather.sunset).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top doors to revisit */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-slate-800">
              Top Doors to Revisit
            </span>
            <button
              type="button"
              onClick={() => navigate("/walk")}
              className="text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              See all →
            </button>
          </div>
          {topDoors.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No territory data yet.{" "}
              <button
                type="button"
                onClick={() => navigate("/territory")}
                className="text-amber-600 underline underline-offset-2"
              >
                Open the map
              </button>{" "}
              to load parcels.
            </div>
          ) : (
            <ul className="divide-y">
              {topDoors.map((d) => (
                <li
                  key={d.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
                  onClick={() => navigate("/walk")}
                >
                  <ScoreDot score={d.knock_score} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {d.address_line1}
                    </div>
                    {d.trigger_reason && (
                      <div className="text-xs text-slate-500">
                        {d.trigger_reason}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {d.knock_score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate("/walk")}
            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600 active:bg-amber-700"
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

        {/* Pitch scripts button */}
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
              <h2 className="text-lg font-bold text-slate-900">
                Pitch scripts
              </h2>
              <button
                type="button"
                onClick={() => setShowPitches(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-5 text-sm">
              <PitchCard
                title="Rate hike pitch"
                body="Your utility raised rates 9% last year — that's nearly double inflation. A solar system locks in your cost for 25 years. At today's rate, a 7 kW system saves you about $1,400 a year. After the 30% federal tax credit, payback is under 9 years."
              />
              <PitchCard
                title="Neighbor just went solar"
                body="Three of your neighbors within a quarter mile just pulled solar permits this month. They're all locking in today's rate before the next increase. Demand is up — installation slots are filling fast."
              />
              <PitchCard
                title="Federal ITC ending"
                body="The 30% federal Investment Tax Credit is available through 2032, then steps down. There's no cap — that's 30 cents on every dollar of your installed system cost back in your pocket at tax time."
              />
              <PitchCard
                title="'I rent' objection"
                body="That's totally fair — when you're ready to buy or if you know someone who owns their home, this offer stays open. If this is a rental, is the landlord around? Adding solar increases property value and lowers their tenants' bills."
              />
              <PitchCard
                title="'Not interested' soft-no"
                body="No problem at all. Can I ask — is it more the upfront cost, the commitment, or just not the right time? There are $0-down options that start saving from day one. Even if it's not for you, a lot of folks don't know that."
              />
              <PitchCard
                title="'I already have solar' objection"
                body="That's great — you're already saving. A lot of solar owners we talk to find their system is undersized for what they're using now, especially with EVs or heat pumps added later. Would you like a quick comparison to see if you're leaving savings on the table?"
              />
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
