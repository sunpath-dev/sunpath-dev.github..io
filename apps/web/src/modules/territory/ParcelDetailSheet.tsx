// Parcel detail bottom-sheet — opens when the user taps a pin on the territory
// map. Shows the score breakdown, current incentives in the parcel's state,
// and an on-demand PVWatts production estimate.
import { useEffect, useState } from "react";
import {
  IncentivesResponseSchema,
  PvWattsEstimateSchema,
  type IncentivesResponse,
  type PvWattsEstimate,
} from "@sunpath/shared";
import { supabase } from "@/lib/supabase.js";

export interface ParcelDetail {
  id: string;
  address: string;
  state: string;
  lat: number;
  lon: number;
  score: number;
  existing: boolean;
}

interface Props {
  parcel: ParcelDetail | null;
  onClose: () => void;
}

export function ParcelDetailSheet({ parcel, onClose }: Props) {
  const [incentives, setIncentives] = useState<IncentivesResponse | null>(null);
  const [estimate, setEstimate] = useState<PvWattsEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

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
    return () => {
      cancelled = true;
      setIncentives(null);
      setEstimate(null);
      setEstimateError(null);
    };
  }, [parcel]);

  if (!parcel) return null;

  const requestEstimate = async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pvwatts-fetch",
        { body: { lat: parcel.lat, lon: parcel.lon, system_capacity_kw: 7 } },
      );
      if (error) {
        setEstimateError(error.message);
        return;
      }
      const parsed = PvWattsEstimateSchema.safeParse(data);
      if (!parsed.success) {
        setEstimateError("estimate response did not match schema");
        return;
      }
      setEstimate(parsed.data);
    } catch (err) {
      setEstimateError(String(err));
    } finally {
      setLoadingEstimate(false);
    }
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t bg-white p-4 shadow-2xl"
      role="dialog"
      aria-label="Parcel detail"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{parcel.address}</h2>
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
      </div>

      <section className="mb-3">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">
          Incentives ({parcel.state})
        </h3>
        {incentives ? (
          <ul className="space-y-2">
            {incentives.programs.map((p) => (
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
            ))}
          </ul>
        ) : (
          <div className="text-xs text-slate-500">Loading incentives…</div>
        )}
      </section>

      <section className="mb-2">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">
          Production estimate
        </h3>
        {estimate ? (
          <div className="rounded border bg-white p-2 text-xs shadow-sm">
            <div>
              <span className="font-medium">7 kW system</span> →{" "}
              {estimate.ac_annual_kwh.toLocaleString()} kWh/yr
            </div>
            <div className="text-slate-600">
              Capacity factor:{" "}
              {(estimate.capacity_factor * 100).toFixed(1)}%
              {estimate.est_annual_savings_usd !== null
                ? ` • ~$${estimate.est_annual_savings_usd.toFixed(0)}/yr at supplied rate`
                : ""}
            </div>
          </div>
        ) : (
          <button
            onClick={requestEstimate}
            disabled={loadingEstimate}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
          >
            {loadingEstimate ? "Estimating…" : "Estimate production (PVWatts)"}
          </button>
        )}
        {estimateError ? (
          <div className="mt-1 text-xs text-red-700">{estimateError}</div>
        ) : null}
      </section>
    </div>
  );
}
