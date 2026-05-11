import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeoResult {
  county: string;
  state: string;
  state_fips: string;
  county_fips: string;
}

// US FIPS codes for common states
const STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

const STATE_FIPS: Record<string, string> = {
  "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
  "CT": "09", "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15",
  "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
  "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
  "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
  "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
  "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
  "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
  "WV": "54", "WI": "55", "WY": "56",
};

async function nominatimReverse(lat: number, lon: number): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Sunpath/1.0 (sunpath.dev; contact@sunpath.dev)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) return null;
  const json = await resp.json() as {
    address?: {
      county?: string;
      state?: string;
      state_code?: string;
      county_code?: string;
    };
  };
  const addr = json.address;
  if (!addr) return null;

  const stateName = addr.state ?? "";
  const stateAbbr = addr.state_code?.toUpperCase() ?? STATE_ABBR[stateName] ?? "";
  const stateFips = STATE_FIPS[stateAbbr] ?? "";
  // County names often come with " County" suffix — strip it for display
  const rawCounty = addr.county ?? "";
  const county = rawCounty.replace(/\s+County$/i, "").replace(/\s+Parish$/i, "").trim();

  if (!county || !stateAbbr) return null;

  // US Census Geocoder fallback to get county FIPS
  // We'll derive it from the Census API if we have state_fips
  let countyFips = "";
  if (stateFips) {
    try {
      const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
      const censusResp = await fetch(censusUrl, {
        headers: { "User-Agent": "Sunpath/1.0 (sunpath.dev)" },
      });
      if (censusResp.ok) {
        const censusJson = await censusResp.json() as {
          result?: {
            geographies?: {
              Counties?: Array<{ COUNTY: string }>;
            };
          };
        };
        const counties = censusJson.result?.geographies?.Counties;
        if (Array.isArray(counties) && counties.length > 0) {
          countyFips = counties[0]?.COUNTY ?? "";
        }
      }
    } catch {
      // Census geocoder unavailable — county FIPS will be empty
    }
  }

  return {
    county: county || rawCounty,
    state: stateAbbr,
    state_fips: stateFips,
    county_fips: countyFips,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json() as { lat?: number; lon?: number };
    const lat = Number(body.lat);
    const lon = Number(body.lon);

    if (!isFinite(lat) || !isFinite(lon)) {
      return new Response(JSON.stringify({ error: "lat and lon are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const result = await nominatimReverse(lat, lon);
    if (!result) {
      // Return a default so the client doesn't break
      return new Response(
        JSON.stringify({ county: "Unknown County", state: "US", state_fips: "", county_fips: "" }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
