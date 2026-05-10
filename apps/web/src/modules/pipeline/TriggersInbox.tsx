// Triggers Inbox — small banner above the pipeline that lists open
// trigger_event rows (rate hikes, permit pulls, etc.) so the rep can act
// on them. Reads live from Supabase; writes a dismissed_at to clear.
//
// Module: pipeline (lives next to the kanban so reps see "what to do" and
// "what's been done" together).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";

interface InboxRow {
  id: string;
  parcel_id: string;
  address_line1: string | null;
  kind: string;
  fired_at: string;
  payload: Record<string, unknown> | null;
}

const KIND_LABEL: Record<string, string> = {
  rate_hike: "Rate hike",
  permit_pulled: "Permit pulled nearby",
  for_sale: "Listed for sale",
  sold: "Recently sold",
  utility_outage: "Utility outage",
};

// Pure helper — extracted so the render path stays free of Date.now()
// calls (eslint react-hooks/purity). Pass the value in via state instead.
function ageInDays(firedAt: string, nowMs = Date.now()): number {
  const fired = new Date(firedAt).getTime();
  return Math.max(0, Math.round((nowMs - fired) / (1000 * 60 * 60 * 24)));
}

export function TriggersInbox() {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("trigger_inbox")
        .select("id,parcel_id,address_line1,kind,fired_at,payload")
        .limit(20);
      if (cancelled) return;
      if (err) {
        // Treat "view not found" as empty inbox (migration not applied yet).
        if (/relation .* does not exist/i.test(err.message)) {
          setRows([]);
        } else {
          setError(err.message);
        }
        return;
      }
      setRows((data ?? []) as InboxRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async (id: string) => {
    setBusyId(id);
    const { error: err } = await supabase
      .from("trigger_event")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
  };

  if (rows === null && !error) return null; // first load
  if (rows && rows.length === 0 && !error) return null; // hide empty

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-900">
          Triggers ({rows?.length ?? 0})
        </h2>
        <span className="text-xs text-amber-700">
          Re-warm targets — act fast
        </span>
      </div>
      {error ? (
        <div className="text-xs text-red-700">Inbox error: {error}</div>
      ) : (
        <ul className="space-y-1.5">
          {rows!.map((r) => {
            const label = KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, " ");
            const ageDays = ageInDays(r.fired_at);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded bg-white px-2 py-1.5 text-xs shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">
                    {label}
                  </div>
                  <div className="truncate text-slate-500">
                    {r.address_line1 ?? r.parcel_id.slice(0, 8)} · {ageDays}d
                    ago
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void dismiss(r.id)}
                  disabled={busyId === r.id}
                  className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyId === r.id ? "…" : "Dismiss"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
