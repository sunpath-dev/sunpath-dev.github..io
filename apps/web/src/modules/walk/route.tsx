import { useEffect, useState } from "react";
import { Button } from "@sunpath/ui";
import { useAuth } from "@/lib/auth.js";
import { recordDoorEvent, useRecentEvents, useUnsyncedCount } from "./repo.js";

/**
 * Walk view — the active door-knock surface. Rep taps an outcome per door.
 * Door events are written via the sync engine (offline-first; replayed when online).
 *
 * NOTE: parcel selection is a stub. A real implementation will get the active
 * parcel from the territory module via a shared store or DB read; for now we
 * use a fixed dev parcel id so the rest of the loop (record → outbox → sync)
 * can be exercised end-to-end.
 */
const DEV_PARCEL_ID = "00000000-0000-4000-8000-000000000001";

const OUTCOMES: Array<{ value: string; label: string; tone: "primary" | "secondary" }> = [
  { value: "no_answer", label: "No answer", tone: "secondary" },
  { value: "not_interested", label: "Not interested", tone: "secondary" },
  { value: "callback", label: "Callback", tone: "primary" },
  { value: "appointment", label: "Appointment", tone: "primary" },
];

export function WalkRoute() {
  const { session } = useAuth();
  const events = useRecentEvents(10);
  const unsynced = useUnsyncedCount();
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
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

  async function tap(outcome: string) {
    if (!session) return;
    setRecording(true);
    try {
      await recordDoorEvent({
        parcel_id: DEV_PARCEL_ID,
        rep_id: session.user.id,
        outcome,
        geo: geo ?? undefined,
      });
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Walk</h1>
          <p className="text-sm text-slate-600">
            Tap an outcome at each door. Saves offline.
          </p>
        </div>
        {unsynced && unsynced > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {unsynced} pending
          </span>
        ) : null}
      </header>

      <div className="mb-3 rounded-lg border bg-white p-3 text-xs text-slate-600 shadow-sm">
        {geo
          ? `Location: ${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`
          : "Locating…"}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border bg-white shadow-sm">
        {events && events.length > 0 ? (
          <ul className="divide-y">
            {events.map((e) => (
              <li
                key={e.client_event_id}
                className="flex items-center justify-between p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{e.outcome}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(e.occurred_at).toLocaleTimeString()}
                  </div>
                </div>
                <span
                  className={
                    e.synced
                      ? "text-xs text-emerald-700"
                      : "text-xs text-amber-700"
                  }
                >
                  {e.synced ? "synced" : `pending${e.attempts ? ` (${e.attempts})` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-sm text-slate-500">No events yet today.</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {OUTCOMES.map((o) => (
          <Button
            key={o.value}
            variant={o.tone}
            size="lg"
            disabled={recording || !session}
            onClick={() => void tap(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
