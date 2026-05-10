// Pure transform from ParcelPin → GeoJSON for the territory map layer.
// Lives apart from `repo.ts` so it can be unit-tested without pulling
// the supabase client (which requires env vars).
import type { RoofOrientation } from "@sunpath/shared";
import { scoreParcel } from "@sunpath/shared";

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
  /** Pre-computed score from score_snapshot (preferred over client compute). */
  score?: number | null;
  excluded_reason?: string | null;
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

export function pinsToGeoJSON(pins: ParcelPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => {
      // Prefer the precomputed snapshot when present (server-authoritative);
      // otherwise compute on the fly from the available fields.
      let score: number | null;
      if (p.score !== undefined && p.score !== null) {
        score = p.score;
      } else if (p.excluded_reason) {
        score = null;
      } else {
        const result = scoreParcel({
          ownerOccupied: p.owner_occupied,
          estAnnualKwh: null,
          roofOrientation: normOrientation(p.primary_orientation),
          hasExistingSolar: p.has_existing_solar,
          assessedValue:
            p.assessed_value_usd !== null
              ? Number(p.assessed_value_usd)
              : null,
          yearBuilt: p.year_built,
          neighborPermitCount: 0,
          recentRateHike: false,
          recentlySold: false,
        });
        score = result.score;
      }
      return {
        type: "Feature",
        id: p.id,
        properties: {
          id: p.id,
          address: p.address_line1,
          existing: p.has_existing_solar ? 1 : 0,
          score: score ?? -1,
          owner_occ: p.owner_occupied === true ? 1 : 0,
        },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      };
    }),
  };
}
