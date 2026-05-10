// Territory module — parcel queries against Supabase.
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
    features: pins.map((p) => ({
      type: "Feature",
      id: p.id,
      properties: {
        id: p.id,
        address: p.address_line1,
        existing: p.has_existing_solar ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}
