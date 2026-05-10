import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";
import { recordDoorEvent, useRecentEvents, useUnsyncedCount } from "./repo.js";
import { useWalkDayForecast } from "./useWalkDayForecast.js";

interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

interface Parcel {
  id: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  knock_score: number;
  centroid: GeoPoint | null;
}

type OutcomeValue = "no_answer" | "soft_no" | "hard_no" | "callback" | "sit" | "sale";

interface OutcomeButton {
  value: OutcomeValue;
  label: string;
}

const OUTCOMES: OutcomeButton[] = [
  { value: "no_answer", label: "No Answer" },
  { value: "soft_no", label: "Soft No" },
  { value: "hard_no", label: "Hard No" },
  { value: "callback", label: "Callback" },
  { value: "sit", label: "Sit" },
  { value: "sale", label: "Sale" },
];

const OUTCOME_STYLES: Record<OutcomeValue, string> = {
  no_answer: "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300",
  soft_no: "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300",
  hard_no: "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300",
  callback: "bg-blue-100 text-blue-800 hover:bg-blue-200 active:bg-blue-300",
  sit: "bg-violet-100 text-violet-800 hover:bg-violet-200 active:bg-violet-300",
  sale: "bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700",
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

function walkMinutes(km: number): number {
  return Math.round((km / 5) * 60);
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-red-500"
      : score >= 60
        ? "bg-orange-400"
        : score >= 40
          ? "bg-yellow-400"
          : "bg-green-500";
  return <span className={`inline-block h-3 w-3 rounded-full ${color}`} />;
}

function distanceLabel(
  geo: { lat: number; lon: number } | null,
  centroid: GeoPoint | null,
): string | null {
  if (!geo || !centroid) return null;
  const [lon, lat] = centroid.coordinates;
  if (lon === undefined || lat === undefined) return null;
  const km = haversineKm(geo.lat, geo.lon, lat, lon);
  const mins = walkMinutes(km);
  return mins < 1 ? "<1 min walk" : `${mins} min walk`;
}

export function WalkRoute() {
  const { session } = useAuth();
  const events = useRecentEvents(10);
  const unsynced = useUnsyncedCount();
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const forecast = useWalkDayForecast(geo);

  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      undefined,
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setParcelsLoading(true);
      const { data } = await supabase
        .from("parcel")
        .select("id, address_line1, city, state, postal_code, knock_score, centroid")
        .order("knock_score", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setParcels((data as Parcel[] | null) ?? []);
        setParcelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = selectedIdx !== null ? (parcels[selectedIdx] ?? null) : null;

  async function tap(outcome: OutcomeValue) {
    if (!session || !selected) return;
    setRecording(true);
    try {
      await recordDoorEvent({
        parcel_id: selected.id,
        rep_id: session.user.id,
        outcome,
        geo: geo ?? undefined,
      });
    } finally {
      setRecording(false);
    }
  }

  function advanceNext() {
    if (selectedIdx === null) return;
    const next = selectedIdx + 1;
    if (next < parcels.length) {
      setSelectedIdx(next);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-bold leading-tight">Walk list · {today}</h1>
          {forecast.data ? (
            <p className="text-xs text-slate-500">
              {forecast.data.short_forecast} · {forecast.data.high_f}°/{forecast.data.low_f}° ·{" "}
              {forecast.data.precip_chance_pct}% precip · Wind {forecast.data.wind_mph_max} mph ·{" "}
              walkability {forecast.data.walkability}
            </p>
          ) : forecast.loading ? (
            <p className="text-xs text-slate-400">Loading forecast…</p>
          ) : null}
          {forecast.data && forecast.data.alerts.length > 0 ? (
            <p className="text-xs font-medium text-red-700">
              ⚠ {forecast.data.alerts[0]?.event}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          {unsynced !== undefined && unsynced > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {unsynced} pending
            </span>
          ) : null}
          {geo ? (
            <span className="text-xs text-slate-400">
              {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Locating…</span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden md:flex-row flex-col">
        <div
          className={`flex flex-col border-r ${selected !== null ? "hidden md:flex md:w-80 lg:w-96" : "flex flex-1"}`}
        >
          {parcelsLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Loading parcels…
            </div>
          ) : parcels.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
              No parcels loaded yet — map will populate once territory is ingested.
            </div>
          ) : (
            <ul className="flex-1 divide-y overflow-y-auto">
              {parcels.map((parcel, idx) => {
                const dist = distanceLabel(geo, parcel.centroid);
                const isSelected = selectedIdx === idx;
                return (
                  <li key={parcel.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "bg-blue-50"
                          : "hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ScoreDot score={parcel.knock_score} />
                        <span className="flex-1 truncate text-sm font-medium">
                          {parcel.address_line1}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-slate-600">
                          {parcel.knock_score}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between pl-5">
                        <span className="text-xs text-slate-500">
                          {parcel.city}, {parcel.state} {parcel.postal_code}
                        </span>
                        {dist ? (
                          <span className="text-xs text-slate-400">{dist}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {events && events.length > 0 ? (
            <div className="border-t">
              <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Recent
              </p>
              <ul className="divide-y">
                {events.map((e) => (
                  <li
                    key={e.client_event_id}
                    className="flex items-center justify-between px-4 py-2 text-xs"
                  >
                    <span className="font-medium">{e.outcome}</span>
                    <span className="text-slate-400">
                      {new Date(e.occurred_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={
                        e.synced ? "text-emerald-600" : "text-amber-600"
                      }
                    >
                      {e.synced
                        ? "synced"
                        : `pending${e.attempts ? ` (${e.attempts})` : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {selected !== null ? (
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedIdx(null)}
                  className="mb-2 text-xs text-blue-600 hover:underline md:hidden"
                >
                  ← Back to list
                </button>
                <div className="flex items-center gap-2">
                  <ScoreDot score={selected.knock_score} />
                  <h2 className="text-xl font-bold">{selected.address_line1}</h2>
                </div>
                <p className="text-sm text-slate-500">
                  {selected.city}, {selected.state} {selected.postal_code}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>Score: {selected.knock_score}</span>
                  {distanceLabel(geo, selected.centroid) ? (
                    <span>{distanceLabel(geo, selected.centroid)}</span>
                  ) : null}
                </div>
              </div>
            </div>

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

            {selectedIdx !== null && selectedIdx < parcels.length - 1 ? (
              <button
                type="button"
                onClick={advanceNext}
                className="mt-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                Next door →
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
