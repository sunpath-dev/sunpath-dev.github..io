// Territory module — parcel queries against Supabase.
import type { RoofOrientation } from "@sunpath/shared";
import { scoreParcel } from "@sunpath/shared";
import { supabase } from "@/lib/supabase.js";

export interface ParcelPin {
  id: string;
  external_id: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  lon: number;
  lat: number;
  has_existing_solar: boolean;
  owner_occupied: boolean | null;
  assessed_value_usd: number | null;
  year_built: number | null;
  primary_orientation: string | null;
}

const ORIENTATIONS: ReadonlySet<string> = new Set([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
  "unknown",
]);

function normOrientation(v: string | null): RoofOrientation | null {
  if (!v) return null;
  return ORIENTATIONS.has(v) ? (v as RoofOrientation) : null;
}

export async function fetchParcelsInBbox(
  bbox: [number, number, number, number],
  maxRows = 2000,
): Promise<ParcelPin[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const { data, error } = await supabase.rpc("parcels_in_bbox", {
    min_lon: minLon,
    min_lat: minLat,
    max_lon: maxLon,
    max_lat: maxLat,
    max_rows: maxRows,
  });
  if (error) {
    console.warn("[territory] parcels_in_bbox failed:", error.message);
    return [];
  }
  return (data ?? []) as ParcelPin[];
}

export function pinsToGeoJSON(pins: ParcelPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => {
      const result = scoreParcel({
        ownerOccupied: p.owner_occupied,
        estAnnualKwh: null,
        roofOrientation: normOrientation(p.primary_orientation),
        hasExistingSolar: p.has_existing_solar,
        assessedValue:
          p.assessed_value_usd !== null ? Number(p.assessed_value_usd) : null,
        yearBuilt: p.year_built,
        neighborPermitCount: 0,
        recentRateHike: false,
        recentlySold: false,
      });
      return {
        type: "Feature",
        id: p.id,
        properties: {
          id: p.id,
          address: p.address_line1,
          existing: p.has_existing_solar ? 1 : 0,
          score: result.score ?? -1,
        },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      };
    }),
  };
}
