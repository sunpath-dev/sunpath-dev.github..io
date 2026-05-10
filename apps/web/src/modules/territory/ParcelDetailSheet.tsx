import { useEffect, useState } from "react";
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
import { recordDoorEvent } from "@/modules/walk/repo.js";

interface HoaBadge {
  name: string;
  rule_color: "red" | "yellow" | "green";
  notes: string | null;
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

export function ParcelDetailSheet({ parcel, onClose }: Props) {
  const { session } = useAuth();

  const [incentives, setIncentives] = useState<IncentivesResponse | null>(null);
  const [estimate, setEstimate] = useState<PvWattsEstimate | null>(null);
  const [hoa, setHoa] = useState<HoaBadge | null>(null);
  const [census, setCensus] = useState<CensusContext | null>(null);
  const [rooftop, setRooftop] = useState<RooftopData | null>(null);
  const [femaZone, setFemaZone] = useState<string | null | "loading">("loading");
  const [triggers, setTriggers] = useState<TriggerCounts | null>(null);

  const [showKnockPicker, setShowKnockPicker] = useState(false);
  const [showPitches, setShowPitches] = useState(false);
  const [knockDone, setKnockDone] = useState<DoorOutcome | null>(null);
  const [knockError, setKnockError] = useState<string | null>(null);

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

    void (async () => {
      const { data, error } = await supabase.functions.invoke("pvwatts-fetch", {
        body: { lat: parcel.lat, lon: parcel.lon, system_capacity_kw: SYSTEM_KW },
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
        if (error || !data) {
          setFemaZone(null);
          return;
        }
        const zone = typeof data === "object" && "zone" in data ? String((data as Record<string, unknown>)["zone"]) : null;
        setFemaZone(zone);
      } catch {
        setFemaZone(null);
      }
    })();

    void (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("trigger_event")
        .select("event_type, created_at")
        .eq("county_fips", "169")
        .gte("created_at", since)
        .limit(20);
      if (cancelled || !Array.isArray(data)) return;
      const rows = data as { event_type: string; created_at: string }[];
      const permits = rows.filter((r) => r.event_type === "permit").length;
      const sales = rows.filter((r) => r.event_type === "sale").length;
      setTriggers({ permits, sales });
    })();

    return () => {
      cancelled = true;
      setIncentives(null);
      setEstimate(null);
      setHoa(null);
      setCensus(null);
      setRooftop(null);
      setFemaZone("loading");
      setTriggers(null);
      setShowKnockPicker(false);
      setShowPitches(false);
      setKnockDone(null);
      setKnockError(null);
    };
  }, [parcel]);

  if (!parcel) return null;

  const finModel =
    estimate && estimate.est_annual_savings_usd !== null
      ? financialModel(
          estimate.ac_annual_kwh,
          estimate.est_annual_savings_usd / estimate.ac_annual_kwh,
          SYSTEM_KW,
        )
      : null;

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

  const hasHomeFacts =
    parcel.year_built !== undefined ||
    parcel.sqft !== undefined ||
    parcel.assessed_value_usd !== undefined ||
    parcel.last_sale_date !== undefined ||
    parcel.roof_orientation !== undefined;

  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 z-10 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t bg-white p-4 shadow-2xl"
        role="dialog"
        aria-label="Parcel detail"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{parcel.address}</h2>
            <p className="text-xs text-slate-500">
              {parcel.lat.toFixed(4)}, {parcel.lon.toFixed(4)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* KNOCK SCORE */}
        <div className="mb-3 rounded-lg border bg-slate-50 p-3 text-sm">
          {parcel.existing ? (
            <span className="text-slate-600">
              Existing solar on record — excluded from scoring.
            </span>
          ) : (
            <>
              <span className="font-medium">Knock score </span>
              <span className="text-2xl font-bold text-amber-700">
                {parcel.score < 0 ? "—" : parcel.score}
              </span>
              <span className="text-slate-500"> / 100</span>
            </>
          )}
          {hoa ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={
                  hoa.rule_color === "red"
                    ? "inline-block h-2 w-2 rounded-full bg-red-500"
                    : hoa.rule_color === "yellow"
                      ? "inline-block h-2 w-2 rounded-full bg-yellow-500"
                      : "inline-block h-2 w-2 rounded-full bg-green-500"
                }
                aria-hidden
              />
              <span className="text-xs text-slate-700">
                HOA: {hoa.name}
                {hoa.notes ? ` — ${hoa.notes}` : ""}
              </span>
            </div>
          ) : null}
        </div>

        {/* HOME FACTS */}
        {hasHomeFacts ? (
          <section className="mb-3 rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Home Facts</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              {parcel.year_built !== undefined ? (
                <>
                  <dt className="text-slate-400">Built</dt>
                  <dd>{parcel.year_built}</dd>
                </>
              ) : null}
              {parcel.sqft !== undefined ? (
                <>
                  <dt className="text-slate-400">Size</dt>
                  <dd>{parcel.sqft.toLocaleString()} sqft</dd>
                </>
              ) : null}
              {parcel.roof_orientation !== undefined ? (
                <>
                  <dt className="text-slate-400">Orientation</dt>
                  <dd>{orientationLabel(parcel.roof_orientation)}</dd>
                </>
              ) : null}
              {parcel.assessed_value_usd !== undefined ? (
                <>
                  <dt className="text-slate-400">Assessed</dt>
                  <dd>{fmt$(parcel.assessed_value_usd)}</dd>
                </>
              ) : null}
              {parcel.last_sale_date !== undefined ? (
                <>
                  <dt className="text-slate-400">Last sold</dt>
                  <dd>
                    {parcel.last_sale_date}
                    {parcel.last_sale_price_usd !== undefined
                      ? ` for ${fmt$(parcel.last_sale_price_usd)}`
                      : ""}
                  </dd>
                </>
              ) : null}
              {femaZone === "loading" ? (
                <>
                  <dt className="text-slate-400">Flood zone</dt>
                  <dd className="text-slate-400">Loading…</dd>
                </>
              ) : femaZone !== null ? (
                <>
                  <dt className="text-slate-400">Flood zone</dt>
                  <dd>{femaZone}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* AREA CONTEXT (Census) */}
        {census ? (
          <section className="mb-3 rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Area Context (Census)
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              {census.owner_occupied_pct !== null ? (
                <>
                  <dt className="text-slate-400">Owner-occupied</dt>
                  <dd>{census.owner_occupied_pct}%</dd>
                </>
              ) : null}
              {census.median_household_income_usd !== null ? (
                <>
                  <dt className="text-slate-400">Median income</dt>
                  <dd>{fmt$(census.median_household_income_usd)}</dd>
                </>
              ) : null}
              {census.median_home_value_usd !== null ? (
                <>
                  <dt className="text-slate-400">Median home value</dt>
                  <dd>{fmt$(census.median_home_value_usd)}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ENERGY & SOLAR */}
        {estimate ? (
          <section className="mb-3 rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Energy & Solar</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              <dt className="text-slate-400">System modeled</dt>
              <dd>{SYSTEM_KW} kW</dd>
              <dt className="text-slate-400">Annual production</dt>
              <dd>{estimate.ac_annual_kwh.toLocaleString()} kWh/yr</dd>
              <dt className="text-slate-400">Capacity factor</dt>
              <dd>{(estimate.capacity_factor * 100).toFixed(1)}%</dd>
              {estimate.est_annual_savings_usd !== null ? (
                <>
                  <dt className="text-slate-400">Est. savings/yr</dt>
                  <dd className="font-medium text-green-700">
                    {fmt$(estimate.est_annual_savings_usd)}/yr
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ROOF ANALYSIS */}
        {rooftop ? (
          <section className="mb-3 rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Roof Analysis</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              <dt className="text-slate-400">Facing</dt>
              <dd>{rooftop.south_facing ? "South-facing" : "Not south-facing"}</dd>
              <dt className="text-slate-400">Viable area</dt>
              <dd>{rooftop.viable_area_sqft.toLocaleString()} sqft</dd>
              <dt className="text-slate-400">Max system</dt>
              <dd>{rooftop.max_kw} kW</dd>
              <dt className="text-slate-400">Panel count</dt>
              <dd>{rooftop.panel_count}</dd>
            </dl>
          </section>
        ) : null}

        {/* FINANCIAL MODEL */}
        {finModel ? (
          <section className="mb-3 rounded-lg border bg-amber-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-amber-800">
              Financial Model
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
              <dt className="text-slate-500">System cost</dt>
              <dd>{fmt$(finModel.systemCost)}</dd>
              <dt className="text-slate-500">Federal ITC (30%)</dt>
              <dd className="text-green-700">−{fmt$(finModel.itcRebate)}</dd>
              <dt className="text-slate-500">Annual savings</dt>
              <dd className="font-medium text-green-700">
                {fmt$(finModel.annualSavings)}/yr
              </dd>
              <dt className="text-slate-500">Payback</dt>
              <dd className="font-semibold">
                {finModel.paybackYrs !== null
                  ? `~${finModel.paybackYrs.toFixed(1)} yrs with 30% federal ITC`
                  : "—"}
              </dd>
              <dt className="text-slate-500">25-yr net savings</dt>
              <dd
                className={
                  finModel.savings25yr >= 0 ? "text-green-700" : "text-red-700"
                }
              >
                {fmt$(Math.abs(finModel.savings25yr))}
                {finModel.savings25yr < 0 ? " loss" : " gain"}
              </dd>
            </dl>
          </section>
        ) : null}

        {/* INCENTIVES */}
        <section className="mb-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Incentives ({parcel.state})
          </h3>
          <ul className="space-y-2">
            <li className="rounded border border-green-200 bg-green-50 p-2 text-xs shadow-sm">
              <div className="font-medium text-green-800">
                Federal Investment Tax Credit (ITC) — 30%
              </div>
              <div className="mt-0.5 text-slate-600">
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
                    <div className="text-slate-600">{p.summary}</div>
                    {p.benefit_pct !== null ? (
                      <div className="mt-1 text-slate-500">
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
          <section className="mb-3 rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Neighborhood Proof (last 30d)
            </h3>
            <div className="flex gap-6 text-xs text-slate-600">
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

        {/* ACTION BUTTONS */}
        <div className="mt-4 flex flex-col gap-2">
          {knockDone ? (
            <div className="rounded bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-800">
              Recorded: {OUTCOME_LABELS[knockDone]}
            </div>
          ) : showKnockPicker ? (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Select outcome:
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(OUTCOME_LABELS) as DoorOutcome[]).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    onClick={() => void handleKnock(outcome)}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${OUTCOME_COLORS[outcome]}`}
                  >
                    {OUTCOME_LABELS[outcome]}
                  </button>
                ))}
              </div>
              {knockError ? (
                <div className="mt-2 text-xs text-red-700">{knockError}</div>
              ) : null}
              <button
                type="button"
                onClick={() => setShowKnockPicker(false)}
                className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowKnockPicker(true)}
              className="w-full rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600"
            >
              ▶ Knock this door
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const html = renderDoorcardHtml({
                parcel_id: parcel.id,
                address: parcel.address,
                score: parcel.existing ? null : parcel.score,
                est_annual_kwh: estimate?.ac_annual_kwh ?? null,
                est_annual_savings_usd: estimate?.est_annual_savings_usd ?? null,
                rep_name: null,
                origin: window.location.origin,
              });
              const w = window.open("", "_blank");
              if (w) {
                w.document.open();
                w.document.write(html);
                w.document.close();
              }
            }}
            className="w-full rounded border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
          >
            Open doorcard
          </button>

          <button
            type="button"
            onClick={() => setShowPitches(true)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Pitches
          </button>
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
    </>
  );
}
