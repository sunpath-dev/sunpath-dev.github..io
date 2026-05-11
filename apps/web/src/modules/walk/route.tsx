import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { getRoute, removeFromRoute, clearRoute, type RouteEntry } from "@/lib/route.js";
import { recordDoorEvent, useRecentEvents, useUnsyncedCount } from "./repo.js";
import { useWalkDayForecast } from "./useWalkDayForecast.js";

type OutcomeValue = "no_answer" | "soft_no" | "hard_no" | "callback" | "sit" | "sale";

const OUTCOMES: { value: OutcomeValue; label: string }[] = [
  { value: "no_answer", label: "No Answer" },
  { value: "soft_no", label: "Soft No" },
  { value: "hard_no", label: "Hard No" },
  { value: "callback", label: "Callback" },
  { value: "sit", label: "Sit" },
  { value: "sale", label: "Sale" },
];

const OUTCOME_STYLES: Record<OutcomeValue, string> = {
  no_answer: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  soft_no:   "bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
  hard_no:   "bg-red-50 text-red-800 hover:bg-red-100",
  callback:  "bg-blue-100 text-blue-800 hover:bg-blue-200",
  sit:       "bg-violet-100 text-violet-800 hover:bg-violet-200",
  sale:      "bg-emerald-500 text-white hover:bg-emerald-600",
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(
  geo: { lat: number; lon: number } | null,
  entry: RouteEntry,
): string | null {
  if (!geo) return null;
  const km = haversineKm(geo.lat, geo.lon, entry.lat, entry.lon);
  const mins = Math.round((km / 5) * 60);
  return mins < 1 ? "<1 min walk" : `${mins} min walk`;
}

function sortByDistance(entries: RouteEntry[], geo: { lat: number; lon: number } | null): RouteEntry[] {
  if (!geo) return entries;
  return [...entries].sort((a, b) => {
    const da = haversineKm(geo.lat, geo.lon, a.lat, a.lon);
    const db = haversineKm(geo.lat, geo.lon, b.lat, b.lon);
    return da - db;
  });
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-red-500" :
    score >= 60 ? "bg-orange-400" :
    score >= 40 ? "bg-yellow-400" : "bg-amber-200";
  return <span className={`inline-block h-3 w-3 rounded-full ${color}`} />;
}

export function WalkRoute() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const events = useRecentEvents(10);
  const unsynced = useUnsyncedCount();

  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const forecast = useWalkDayForecast(geo);
  const [route, setRoute] = useState<RouteEntry[]>(() => getRoute());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [knockedIds, setKnockedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const refreshRoute = useCallback(() => {
    setRoute(getRoute());
  }, []);

  useEffect(() => {
    window.addEventListener("focus", refreshRoute);
    return () => window.removeEventListener("focus", refreshRoute);
  }, [refreshRoute]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      undefined,
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const sorted = sortByDistance(route, geo);
  const selected = sorted.find((r) => r.id === selectedId) ?? null;

  async function tap(outcome: OutcomeValue) {
    if (!session || !selected) return;
    setRecording(true);
    try {
      await recordDoorEvent({
        parcel_id: selected.id.startsWith("geo:") ? selected.id : selected.id,
        rep_id: session.user.id,
        outcome,
        geo: geo ?? undefined,
      });
      setKnockedIds((prev) => new Set([...prev, selected.id]));
      // Advance to next unworked entry
      const nextEntry = sorted.find((r) => !knockedIds.has(r.id) && r.id !== selected.id);
      setSelectedId(nextEntry?.id ?? null);
    } finally {
      setRecording(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });

  const subNav = (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-slate-100 px-3 py-1.5">
      {[
        { icon: "🔍", label: "Search", to: "/properties" },
        { icon: "🗺", label: "Map", to: "/territory" },
        { icon: "🚶", label: "Walk", to: "/properties/walk", active: true },
        { icon: "📝", label: "Notes", to: "/properties/notes" },
      ].map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => navigate(item.to)}
          className={[
            "flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium",
            item.active
              ? "bg-amber-500 text-white"
              : "text-slate-600 hover:bg-slate-200",
          ].join(" ")}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
      <button
        type="button"
        disabled
        className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-400 cursor-not-allowed"
      >
        <span>📊</span>
        <span>Stats</span>
      </button>
    </div>
  );

  // Empty state
  if (route.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {subNav}
        <header className="border-b bg-white px-4 py-3">
          <h1 className="text-lg font-bold">Today's Route · {today}</h1>
          {forecast.data ? (
            <p className="text-xs text-slate-500 mt-0.5">
              {forecast.data.short_forecast} · {forecast.data.high_f}°/{forecast.data.low_f}° ·{" "}
              walkability {forecast.data.walkability}
            </p>
          ) : null}
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">🗺</div>
          <h2 className="text-lg font-semibold text-slate-800">No route planned yet</h2>
          <p className="text-sm text-slate-500 max-w-xs">
            Open the map, tap any property to view its data, then tap{" "}
            <strong>"+ Add to today's route"</strong> to build your walk list.
          </p>
          <button
            type="button"
            onClick={() => navigate("/territory")}
            className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-amber-600"
          >
            Open map to plan route
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            ← Back to Today
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {subNav}
      <header className="border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight">Today's Route · {today}</h1>
            {forecast.data ? (
              <p className="text-xs text-slate-500 mt-0.5">
                {forecast.data.short_forecast} · {forecast.data.high_f}°/{forecast.data.low_f}° ·{" "}
                walkability {forecast.data.walkability}
                {forecast.data.alerts.length > 0 ? (
                  <span className="ml-2 font-medium text-red-700">⚠ {forecast.data.alerts[0]?.event}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {unsynced !== undefined && unsynced > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {unsynced} pending sync
              </span>
            )}
            <span className="text-xs text-slate-400">
              {knockedIds.size}/{route.length} knocked
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Route list */}
        <div className={`flex flex-col border-r ${selected ? "hidden md:flex md:w-80" : "flex flex-1"}`}>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {sorted.length} stops · GPS-ordered
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/territory")}
                className="text-xs font-medium text-amber-600 hover:text-amber-700"
              >
                + Add
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-xs font-medium text-slate-400 hover:text-red-600"
              >
                Clear
              </button>
            </div>
          </div>

          <ul className="flex-1 divide-y overflow-y-auto">
            {sorted.map((entry) => {
              const knocked = knockedIds.has(entry.id);
              const dist = distanceLabel(geo, entry);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className={[
                      "w-full px-4 py-3 text-left transition-colors",
                      selectedId === entry.id ? "bg-amber-50" : "hover:bg-slate-50",
                      knocked ? "opacity-50" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      {knocked ? (
                        <span className="text-emerald-600 text-sm">✓</span>
                      ) : (
                        <ScoreDot score={entry.score} />
                      )}
                      <span className="flex-1 truncate text-sm font-medium text-slate-800">
                        {entry.address}
                      </span>
                      {entry.score >= 0 && !knocked && (
                        <span className="shrink-0 text-xs font-semibold text-slate-500">
                          {entry.score}
                        </span>
                      )}
                    </div>
                    {dist && (
                      <div className="mt-0.5 pl-5 text-xs text-slate-400">{dist}</div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Recent events */}
          {events && events.length > 0 && (
            <div className="border-t">
              <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recent knocks
              </p>
              <ul className="divide-y">
                {events.slice(0, 5).map((e) => (
                  <li key={e.client_event_id} className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="font-medium capitalize">{e.outcome.replace("_", " ")}</span>
                    <span className="text-slate-400">
                      {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={e.synced ? "text-emerald-600" : "text-amber-600"}>
                      {e.synced ? "synced" : "pending"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Knock panel */}
        {selected && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-2 text-xs text-blue-600 hover:underline md:hidden"
              >
                ← Back to list
              </button>
              <div className="flex items-start gap-2">
                <ScoreDot score={selected.score} />
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selected.address}</h2>
                  <div className="mt-1 flex gap-3 text-xs text-slate-500">
                    {selected.score >= 0 && <span>Score: {selected.score}</span>}
                    {distanceLabel(geo, selected) && <span>{distanceLabel(geo, selected)}</span>}
                  </div>
                </div>
              </div>
            </div>

            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Log outcome
            </p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={recording || !session}
                  onClick={() => void tap(o.value)}
                  className={`rounded-lg px-3 py-4 text-sm font-semibold transition-colors disabled:opacity-50 ${OUTCOME_STYLES[o.value]}`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  removeFromRoute(selected.id);
                  refreshRoute();
                  setSelectedId(null);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Remove from route
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear route confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Clear today's route?</h3>
            <p className="mt-1 text-sm text-slate-500">This removes all {route.length} stops. You can rebuild it from the map.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearRoute();
                  refreshRoute();
                  setShowClearConfirm(false);
                  setSelectedId(null);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Clear route
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
