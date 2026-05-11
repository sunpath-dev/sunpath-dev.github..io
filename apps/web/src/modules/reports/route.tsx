import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth.js";
import { supabase } from "@/lib/supabase.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = "today" | "week" | "month" | "all";
type OutcomeKey = "no_answer" | "soft_no" | "hard_no" | "callback" | "sit" | "sale";

interface DoorEvent {
  id: string;
  parcel_id: string;
  outcome: string;
  occurred_at: string;
  address: string | null;
}

interface OutcomeStat {
  key: OutcomeKey;
  label: string;
  count: number;
  color: string;
  bgColor: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTCOME_META: Record<OutcomeKey, { label: string; color: string; bgColor: string; funnel: number }> = {
  no_answer: { label: "No Answer",  color: "bg-slate-400",  bgColor: "bg-slate-50",  funnel: 1 },
  soft_no:   { label: "Soft No",    color: "bg-yellow-400", bgColor: "bg-yellow-50", funnel: 2 },
  hard_no:   { label: "Hard No",    color: "bg-red-400",    bgColor: "bg-red-50",    funnel: 3 },
  callback:  { label: "Callback",   color: "bg-blue-400",   bgColor: "bg-blue-50",   funnel: 4 },
  sit:       { label: "Sit",        color: "bg-amber-400",  bgColor: "bg-amber-50",  funnel: 5 },
  sale:      { label: "Sale",       color: "bg-emerald-500",bgColor: "bg-emerald-50",funnel: 6 },
};

const ORDERED_OUTCOMES: OutcomeKey[] = ["no_answer", "soft_no", "hard_no", "callback", "sit", "sale"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodStart(p: Period): Date {
  const d = new Date();
  if (p === "today") { d.setHours(0, 0, 0, 0); return d; }
  if (p === "week")  { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; }
  if (p === "month") { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; }
  return new Date(0);
}

function periodLabel(p: Period): string {
  return { today: "Today", week: "Last 7 days", month: "Last 30 days", all: "All time" }[p];
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function BarRow({ label, count, max, color, bgColor }: {
  label: string; count: number; max: number; color: string; bgColor: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-slate-700">{label}</span>
      <div className={`flex-1 rounded-full h-4 ${bgColor} overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700 tabular-nums">{count}</span>
      <span className="w-8 shrink-0 text-right text-xs text-slate-400 tabular-nums">{pct}%</span>
    </div>
  );
}

function HourGrid({ events }: { events: DoorEvent[] }) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6am–9pm
  const counts: Record<number, number> = {};
  for (const e of events) {
    const h = new Date(e.occurred_at).getHours();
    counts[h] = (counts[h] ?? 0) + 1;
  }
  const maxCount = Math.max(1, ...Object.values(counts));
  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {hours.map((h) => {
          const c = counts[h] ?? 0;
          const intensity = c === 0 ? 0 : Math.max(0.15, c / maxCount);
          return (
            <div key={h} className="flex flex-col items-center gap-0.5">
              <div
                className="h-8 w-7 rounded transition-all"
                style={{ backgroundColor: c === 0 ? "#f1f5f9" : `rgba(245,158,11,${intensity})` }}
                title={`${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}: ${c} door${c !== 1 ? "s" : ""}`}
              />
              <span className="text-[9px] text-slate-400">
                {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
              </span>
            </div>
          );
        })}
      </div>
      {events.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">No door events yet — knock some doors to see your best hours.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main route
// ---------------------------------------------------------------------------

export function ReportsRoute() {
  const { rep } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [events, setEvents] = useState<DoorEvent[]>([]);
  const [prevEvents, setPrevEvents] = useState<DoorEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    if (!rep?.id || rep.id === "poc-guest") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const start = periodStart(p).toISOString();
    const [cur, prev] = await Promise.all([
      supabase
        .from("door_event")
        .select("id, parcel_id, outcome, occurred_at, parcel:parcel_id(address_line1)")
        .eq("rep_id", rep.id)
        .gte("occurred_at", start)
        .order("occurred_at", { ascending: false })
        .limit(500),
      // Previous period for trend comparison (week/month only)
      p === "week" || p === "month"
        ? supabase
            .from("door_event")
            .select("id, outcome", { count: "exact" })
            .eq("rep_id", rep.id)
            .gte("occurred_at", (() => {
              const s = periodStart(p);
              const dur = Date.now() - s.getTime();
              return new Date(s.getTime() - dur).toISOString();
            })())
            .lt("occurred_at", start)
        : Promise.resolve({ data: [] }),
    ]);
    const rows: DoorEvent[] = (cur.data ?? []).map((r) => {
      const raw = r as unknown as { id: string; parcel_id: string; outcome: string; occurred_at: string; parcel: { address_line1: string } | null };
      return {
        id: raw.id,
        parcel_id: raw.parcel_id,
        outcome: raw.outcome,
        occurred_at: raw.occurred_at,
        address: raw.parcel?.address_line1 ?? null,
      };
    });
    setEvents(rows);
    setPrevEvents((prev.data ?? []) as DoorEvent[]);
    setLoading(false);
  }, [rep]);

  useEffect(() => { void load(period); }, [period, load]);

  // Derived stats
  const total = events.length;
  const prevTotal = prevEvents.length;
  const trend = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const outcomeMap: Record<string, number> = {};
  for (const e of events) {
    outcomeMap[e.outcome] = (outcomeMap[e.outcome] ?? 0) + 1;
  }
  const outcomeStat = (k: OutcomeKey): OutcomeStat => ({
    key: k,
    label: OUTCOME_META[k].label,
    count: outcomeMap[k] ?? 0,
    color: OUTCOME_META[k].color,
    bgColor: OUTCOME_META[k].bgColor,
  });
  const stats = ORDERED_OUTCOMES.map(outcomeStat);
  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  const callbacks = outcomeMap["callback"] ?? 0;
  const sits = outcomeMap["sit"] ?? 0;
  const sales = outcomeMap["sale"] ?? 0;
  const contactRate = total > 0
    ? Math.round(((callbacks + sits + sales) / total) * 100)
    : 0;
  const saleRate = total > 0 ? ((sales / total) * 100).toFixed(1) : "—";

  const exportCsv = () => {
    const header = "date,time,address,outcome\n";
    const rows = events.map((e) =>
      [
        shortDate(e.occurred_at),
        shortTime(e.occurred_at),
        csvEscape(e.address ?? e.parcel_id),
        e.outcome,
      ].join(",")
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunpath-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportText = () => {
    const label = periodLabel(period);
    const lines: string[] = [
      `SUNPATH ACTIVITY REPORT — ${label.toUpperCase()}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "SUMMARY",
      `  Doors knocked:  ${total}${trend !== null ? ` (${trend >= 0 ? "+" : ""}${trend}% vs prior period)` : ""}`,
      `  Contact rate:   ${contactRate}%`,
      `  Callbacks:      ${callbacks}`,
      `  Sits:           ${sits}`,
      `  Sales:          ${sales}  (${saleRate}% close rate)`,
      "",
      "OUTCOME BREAKDOWN",
      ...stats.map((s) => `  ${s.label.padEnd(12)} ${String(s.count).padStart(4)}`),
      "",
      "RECENT ACTIVITY",
      ...events.slice(0, 50).map((e) =>
        `  ${shortDate(e.occurred_at)} ${shortTime(e.occurred_at).padEnd(8)} ${(e.address ?? e.parcel_id).slice(0, 35).padEnd(36)} ${e.outcome}`
      ),
      ...(events.length > 50 ? [`  … ${events.length - 50} more (export CSV for full list)`] : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunpath-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPoc = rep?.id === "poc-guest";

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50">

      {/* Header */}
      <div className="border-b bg-white px-4 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">Your door activity and conversion data</p>
        </div>
        {total > 0 && (
          <div className="flex gap-2">
            <button type="button" onClick={exportText} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Text
            </button>
            <button type="button" onClick={exportCsv} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              CSV
            </button>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="border-b bg-white px-4 shrink-0">
        <div className="flex gap-1">
          {(["today", "week", "month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                period === p
                  ? "border-amber-500 text-amber-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4">

        {isPoc && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Reports require a real account. Sign in with admin@sunpath.dev or your own rep account to see your activity data.
          </div>
        )}

        {!isPoc && loading && (
          <div className="text-center py-12 text-sm text-slate-400 animate-pulse">Loading…</div>
        )}

        {!isPoc && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Doors knocked"
                value={total}
                sub={trend !== null
                  ? (trend >= 0 ? `↑ ${trend}% vs prior period` : `↓ ${Math.abs(trend)}% vs prior period`)
                  : undefined}
              />
              <StatCard
                label="Contact rate"
                value={`${contactRate}%`}
                sub="Callbacks + sits + sales"
              />
              <StatCard
                label="Callbacks"
                value={callbacks}
                sub={sits > 0 ? `${sits} sit${sits !== 1 ? "s" : ""}` : undefined}
              />
              <StatCard
                label="Sales"
                value={sales}
                sub={total > 0 ? `${saleRate}% close rate` : undefined}
              />
            </div>

            {/* Outcome breakdown */}
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">Outcome breakdown</h2>
                <p className="text-xs text-slate-500 mt-0.5">{periodLabel(period)} · {total} total door{total !== 1 ? "s" : ""}</p>
              </div>
              {total === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-400">No door events logged yet. Start knocking doors to build your report.</p>
              ) : (
                <div className="px-4 py-4 space-y-2.5">
                  {stats.map((s) => (
                    <BarRow
                      key={s.key}
                      label={s.label}
                      count={s.count}
                      max={maxCount}
                      color={s.color}
                      bgColor={s.bgColor}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Conversion funnel */}
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">Conversion funnel</h2>
                <p className="text-xs text-slate-500 mt-0.5">Doors → Contact → Callback → Sit → Sale</p>
              </div>
              {total === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-400">No data yet.</p>
              ) : (
                <div className="px-4 py-4 space-y-1.5">
                  {[
                    { label: "Doors knocked",  value: total,                        pct: 100,                             color: "bg-slate-200" },
                    { label: "Contact made",   value: callbacks + sits + sales,     pct: total > 0 ? Math.round(((callbacks + sits + sales) / total) * 100) : 0, color: "bg-blue-300" },
                    { label: "Callback / Sit", value: callbacks + sits,             pct: total > 0 ? Math.round(((callbacks + sits) / total) * 100) : 0,          color: "bg-amber-400" },
                    { label: "Sale",           value: sales,                        pct: total > 0 ? Math.round((sales / total) * 100) : 0,                        color: "bg-emerald-500" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-xs text-slate-600">{row.label}</span>
                      <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded transition-all duration-500 ${row.color}`}
                          style={{ width: `${Math.max(row.pct, row.value > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-semibold text-slate-700 tabular-nums shrink-0">{row.value}</span>
                      <span className="w-8 text-right text-xs text-slate-400 tabular-nums shrink-0">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Best time of day */}
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-800">Best time of day</h2>
                <p className="text-xs text-slate-500 mt-0.5">Darker = more doors knocked at that hour</p>
              </div>
              <div className="px-4 py-4">
                <HourGrid events={events} />
              </div>
            </section>

            {/* Recent activity */}
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Recent activity</h2>
                <span className="text-xs text-slate-400">{Math.min(events.length, 50)} of {events.length}</span>
              </div>
              {events.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-400">No door events for this period.</p>
              ) : (
                <ul className="divide-y">
                  {events.slice(0, 50).map((e) => {
                    const meta = OUTCOME_META[e.outcome as OutcomeKey];
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {e.address ?? "(unknown address)"}
                          </div>
                          <div className="text-xs text-slate-400">
                            {shortDate(e.occurred_at)} · {shortTime(e.occurred_at)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.bgColor ?? "bg-slate-50"} ${
                          e.outcome === "sale" ? "text-emerald-700" :
                          e.outcome === "callback" ? "text-blue-700" :
                          e.outcome === "sit" ? "text-amber-700" :
                          e.outcome === "hard_no" ? "text-red-700" :
                          e.outcome === "soft_no" ? "text-yellow-700" :
                          "text-slate-600"
                        }`}>
                          {meta?.label ?? e.outcome}
                        </span>
                      </li>
                    );
                  })}
                  {events.length > 50 && (
                    <li className="px-4 py-3 text-xs text-slate-400 text-center">
                      Export CSV or Text to see all {events.length} events
                    </li>
                  )}
                </ul>
              )}
            </section>

            {/* Property notes */}
            <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Property notes</h2>
                <span className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Coming soon</span>
              </div>
              <div className="px-4 py-4 text-sm text-slate-500 space-y-1.5">
                <p>Voice memos, text notes, and photos captured on the porch will appear here for search and review.</p>
                <p className="text-xs text-slate-400">Tap any property → "Add note" to start capturing. Notes are tied to the address and show up across Today, Properties, and Reports.</p>
              </div>
            </section>

            {/* Export footer */}
            {total > 0 && (
              <div className="flex justify-center gap-3 pb-2">
                <button
                  type="button"
                  onClick={exportText}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Export {periodLabel(period)} as Text
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Export {periodLabel(period)} as CSV
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
