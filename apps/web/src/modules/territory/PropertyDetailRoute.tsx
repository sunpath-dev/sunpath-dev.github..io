import { useEffect, useState, startTransition } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";
import { SubNav } from "@/components/SubNav.js";
import { ParcelDetailSheet, type ParcelDetail } from "./ParcelDetailSheet.js";

const RECENT_KEY = "properties:recent";
const MAX_RECENT = 10;

function saveRecent(id: string, address: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const current = raw
      ? (JSON.parse(raw) as { id: string; address: string; viewedAt: number }[])
      : [];
    const filtered = current.filter((r) => r.id !== id);
    const updated = [{ id, address, viewedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (_e) {
    void _e;
  }
}

type ParcelState =
  | { status: "loading" }
  | { status: "ok"; parcel: ParcelDetail }
  | { status: "error"; message: string };

export function PropertyDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ParcelState>({ status: "loading" });
  const addressParam = searchParams.get("address") ?? searchParams.get("q") ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // Geocoded addresses that don't match a seeded parcel get a "geo:lat,lon" ID.
    // Build a synthetic parcel from the coords so the dashboard still loads.
    if (id.startsWith("geo:")) {
      const parts = id.slice(4).split(",");
      const lat = parseFloat(parts[0] ?? "0");
      const lon = parseFloat(parts[1] ?? "0");
      const address = addressParam ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      const parcel: ParcelDetail = { id, address, state: "", lat, lon, score: -1, existing: false };
      startTransition(() => setState({ status: "ok", parcel }));
      saveRecent(id, address);
      return;
    }

    supabase
      .from("parcel")
      .select(
        "id, address_line1, state, latitude, longitude, score, has_existing_solar, year_built, sqft, assessed_value_usd, last_sale_date, last_sale_price_usd, primary_orientation",
      )
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setState({ status: "error", message: "Property not found." });
          return;
        }
        const row = data as {
          id: string;
          address_line1: string;
          state: string;
          latitude: number;
          longitude: number;
          score: number;
          has_existing_solar: boolean;
          year_built?: number;
          sqft?: number;
          assessed_value_usd?: number;
          last_sale_date?: string;
          last_sale_price_usd?: number;
          primary_orientation?: string;
        };
        const parcel: ParcelDetail = {
          id: row.id,
          address: row.address_line1,
          state: row.state,
          lat: row.latitude,
          lon: row.longitude,
          score: row.score ?? -1,
          existing: row.has_existing_solar ?? false,
          year_built: row.year_built,
          sqft: row.sqft,
          assessed_value_usd: row.assessed_value_usd,
          last_sale_date: row.last_sale_date,
          last_sale_price_usd: row.last_sale_price_usd,
          roof_orientation: row.primary_orientation,
        };
        setState({ status: "ok", parcel });
        saveRecent(parcel.id, parcel.address);
      });

    return () => {
      cancelled = true;
    };
  }, [id, addressParam]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <SubNav
        items={[
          { icon: "←", label: "Properties", to: "/properties" },
          { icon: "🗺", label: "Map", to: "/territory" },
          { icon: "🚶", label: "Walk", to: "/properties/walk" },
          { icon: "📝", label: "Notes", disabled: true },
        ]}
      />

      {state.status === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400 animate-pulse">
          Loading property…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-base font-semibold text-slate-700">{state.message}</p>
          <button
            type="button"
            onClick={() => navigate("/properties")}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            ← Back to Properties
          </button>
        </div>
      )}

      {state.status === "ok" && (
        <div className="relative flex-1 overflow-hidden">
          <ParcelDetailSheet
            parcel={state.parcel}
            onClose={() => navigate("/properties")}
            asPage={true}
          />
        </div>
      )}
    </div>
  );
}
