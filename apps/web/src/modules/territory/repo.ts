// Territory module — parcel queries against Supabase.
// Pure transforms (pinsToGeoJSON, ParcelPin) live in pins.ts so they
// can be unit-tested without env-var-bound supabase client.
import { supabase } from "@/lib/supabase.js";
import type { ParcelPin } from "./pins.js";

export type { ParcelPin } from "./pins.js";
export { pinsToGeoJSON } from "./pins.js";

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
