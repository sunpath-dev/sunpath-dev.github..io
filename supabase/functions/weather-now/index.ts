// weather-now — current conditions + forecast for the Today dashboard.
// Returns temp_f (current), high/low, wind, precip, sunrise/sunset.
// Source: NOAA NWS (no API key required, User-Agent mandatory).

// deno-lint-ignore-file no-explicit-any

const NWS_BASE = "https://api.weather.gov";
const UA = "(sunpath.dev, hello@sunpath.dev)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function nwsGet(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/geo+json" },
  });
  if (!r.ok) throw new Error(`NWS ${r.status} on ${url}`);
  return r.json();
}

/** Simplified sunrise/sunset (USNO algorithm, accurate to ~1 min). */
function sunTimes(
  lat: number,
  lon: number,
  date: Date,
): { sunrise: Date; sunset: Date } | null {
  const J = date.getTime() / 86400000 + 2440587.5;
  const n = Math.ceil(J - 2451545.0 - 0.0009 + lon / 360);
  const Js = 2451545.0 + 0.0009 - lon / 360 + n;
  const M = ((357.5291 + 0.98560028 * (Js - 2451545)) % 360 + 360) % 360;
  const Mr = (M * Math.PI) / 180;
  const C =
    1.9148 * Math.sin(Mr) +
    0.02 * Math.sin(2 * Mr) +
    0.0003 * Math.sin(3 * Mr);
  const L = ((M + C + 180 + 102.9372) % 360 + 360) % 360;
  const Lr = (L * Math.PI) / 180;
  const JT =
    Js +
    0.0053 * Math.sin(Mr) -
    0.0069 * Math.sin(2 * Lr);
  const decl = Math.asin(Math.sin(Lr) * Math.sin((23.45 * Math.PI) / 180));
  const latr = (lat * Math.PI) / 180;
  const cosH =
    (Math.sin((-0.833 * Math.PI) / 180) -
      Math.sin(latr) * Math.sin(decl)) /
    (Math.cos(latr) * Math.cos(decl));
  if (Math.abs(cosH) > 1) return null;
  const H = (Math.acos(cosH) * 180) / Math.PI;
  const toDate = (jd: number) => new Date((jd - 2440587.5) * 86400000);
  return {
    sunrise: toDate(JT - H / 360),
    sunset: toDate(JT + H / 360),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405, headers: CORS });
  }

  let body: { lat: number; lon: number };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON", { status: 400, headers: CORS });
  }
  const { lat, lon } = body;
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return new Response("invalid lat/lon", { status: 400, headers: CORS });
  }

  try {
    const points = await nwsGet(`${NWS_BASE}/points/${lat},${lon}`);
    const { forecastHourly, forecast: forecastUrl } = points.properties;

    const [hourly, daily] = await Promise.all([
      nwsGet(forecastHourly),
      nwsGet(forecastUrl),
    ]);

    const now = hourly.properties.periods[0];
    const today = daily.properties.periods.find(
      (p: any) => p.isDaytime,
    ) ?? daily.properties.periods[0];
    const tonight = daily.properties.periods.find(
      (p: any) => !p.isDaytime,
    ) ?? daily.properties.periods[1] ?? today;

    // Wind direction from hourly (e.g. "NW", "S")
    const windDir: string = now.windDirection ?? "";
    const windMphMatch = String(now.windSpeed ?? "").match(/(\d+)/);
    const windMph = windMphMatch ? parseInt(windMphMatch[1], 10) : 0;

    const sun = sunTimes(lat, lon, new Date());

    const out = {
      temp_f: now.temperature as number,
      short_forecast: now.shortForecast as string,
      wind_mph: windMph,
      wind_dir: windDir,
      high_f: today.isDaytime ? (today.temperature as number) : (tonight.temperature as number),
      low_f: today.isDaytime ? (tonight.temperature as number) : (today.temperature as number),
      precip_chance_pct:
        (today.probabilityOfPrecipitation?.value as number | null) ?? 0,
      sunrise: sun?.sunrise.toISOString() ?? null,
      sunset: sun?.sunset.toISOString() ?? null,
    };

    return new Response(JSON.stringify(out), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
