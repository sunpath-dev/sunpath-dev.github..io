import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/db.js";
import { kickSync } from "@/lib/sync.js";
import { NoteEditor } from "./NoteEditor.js";
import {
  CensusContextSchema,
  IncentivesResponseSchema,
  PvWattsEstimateSchema,
  renderDoorcardHtml,
  type CensusContext,
  type IncentivesResponse,
  type PvWattsEstimate,
} from "@sunpath/shared";
import { supabase } from "@/lib/supabase.js";
import { useAuth } from "@/lib/auth.js";
import { recordDoorEvent } from "@/lib/door-events.js";
import { addToRoute, isInRoute, removeFromRoute } from "@/lib/route.js";

interface HoaBadge {
  name: string;
  rule_color: "red" | "yellow" | "green";
  notes: string | null;
}

interface OwnerRow {
  owner_name_redacted: string | null;
  owner_occupied: boolean | null;
  year_built: number | null;
  assessed_value_usd: number | null;
  primary_orientation: string | null;
  city: string;
  state: string;
  postal_code: string;
}

interface RooftopData {
  south_facing: boolean;
  viable_area_sqft: number;
  max_kw: number;
  panel_count: number;
}

interface TriggerCounts {
  permits: number;
  sales: number;
}

type DoorOutcome =
  | "no_answer"
  | "soft_no"
  | "hard_no"
  | "callback"
  | "sit"
  | "sale";

const DEFAULT_FIPS: Record<string, { state: string; county: string }> = {
  VA: { state: "51", county: "169" },
  TN: { state: "47", county: "067" },
};

// EIA Feb 2026 residential averages (cents/kWh ÷ 100).
const DEFAULT_RATE_BY_STATE: Record<string, number> = {
  VA: 0.1596,
  TN: 0.114,
};

// EIA 2023 residential avg monthly kWh by state (used as baseline until bill captured).
const EIA_AVG_MONTHLY_KWH: Record<string, number> = {
  VA: 1105,
  TN: 1254,
  NC: 1087,
  WV: 1074,
  KY: 1117,
  GA: 1101,
  SC: 1170,
  AL: 1162,
  MS: 1262,
  AR: 1133,
  LA: 1274,
  TX: 1176,
  FL: 1145,
  OH: 865,
  PA: 857,
  NY: 603,
  CA: 573,
  // National fallback
  "": 886,
};

const SYSTEM_KW = 7;

function financialModel(annualKwh: number, rateUsd: number, systemKw: number) {
  const systemCost = 3.0 * systemKw * 1000;
  const itcRebate = systemCost * 0.30;
  const netCost = systemCost - itcRebate;
  const annualSavings = annualKwh * rateUsd;
  const paybackYrs = annualSavings > 0 ? netCost / annualSavings : null;
  const savings25yr = annualSavings * 25 - netCost;
  return { annualSavings, paybackYrs, savings25yr, systemCost, itcRebate };
}

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Skeleton({ w = "full", h = "3" }: { w?: string; h?: string }) {
  return <div className={`animate-pulse rounded bg-slate-100 w-${w} h-${h}`} />;
}

export interface ParcelDetail {
  id: string;
  address: string;
  state: string;
  lat: number;
  lon: number;
  score: number;
  existing: boolean;
  year_built?: number;
  sqft?: number;
  assessed_value_usd?: number;
  last_sale_date?: string;
  last_sale_price_usd?: number;
  roof_orientation?: string;
}

interface Props {
  parcel: ParcelDetail | null;
  onClose: () => void;
}

const PITCH_SCRIPTS: { title: string; body: string }[] = [
  {
    title: "Rate hike pitch",
    body: "Utility rates in this area have climbed over 4% annually for the past decade. Locking in solar now protects your household from the next round of increases — your production cost is fixed from day one.",
  },
  {
    title: "Neighbor proof pitch",
    body: "Several homes on nearby streets have already made the switch. When your neighbors go solar, property values in the area tend to follow. You'd be getting ahead of the curve, not behind it.",
  },
  {
    title: "ITC sunset pitch",
    body: "The 30% federal tax credit is guaranteed through 2032, then it steps down. A system installed this year means you capture the full credit — that's typically $6,000–$9,000 back on a standard install.",
  },
];

