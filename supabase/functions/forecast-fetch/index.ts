// forecast-fetch — Supabase Edge Function
//
// Fetches NOAA NWS forecast for a [lon, lat] point and returns a normalized
// WalkDayWeather payload. POC: no caching, no DB write — caller passes coords
// and gets back today's outlook. A future cron job will pre-warm by territory.
//
// Source: https://www.weather.gov/documentation/services-web-api
// No API key required. A descriptive User-Agent is mandatory.

// deno-lint-ignore-file no-explicit-any

const NWS_BASE = "https://api.weather.gov";
const USER_AGENT = "(sunpath.dev, hello@sunpath.dev)";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  lon: number;
  lat: number;
}

async function nwsFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    },
  });
  if (!res.ok) {
    throw new Error(`NWS ${res.status} ${res.statusText} on ${url}`);
  }
  return await res.json();
}

function deriveWalkability(period: any): number {
  // Crude v0 heuristic — 0..100, higher = better walking.
  let score = 80;
  const pop = period.probabilityOfPrecipitation?.value ?? 0;
  score -= pop * 0.6; // 100% pop → -60
  const windMatch = String(period.windSpeed ?? "").match(/(\d+)/);
  const wind = windMatch ? parseInt(windMatch[1], 10) : 0;
  if (wind > 15) score -= (wind - 15) * 1.5;
  const t = period.temperature ?? 70;
  if (t < 35 || t > 95) score -= 25;
  else if (t < 45 || t > 88) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405, headers: CORS_HEADERS });
  }
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON", { status: 400, headers: CORS_HEADERS });
  }
  const { lon, lat } = body;
  if (
    typeof lon !== "number" ||
    typeof lat !== "number" ||
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90
  ) {
    return new Response("invalid lon/lat", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  try {
    // 1. Resolve forecast office + grid for the point.
    const points = await nwsFetch(`${NWS_BASE}/points/${lat},${lon}`);
    const forecastUrl: string = points.properties.forecast;
    const alertsUrl = `${NWS_BASE}/alerts/active?point=${lat},${lon}`;

    // 2. Fetch forecast + active alerts in parallel.
    const [forecast, alerts] = await Promise.all([
      nwsFetch(forecastUrl),
      nwsFetch(alertsUrl),
    ]);

    const today = forecast.properties.periods[0];
    const tonight = forecast.properties.periods[1] ?? today;

    const out = {
      fetched_at: new Date().toISOString(),
      centroid: [lon, lat],
      date: today.startTime.slice(0, 10),
      high_f: today.isDaytime ? today.temperature : tonight.temperature,
      low_f: today.isDaytime ? tonight.temperature : today.temperature,
      precip_chance_pct: today.probabilityOfPrecipitation?.value ?? 0,
      wind_mph_max: parseInt(
        String(today.windSpeed).match(/(\d+)/)?.[1] ?? "0",
        10,
      ),
      short_forecast: today.shortForecast,
      alerts: (alerts.features ?? []).map((f: any) => ({
        event: f.properties.event,
        severity: f.properties.severity ?? "Unknown",
        headline: f.properties.headline ?? f.properties.event,
        ends: f.properties.ends ?? undefined,
      })),
      walkability: deriveWalkability(today),
    };

    return new Response(JSON.stringify(out), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }
});