const OUTCOME_LABELS: Record<DoorOutcome, string> = {
  no_answer: "No Answer",
  soft_no: "Soft No",
  hard_no: "Hard No",
  callback: "Callback",
  sit: "Sit",
  sale: "Sale",
};

const OUTCOME_COLORS: Record<DoorOutcome, string> = {
  no_answer: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  soft_no: "bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
  hard_no: "bg-red-50 text-red-800 hover:bg-red-100",
  callback: "bg-blue-50 text-blue-800 hover:bg-blue-100",
  sit: "bg-purple-50 text-purple-800 hover:bg-purple-100",
  sale: "bg-green-100 text-green-800 hover:bg-green-200",
};

interface BillCapture {
  total_kwh: number | null;
  rate_kwh_usd: number | null;
  utility_name: string | null;
  total_amount_usd: number | null;
  created_at: string;
}

interface NoteRow {
  id: string;
  body: string;
  created_at: string;
}

export function ParcelDetailSheet({ parcel, onClose }: Props) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [incentives, setIncentives] = useState<IncentivesResponse | null>(null);
  const [estimate, setEstimate] = useState<PvWattsEstimate | null>(null);
  const [hoa, setHoa] = useState<HoaBadge | null>(null);
  const [census, setCensus] = useState<CensusContext | null>(null);
  const [rooftop, setRooftop] = useState<RooftopData | null>(null);
  const [femaZone, setFemaZone] = useState<{ zone: string; label: string; sfha: boolean } | null | "loading">("loading");
  const [utilityRate, setUtilityRate] = useState<number | null>(null);
  const [triggers, setTriggers] = useState<TriggerCounts | null>(null);
  const [ownerRow, setOwnerRow] = useState<OwnerRow | null>(null);
  const [billCapture, setBillCapture] = useState<BillCapture | null>(null);
  const [showBuildMySolar, setShowBuildMySolar] = useState(false);

  // Notes
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteRow | null>(null);
  const notesSentinelRef = useRef<HTMLDivElement>(null);

  const [showKnockPicker, setShowKnockPicker] = useState(false);
  const [showPitches, setShowPitches] = useState(false);
  const [knockDone, setKnockDone] = useState<DoorOutcome | null>(null);
  const [knockError, setKnockError] = useState<string | null>(null);
  // Derived from localStorage; routeTick forces a re-read after button clicks.
  const [routeTick, setRouteTick] = useState(0);
  const inRoute = parcel ? isInRoute(parcel.id) : false;
  void routeTick; // consumed only to trigger re-render

  useEffect(() => {
    if (!parcel) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.functions.invoke("incentives-fetch", {
        body: { state: parcel.state },
      });
      if (cancelled) return;
      const parsed = IncentivesResponseSchema.safeParse(data);
      if (parsed.success) setIncentives(parsed.data);
    })();

    void (async () => {
      const { data } = await supabase.rpc("hoa_for_parcel", {
        parcel_id: parcel.id,
      });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (row && row.rule_color) setHoa(row as HoaBadge);
    })();

    void (async () => {
      const fips = DEFAULT_FIPS[parcel.state];
      if (!fips) return;
      const { data } = await supabase.functions.invoke("census-fetch", {
        body: { state_fips: fips.state, county_fips: fips.county },
      });
      if (cancelled) return;
      const parsed = CensusContextSchema.safeParse(data);
      if (parsed.success) setCensus(parsed.data);
    })();

    // Pull stored utility rate first; fall back to state average.
    void (async () => {
      let rate = DEFAULT_RATE_BY_STATE[parcel.state] ?? 0.12;
      const { data: rateRow } = await supabase
        .from("utility_rate_observation")
        .select("rate_kwh_usd, period")
        .eq("state", parcel.state)
        .eq("sector", "RES")
        .is("utility_id", null)
        .order("period", { ascending: false })
        .limit(1)
        .single();
      if (rateRow && typeof (rateRow as { rate_kwh_usd: number }).rate_kwh_usd === "number") {
        rate = (rateRow as { rate_kwh_usd: number }).rate_kwh_usd;
      }
      if (cancelled) return;
      setUtilityRate(rate);

      const { data, error } = await supabase.functions.invoke("pvwatts-fetch", {
        body: {
          lat: parcel.lat,
          lon: parcel.lon,
          system_capacity_kw: SYSTEM_KW,
          utility_rate_usd_per_kwh: rate,
        },
      });
      if (cancelled || error) return;
      const parsed = PvWattsEstimateSchema.safeParse(data);
      if (parsed.success) setEstimate(parsed.data);
    })();

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("solar-rooftop", {
          body: { lat: parcel.lat, lon: parcel.lon, parcel_id: parcel.id },
        });
        if (cancelled || error || !data) return;
        if (
          typeof data === "object" &&
          "viable_area_sqft" in data &&
          "max_kw" in data &&
          "panel_count" in data
        ) {
          setRooftop(data as RooftopData);
        }
      } catch {
        // section skipped gracefully
      }
    })();

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("fema-flood-zone", {
          body: { lat: parcel.lat, lon: parcel.lon },
        });
        if (cancelled) return;
        if (error || !data || typeof data !== "object") {
          setFemaZone(null);
          return;
        }
        const d = data as Record<string, unknown>;
        const zone = typeof d["zone"] === "string" ? d["zone"] : "X";
        const label = typeof d["label"] === "string" ? d["label"] : zone;
        const sfha = d["sfha"] === true;
        setFemaZone({ zone, label, sfha });
      } catch {
        setFemaZone(null);
      }
    })();

    void (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("trigger_event")
        .select("kind, fired_at")
        .gte("fired_at", since)
        .limit(50);
      if (cancelled || !Array.isArray(data)) return;
      const rows = data as { kind: string; fired_at: string }[];
      const permits = rows.filter((r) => r.kind === "permit").length;
      const sales = rows.filter((r) => r.kind === "sale").length;
      if (permits > 0 || sales > 0) setTriggers({ permits, sales });
    })();

    // Fetch full parcel row + bill captures (skip for synthetic/geocoded parcels).
    if (!parcel.id.startsWith("geo:")) {
      void (async () => {
        const { data } = await supabase
          .from("parcel")
          .select(
            "owner_name_redacted, owner_occupied, year_built, assessed_value_usd, primary_orientation, city, state, postal_code",
          )
          .eq("id", parcel.id)
          .single();
        if (cancelled || !data) return;
        setOwnerRow(data as OwnerRow);
      })();

      void (async () => {
        const { data } = await supabase
          .from("bill_capture")
          .select("total_kwh, rate_kwh_usd, utility_name, total_amount_usd, created_at")
          .eq("parcel_id", parcel.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (cancelled || !data) return;
        setBillCapture(data as BillCapture);
      })();

      // Fetch notes from local Dexie first (instant), then refresh from server.
      void db.parcelNotes
        .where("parcel_id")
        .equals(parcel.id)
        .reverse()
        .sortBy("created_at")
        .then((rows) => {
          if (cancelled) return;
          setNotes(rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at })).reverse());
        });

      void (async () => {
        const { data } = await supabase
          .from("parcel_note")
          .select("id, body, created_at")
          .eq("parcel_id", parcel.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (cancelled || !Array.isArray(data)) return;
        setNotes((data as NoteRow[]).slice().reverse());
      })();
    }

    return () => {
      cancelled = true;
      setIncentives(null);
      setEstimate(null);
      setHoa(null);
      setCensus(null);
      setRooftop(null);
      setFemaZone("loading");
      setUtilityRate(null);
      setTriggers(null);
      setShowKnockPicker(false);
      setShowPitches(false);
      setKnockDone(null);
      setKnockError(null);
      setOwnerRow(null);
      setBillCapture(null);
      setNotes([]);
      setShowNoteEditor(false);
      setEditingNote(null);
    };
  }, [parcel]);

  if (!parcel) return null;

  const effectiveRate =
    billCapture?.rate_kwh_usd ??
    (estimate?.est_annual_savings_usd != null && estimate.ac_annual_kwh > 0
      ? estimate.est_annual_savings_usd / estimate.ac_annual_kwh
      : (utilityRate ?? DEFAULT_RATE_BY_STATE[parcel?.state ?? ""] ?? 0.12));

  // When a bill is captured: derive annual kWh from actual monthly usage.
  // Ratio: PVWatts annual output / EIA state avg annual kWh × actual monthly.
  const billAnnualKwh =
    billCapture?.total_kwh != null && estimate?.ac_annual_kwh != null
      ? (billCapture.total_kwh * 12 * estimate.ac_annual_kwh) /
        Math.max(1, (EIA_AVG_MONTHLY_KWH[parcel?.state ?? ""] ?? EIA_AVG_MONTHLY_KWH[""] ?? 886) * 12)
      : null;

  const finModel =
    estimate
      ? financialModel(billAnnualKwh ?? estimate.ac_annual_kwh, effectiveRate, SYSTEM_KW)
      : null;

  const finModelIsActual = billCapture?.total_kwh != null;

  const handleSaveNote = async (body: string) => {
    if (!session) return;
    const now = new Date().toISOString();
    if (editingNote) {
      // Update existing note locally + server.
      await db.parcelNotes.update(editingNote.id, { body, updated_at: now, synced: 0 });
      setNotes((prev) =>
        prev.map((n) => (n.id === editingNote.id ? { ...n, body } : n)),
      );
    } else {
      const id = crypto.randomUUID();
      await db.parcelNotes.put({
        id,
        rep_id: session.user.id,
        parcel_id: parcel.id,
        body,
        created_at: now,
        updated_at: now,
        synced: 0,
        attempts: 0,
      });
      setNotes((prev) => [...prev, { id, body, created_at: now }]);
      setTimeout(() => notesSentinelRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    kickSync();
    setShowNoteEditor(false);
    setEditingNote(null);
  };

  const handleDeleteNote = async (id: string) => {
    await db.parcelNotes.delete(id);
    await supabase.from("parcel_note").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleKnock = async (outcome: DoorOutcome) => {
    if (!session) return;
    setKnockError(null);
    try {
      await recordDoorEvent({
        parcel_id: parcel.id,
        rep_id: session.user.id,
        outcome,
        geo: { lat: parcel.lat, lon: parcel.lon },
      });
      setKnockDone(outcome);
      setShowKnockPicker(false);
    } catch (err) {
      setKnockError(String(err));
    }
  };

  const orientationLabel = (raw: string): string => {
    const map: Record<string, string> = {
      S: "South",
      N: "North",
      E: "East",
      W: "West",
      SE: "Southeast",
      SW: "Southwest",
      NE: "Northeast",
      NW: "Northwest",
    };
    return map[raw.toUpperCase()] ?? raw;
  };

  // Prefer DB-fetched data; fall back to fields baked into the parcel prop.
  const yearBuilt = ownerRow?.year_built ?? parcel.year_built;
  const assessedValue = ownerRow?.assessed_value_usd ?? parcel.assessed_value_usd;
  const roofOrientation = ownerRow?.primary_orientation ?? parcel.roof_orientation;
  const hasHomeFacts =
    yearBuilt !== undefined ||
    parcel.sqft !== undefined ||
    assessedValue !== undefined ||
    parcel.last_sale_date !== undefined ||
    roofOrientation !== undefined;

  return (
    <>
      {/* Sheet: flex column so sticky footer doesn't scroll away */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[85vh] flex-col rounded-t-2xl border-t bg-white shadow-2xl"
        role="dialog"
        aria-label="Parcel detail"
      >
        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">

          {/* HEADER */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight text-slate-900">
                {parcel.address}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {ownerRow ? (
                  <span className="text-xs text-slate-600">
                    {ownerRow.city}, {ownerRow.state} {ownerRow.postal_code}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    {parcel.lat.toFixed(4)}, {parcel.lon.toFixed(4)}
                  </span>
                )}
                {hoa && (
                  <span className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    hoa.rule_color === "red" ? "bg-red-100 text-red-800" :
                    hoa.rule_color === "yellow" ? "bg-yellow-100 text-yellow-800" :
                    "bg-green-100 text-green-800",
                  ].join(" ")}>
                    <span className={[
                      "h-1.5 w-1.5 rounded-full",
                      hoa.rule_color === "red" ? "bg-red-500" :
                      hoa.rule_color === "yellow" ? "bg-yellow-500" : "bg-green-500",
                    ].join(" ")} />
                    HOA
                  </span>
                )}
                {finModelIsActual && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    ★ Bill linked
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* HERO STATS STRIP */}
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {/* Score */}
            <div className="rounded-xl bg-amber-50 p-2 text-center">
              <div className="text-xl font-extrabold leading-none text-amber-700">
                {parcel.existing ? "★" : parcel.score < 0 ? "—" : parcel.score}
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                {parcel.existing ? "Solar" : "Score"}
              </div>
            </div>
            {/* Savings */}
            <div className="rounded-xl bg-green-50 p-2 text-center">
              {finModel ? (
                <>
                  <div className="text-sm font-extrabold leading-none text-green-700">
                    {fmt$(finModel.annualSavings)}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    /yr saved
                  </div>
                </>
              ) : (
                <Skeleton w="full" h="8" />
              )}
            </div>
            {/* Payback */}
            <div className="rounded-xl bg-blue-50 p-2 text-center">
              {finModel ? (
                <>
                  <div className="text-sm font-extrabold leading-none text-blue-700">
                    {finModel.paybackYrs != null ? `${finModel.paybackYrs.toFixed(1)}y` : "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    Payback
                  </div>
                </>
              ) : (
                <Skeleton w="full" h="8" />
              )}
            </div>
            {/* Sun hours */}
            <div className="rounded-xl bg-orange-50 p-2 text-center">
              {estimate?.peak_sun_hours_day != null ? (
                <>
                  <div className="text-sm font-extrabold leading-none text-orange-700">
                    {estimate.peak_sun_hours_day}h
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                    Sun/day
                  </div>
                </>
              ) : (
                <Skeleton w="full" h="8" />
              )}
            </div>
          </div>

          {/* PROPERTY OWNER */}
          {!parcel.id.startsWith("geo:") && (
            <section className="mb-2 rounded-xl border bg-white p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Property Owner
              </h3>
              {ownerRow ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="font-medium text-slate-700">Owner</dt>
                  <dd className="text-slate-800">
                    {ownerRow.owner_name_redacted ?? "Not on record"}
                  </dd>
                  <dt className="font-medium text-slate-700">Occupancy</dt>
                  <dd className={ownerRow.owner_occupied === true ? "font-semibold text-green-700" : "text-slate-800"}>
                    {ownerRow.owner_occupied === true
                      ? "Owner-occupied"
                      : ownerRow.owner_occupied === false
                        ? "Rental / non-owner"
                        : "Unknown"}
                  </dd>
                </dl>
              ) : (
                <div className="space-y-1.5">
                  <Skeleton h="3" />
                  <Skeleton w="3/4" h="3" />
                </div>
              )}
            </section>
          )}

        {/* LOCATION & RISK */}
        <section className="mb-2 rounded-xl border bg-white p-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Location & Risk
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="font-medium text-slate-700">Utility rate</dt>
            <dd className="text-slate-800">
              {utilityRate != null
                ? `$${utilityRate.toFixed(3)}/kWh`
                : `~$${(DEFAULT_RATE_BY_STATE[parcel.state] ?? 0.12).toFixed(3)}/kWh (est.)`}
            </dd>
            {femaZone === "loading" ? (
              <>
                <dt className="font-medium text-slate-700">Flood zone</dt>
                <dd><Skeleton w="20" h="3" /></dd>
              </>
            ) : femaZone !== null ? (
              <>
                <dt className="font-medium text-slate-700">Flood zone</dt>
                <dd className={femaZone.sfha ? "font-semibold text-orange-700" : "text-slate-800"}>
                  {femaZone.label}
                </dd>
              </>
            ) : null}
            <dt className="font-medium text-slate-700">Coordinates</dt>
            <dd className="text-slate-600 text-[11px]">
              {parcel.lat.toFixed(5)}, {parcel.lon.toFixed(5)}
            </dd>
          </dl>
        </section>

        {/* HOME FACTS */}
        {hasHomeFacts ? (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Home Facts</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-900">
              {yearBuilt !== undefined ? (
                <>
                  <dt className="font-medium text-slate-700">Built</dt>
                  <dd>{yearBuilt}</dd>
                </>
              ) : null}
              {parcel.sqft !== undefined ? (
                <>
                  <dt className="font-medium text-slate-700">Size</dt>
                  <dd>{parcel.sqft.toLocaleString()} sqft</dd>
                </>
              ) : null}
              {roofOrientation !== undefined ? (
                <>
                  <dt className="font-medium text-slate-700">Orientation</dt>
                  <dd>{orientationLabel(roofOrientation)}</dd>
                </>
              ) : null}
              {assessedValue !== undefined ? (
                <>
                  <dt className="font-medium text-slate-700">Assessed value</dt>
                  <dd>{fmt$(Number(assessedValue))}</dd>
                </>
              ) : null}
              {parcel.last_sale_date !== undefined ? (
                <>
                  <dt className="font-medium text-slate-700">Last sold</dt>
                  <dd>
                    {parcel.last_sale_date}
                    {parcel.last_sale_price_usd !== undefined
                      ? ` for ${fmt$(parcel.last_sale_price_usd)}`
                      : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* AREA CONTEXT (Census) */}
        {census ? (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Area (Census)
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-900">
              {census.owner_occupied_pct !== null ? (
                <>
                  <dt className="font-medium text-slate-700">Owner-occupied</dt>
                  <dd>{census.owner_occupied_pct}%</dd>
                </>
              ) : null}
              {census.median_household_income_usd !== null ? (
                <>
                  <dt className="font-medium text-slate-700">Median income</dt>
                  <dd>{fmt$(census.median_household_income_usd)}</dd>
                </>
              ) : null}
              {census.median_home_value_usd !== null ? (
                <>
                  <dt className="font-medium text-slate-700">Median home value</dt>
                  <dd>{fmt$(census.median_home_value_usd)}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ENERGY & SOLAR */}
        {!estimate ? (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Energy & Solar</h3>
            <div className="space-y-1.5">
              <Skeleton h="3" /><Skeleton w="3/4" h="3" /><Skeleton w="5/6" h="3" />
            </div>
          </section>
        ) : (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Energy & Solar</h3>
              {finModelIsActual && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  ★ Actual bill
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-900">
              {estimate.peak_sun_hours_day != null ? (
                <>
                  <dt className="font-medium text-slate-700">Peak sun hrs/day</dt>
                  <dd className="font-semibold text-amber-700">
                    {estimate.peak_sun_hours_day} hrs (NREL)
                  </dd>
                </>
              ) : null}
              <dt className="font-medium text-slate-700">System modeled</dt>
              <dd>{SYSTEM_KW} kW</dd>
              <dt className="font-medium text-slate-700">Annual production</dt>
              <dd>{estimate.ac_annual_kwh.toLocaleString()} kWh/yr</dd>
              {billCapture?.total_kwh != null ? (
                <>
                  <dt className="font-medium text-slate-700">Your usage</dt>
                  <dd className="font-semibold text-slate-900">
                    {billCapture.total_kwh.toLocaleString()} kWh/mo
                    {billCapture.utility_name ? ` · ${billCapture.utility_name}` : ""}
                  </dd>
                </>
              ) : (
                <>
                  <dt className="font-medium text-slate-700">
                    {parcel.state} avg usage
                  </dt>
                  <dd className="text-slate-600">
                    {(EIA_AVG_MONTHLY_KWH[parcel.state] ?? EIA_AVG_MONTHLY_KWH[""] ?? 886).toLocaleString()} kWh/mo (EIA)
                  </dd>
                </>
              )}
              <dt className="font-medium text-slate-700">
                Rate {finModelIsActual ? "(actual)" : "(est.)"}
              </dt>
              <dd>${effectiveRate.toFixed(3)}/kWh</dd>
              <dt className="font-medium text-slate-700">
                Savings/yr {finModelIsActual ? "★" : "(est.)"}
              </dt>
              <dd className="font-semibold text-green-700">
                {fmt$((finModel?.annualSavings ?? estimate.ac_annual_kwh * effectiveRate))}/yr
              </dd>
            </dl>
          </section>
        )}

        {/* ROOF ANALYSIS */}
        {rooftop ? (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Roof Analysis</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-900">
              <dt className="font-medium text-slate-700">Facing</dt>
              <dd>{rooftop.south_facing ? "South-facing" : "Not south-facing"}</dd>
              <dt className="font-medium text-slate-700">Viable area</dt>
              <dd>{rooftop.viable_area_sqft.toLocaleString()} sqft</dd>
              <dt className="font-medium text-slate-700">Max system</dt>
              <dd>{rooftop.max_kw} kW</dd>
              <dt className="font-medium text-slate-700">Panel count</dt>
              <dd>{rooftop.panel_count}</dd>
            </dl>
          </section>
        ) : null}

        {/* FINANCIAL MODEL */}
        {finModel ? (
          <section className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Financial Model</h3>
              <span className={`text-xs font-medium ${finModelIsActual ? "text-green-700" : "text-slate-500"}`}>
                {finModelIsActual ? "★ Based on your bill" : "Estimated"}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
              <dt className="font-medium text-slate-700">System cost</dt>
              <dd>{fmt$(finModel.systemCost)}</dd>
              <dt className="font-medium text-slate-700">Federal ITC (30%)</dt>
              <dd className="text-green-700">−{fmt$(finModel.itcRebate)}</dd>
              <dt className="font-medium text-slate-700">Annual savings</dt>
              <dd className="font-semibold text-green-700">
                {fmt$(finModel.annualSavings)}/yr
              </dd>
              <dt className="font-medium text-slate-700">Payback</dt>
              <dd className="font-semibold">
                {finModel.paybackYrs !== null
                  ? `~${finModel.paybackYrs.toFixed(1)} yrs with 30% ITC`
                  : "—"}
              </dd>
              <dt className="font-medium text-slate-700">25-yr net savings</dt>
              <dd className={finModel.savings25yr >= 0 ? "text-green-700" : "text-red-700"}>
                {fmt$(Math.abs(finModel.savings25yr))}
                {finModel.savings25yr < 0 ? " loss" : " gain"}
              </dd>
            </dl>
          </section>
        ) : null}

        {/* INCENTIVES */}
        <section className="mb-2">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Incentives ({parcel.state})
          </h3>
          <ul className="space-y-2">
            <li className="rounded border border-green-200 bg-green-50 p-2 text-xs shadow-sm">
              <div className="font-medium text-green-800">
                Federal Investment Tax Credit (ITC) — 30%
              </div>
              <div className="mt-0.5 text-slate-800">
                No cap, applies to full installed cost, valid through 2032
              </div>
            </li>
            {incentives ? (
              incentives.programs
                .filter((p) => p.scope !== "federal")
                .map((p) => (
                  <li
                    key={p.id}
                    className="rounded border bg-white p-2 text-xs shadow-sm"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-800">{p.summary}</div>
                    {p.benefit_pct !== null ? (
                      <div className="mt-1 text-slate-700">
                        Benefit: {p.benefit_pct}%
                        {p.expires_on ? ` • expires ${p.expires_on}` : ""}
                      </div>
                    ) : null}
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-amber-700 underline"
                    >
                      Source
                    </a>
                  </li>
                ))
            ) : (
              <li className="text-xs text-slate-500">Loading state programs…</li>
            )}
          </ul>
        </section>

        {/* NEIGHBORHOOD PROOF */}
        {triggers ? (
          <section className="mb-2 rounded-xl border bg-white p-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Neighborhood (last 30d)
            </h3>
            <div className="flex gap-6 text-xs text-slate-800">
              <div>
                <span className="text-lg font-bold text-amber-700">
                  {triggers.permits}
                </span>{" "}
                solar permits within ¼ mi
              </div>
              <div>
                <span className="text-lg font-bold text-slate-700">
                  {triggers.sales}
                </span>{" "}
                home sales nearby
              </div>
            </div>
          </section>
        ) : null}

        {/* PROPERTY NOTES */}
        <section className="mb-2 rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Notes
              {notes.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  {notes.length}
                </span>
              )}
            </h3>
            {!showNoteEditor && (
              <button
                type="button"
                onClick={() => { setEditingNote(null); setShowNoteEditor(true); }}
                className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                + Add note
              </button>
            )}
          </div>

          {showNoteEditor && (
            <NoteEditor
              initialBody={editingNote?.body}
              onSave={(body) => void handleSaveNote(body)}
              onCancel={() => { setShowNoteEditor(false); setEditingNote(null); }}
            />
          )}

          {notes.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                  <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{note.body}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="text-slate-400">
                      {new Date(note.created_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setEditingNote(note); setShowNoteEditor(true); }}
                      className="text-amber-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteNote(note.id)}
                      className="text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !showNoteEditor && (
              <p className="text-xs text-slate-400">No notes yet — tap + Add note or use voice.</p>
            )
          )}
          <div ref={notesSentinelRef} />
        </section>

        {/* bottom padding so last section clears the sticky bar */}
        <div className="h-2" />
        </div>{/* end scrollable body */}

        {/* ── STICKY ACTION BAR ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-2">

          {/* Knock outcome picker — expands above the bar */}
          {showKnockPicker && (
            <div className="mb-2 rounded-xl border bg-slate-50 p-2.5">
              <p className="mb-2 text-xs font-semibold text-slate-700">Select outcome:</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(OUTCOME_LABELS) as DoorOutcome[]).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    onClick={() => void handleKnock(outcome)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${OUTCOME_COLORS[outcome]}`}
                  >
                    {OUTCOME_LABELS[outcome]}
                  </button>
                ))}
              </div>
              {knockError && <div className="mt-1.5 text-xs text-red-700">{knockError}</div>}
              <button
                type="button"
                onClick={() => setShowKnockPicker(false)}
                className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Primary row: Capture Bill · Build My Solar */}
          <div className="mb-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                navigate(`/bill?parcel_id=${parcel.id}&address=${encodeURIComponent(parcel.address)}`)
              }
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {billCapture ? "Update Bill" : "Capture Bill"}
            </button>
            <button
              type="button"
              onClick={() => setShowBuildMySolar(true)}
              className="rounded-xl border border-blue-500 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Build My Solar
            </button>
          </div>

          {/* Secondary row: Route · Knock · Doorcard · Pitches */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (!parcel) return;
                if (inRoute) removeFromRoute(parcel.id);
                else addToRoute({ id: parcel.id, address: parcel.address, lat: parcel.lat, lon: parcel.lon, score: parcel.score, existing: parcel.existing });
                setRouteTick((t) => t + 1);
              }}
              className={[
                "rounded-xl border py-2 text-xs font-semibold transition-colors",
                inRoute
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {inRoute ? "✓ Route" : "+ Route"}
            </button>

            {knockDone ? (
              <div className="col-span-1 rounded-xl bg-green-100 py-2 text-center text-xs font-medium text-green-800">
                {OUTCOME_LABELS[knockDone]}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowKnockPicker((s) => !s)}
                className="rounded-xl bg-amber-500 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
              >
                Knock
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const html = renderDoorcardHtml({
                  parcel_id: parcel.id, address: parcel.address,
                  score: parcel.existing ? null : parcel.score,
                  est_annual_kwh: estimate?.ac_annual_kwh ?? null,
                  est_annual_savings_usd: estimate?.est_annual_savings_usd ?? null,
                  rep_name: null, origin: window.location.origin,
                });
                const w = window.open("", "_blank");
                if (w) { w.document.open(); w.document.write(html); w.document.close(); }
              }}
              className="rounded-xl border border-amber-400 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            >
              Card
            </button>

            <button
              type="button"
              onClick={() => setShowPitches(true)}
              className="rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Pitch
            </button>
          </div>
        </div>
      </div>

      {/* PITCH SCRIPTS MODAL */}
      {showPitches ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/40"
          onClick={() => setShowPitches(false)}
          role="presentation"
        >
          <div
            className="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Pitch scripts"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Pitch Scripts
              </h3>
              <button
                type="button"
                onClick={() => setShowPitches(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close pitches"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {PITCH_SCRIPTS.map((script) => (
                <div
                  key={script.title}
                  className="rounded-lg border bg-slate-50 p-3"
                >
                  <div className="mb-1 text-sm font-semibold text-amber-800">
                    {script.title}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {script.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* BUILD MY SOLAR MODAL */}
      {showBuildMySolar ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/40"
          onClick={() => setShowBuildMySolar(false)}
          role="presentation"
        >
          <div
            className="w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Build My Solar"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Build My Solar
              </h3>
              <button
                type="button"
                onClick={() => setShowBuildMySolar(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">
              Walk the homeowner through a custom system design — panel
              count, roof fit, production estimate, and a financing breakdown
              tailored to this property.
            </p>
            {finModel && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Current estimate for this home
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-700">
                  <dt>System</dt>
                  <dd>{SYSTEM_KW} kW</dd>
                  <dt>Annual savings</dt>
                  <dd className="font-semibold text-green-700">
                    {fmt$(finModel.annualSavings)}/yr
                  </dd>
                  <dt>Payback</dt>
                  <dd>
                    {finModel.paybackYrs !== null
                      ? `~${finModel.paybackYrs.toFixed(1)} yrs`
                      : "—"}
                  </dd>
                  <dt>25-yr net</dt>
                  <dd className={finModel.savings25yr >= 0 ? "text-green-700" : "text-red-700"}>
                    {fmt$(Math.abs(finModel.savings25yr))}
                  </dd>
                </dl>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Coming soon
              </p>
              <p className="text-xs text-slate-600">
                Interactive system builder with financing options,
                panel layout, and leave-behind proposal PDF.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
