# Sunpath — External API Reference

Every third-party data source Sunpath integrates with. All calls go through Supabase Edge Functions — no API keys ever reach the browser.

---

## NOAA National Weather Service (NWS)

**Base URL:** `https://api.weather.gov`  
**Auth:** None — `User-Agent` header required (`User-Agent: sunpath/1.0 support@sunpath.dev`)  
**Rate limit:** Unofficial ~1 req/sec per IP, no published hard cap  
**Edge function(s):** `weather-now`, `weather-forecast`

### Endpoints used

| Endpoint | What we get | UI location |
|---|---|---|
| `/points/{lat},{lon}` | Resolves lat/lon to NWS grid ID and zone | Internal lookup, not displayed |
| `/gridpoints/{office}/{x},{y}/forecast` | 12-period daily forecast (high/low, short_forecast, precip) | Home → Full Forecast card |
| `/gridpoints/{office}/{x},{y}/forecast/hourly` | Hourly temperature + wind + precip for next 48h | Home → Walk Window card |
| `/alerts/active?point={lat},{lon}` | Active weather alerts for that point | Home → header alert badge |
| `/points/{lat},{lon}` → `observationStations` → first station `/observations/latest` | Current temp, wind, conditions | Home → current weather strip |

### Fields we use

```
temperature.value (°C → convert to °F)
windSpeed.value (km/h → convert to mph)
windDirection.value (degrees → compass label)
shortForecast (text: "Partly Cloudy", "Chance Rain", etc.)
probabilityOfPrecipitation.value (%)
dewpoint.value (°C) — for heat index / comfort calc
startTime / endTime — for walk window logic
event (alert type: "Tornado Warning", "Heat Advisory", etc.)
```

### Walk window logic

Walk window = contiguous hourly blocks where:
- Temp 40–95°F
- Precip chance ≤ 30%
- Wind ≤ 25 mph
- No active severe alert

### Fallback behavior

If NWS is unavailable, the weather card shows "Weather unavailable" and the walk window collapses. No fallback to another weather provider currently (OpenWeather One Call 3.0 is paid; deferred).

---

## NREL PVWatts v8

**Base URL:** `https://developer.nrel.gov/api/pvwatts/v8.json`  
**Auth:** API key (`NREL_API_KEY` Supabase secret)  
**Rate limit:** 1,000 req/day on free tier; 10,000/day on NREL developer account  
**Edge function(s):** `solar-estimate`

### Parameters we send

```
api_key, system_capacity (kW, 6kW default), module_type (1 = premium),
losses (14), array_type (1 = fixed open rack), tilt (20), azimuth (180 = south),
lat, lon
```

### Fields we use

| Field | Value | UI location |
|---|---|---|
| `ac_annual` | kWh/year AC output | Property → Solar Estimate card |
| `ac_monthly[]` | Monthly kWh breakdown | Property → Solar chart (planned) |
| `solrad_annual` | Average daily sun hours/kWh/m² | Property → "X peak sun hours/day" |
| `station_info.distance` | km from nearest station | Property → data source footnote |

### Calculation chain

```
ac_annual (kWh/yr)
× utility_rate ($/kWh from EIA)
= annual_savings ($)

(system_cost_$ − 0.30 × system_cost_$) / annual_savings
= payback_years

annual_savings × 25 − net_cost_after_itc
= 25yr_net_savings ($)
```

---

## NREL Solar Resource Data v1

**Base URL:** `https://developer.nrel.gov/api/solar/solar_resource/v1.json`  
**Auth:** Same NREL API key  
**Rate limit:** Same as PVWatts  
**Edge function(s):** `solar-estimate` (combined call)

### Fields we use

| Field | Value | UI location |
|---|---|---|
| `outputs.avg_dni.annual` | Direct Normal Irradiance kWh/m²/day | Property → Energy section "peak sun hours" |
| `outputs.avg_ghi.annual` | Global Horizontal Irradiance | Internal scoring |

---

## EIA Open Data v2

**Base URL:** `https://api.eia.gov/v2`  
**Auth:** API key (`EIA_API_KEY` Supabase secret)  
**Rate limit:** No published limit; 5,000/day soft cap observed  
**Edge function(s):** `utility-rate`

### Endpoints used

| Endpoint | What we get | UI location |
|---|---|---|
| `/electricity/retail-sales/data` filtered by `sectorName=residential&stateid={ST}` | Monthly residential retail electricity data by state | Property → "VA avg: X ¢/kWh" |

### Fields we use

```
data[].price (cents/kWh) — most recent month
data[].sales (million kWh) — for YoY trend calc
period (YYYY-MM)
```

### YoY trend logic

Compare most recent 12 months vs. prior 12 months. If increase > 8%, trigger a "rate hike" `trigger_event` for that state.

---

## US Census Bureau — ACS 5-Year

**Base URL:** `https://api.census.gov/data/{year}/acs/acs5`  
**Auth:** API key (`CENSUS_API_KEY` Supabase secret)  
**Rate limit:** 500 req/day without key; 500 req/day with key (same); higher limits available  
**Edge function(s):** `area-intel`

### Variables we request

| Variable | Description | UI location |
|---|---|---|
| `B25003_002E / B25003_001E` | Owner-occupied housing units / total | Property → Area Context "% owner-occupied" |
| `B19013_001E` | Median household income ($) | Property → Area Context "Median income" |
| `B25077_001E` | Median home value ($) | Property → Area Context "Median home value" |
| `B19001_001E` | Total households for energy burden calc | Internal |

### Geographic level

`for=county:{FIPS5}&in=state:{FIPS2}` — county level. FIPS codes resolved via `geo-reverse` edge function (GPS → Census Geocoder → FIPS).

---

## US Census Geocoder

**Base URL:** `https://geocoding.geo.census.gov/geocoder/geographies/coordinates`  
**Auth:** None  
**Rate limit:** Unofficial ~10 req/sec  
**Edge function(s):** `geo-reverse`

### Parameters

```
x (longitude), y (latitude), benchmark=Public_AR_Current, vintage=Current_Current, layers=Counties, format=json
```

### Fields we use

```
result.geographies.Counties[0].STATE (2-digit FIPS)
result.geographies.Counties[0].COUNTY (3-digit FIPS)
result.geographies.Counties[0].NAME (e.g., "Scott County")
```

Used to drive the `area-intel` call and the Home dashboard "You are in Scott County, VA" label.

---

## Nominatim (OpenStreetMap)

**Base URL:** `https://nominatim.openstreetmap.org/reverse`  
**Auth:** None — `User-Agent` header required  
**Rate limit:** 1 req/sec hard limit  
**Edge function(s):** `geo-reverse` (parallel with Census Geocoder; whichever returns first wins)

### Parameters

```
lat, lon, format=jsonv2, zoom=10
```

### Fields we use

```
address.county (e.g., "Scott County")
address.state (e.g., "Virginia")
address.state_code (e.g., "VA")
```

Fallback when Census Geocoder times out or returns no county. Also used for county name display (Census returns FIPS, Nominatim returns human name).

---

## ArcGIS World Geocoding Service

**Base URL:** `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates`  
**Auth:** None (public endpoint)  
**Rate limit:** ~100 req/min on public endpoint  
**Edge function(s):** `geocode-address` (called from AddressSearch component via the edge function)

### Parameters

```
SingleLine={address}, outSR=4326, f=json, maxLocations=5, outFields=Match_addr,Addr_type,Score
```

### Fields we use

```
candidates[].location.x (longitude)
candidates[].location.y (latitude)
candidates[].attributes.Match_addr (normalized full address)
candidates[].score (0–100 geocode confidence)
```

Used by the map address search bar. We filter to `score >= 80`. Rural SW Virginia coverage is excellent (reason ArcGIS was chosen over Google Maps Geocoding API which requires billing).

---

## DSIRE (Database of State Incentives for Renewables & Efficiency)

**Base URL:** `https://api.dsireusa.org/v1`  
**Auth:** API key (`DSIRE_API_KEY` Supabase secret)  
**Rate limit:** Not published; treated as 10 req/sec  
**Edge function(s):** `incentives-fetch`

### Endpoints used

| Endpoint | What we get | UI location |
|---|---|---|
| `/programs?state={ST}&technology=Solar+Photovoltaics` | State solar incentive programs | Property → Incentives card |

### Fields we use

```
name (incentive program name)
type (Tax Credit, Rebate, Grant, Net Metering, etc.)
implementing_sector (State, Utility, Local)
end_date (expiration — shows countdown if < 12 months)
summary (1–2 sentence description)
websiteUrl (link for "Learn more")
```

### Fallback

If DSIRE key not set or call fails, show hardcoded federal ITC (30% through 2032) + a Virginia-specific stub. Tennessee stub also available for future use.

---

## OpenStreetMap Overpass API

**Base URL:** `https://overpass-api.de/api/interpreter`  
**Auth:** None  
**Rate limit:** 1–2 concurrent requests; avoid > 10k element responses  
**Edge function(s):** `solar-rooftop` (Overpass fallback), `nearby-permits`

### Queries we run

**Building footprint for a parcel:**
```overpassql
[out:json];
way(around:50, {lat}, {lon})[building];
out geom;
```
Used to get `roof_area_m2` and orientation. If Google Solar API key is set, this is bypassed.

**Nearby solar permits (within 0.25 mi):**
```overpassql
[out:json];
node(around:400, {lat}, {lon})[generator:source=solar];
out;
```
Used to count `nearby_solar_permits` for the Property dashboard and trigger rewarm events.

### Fields we use

Building footprint: `geometry[]` (polygon vertices → area via shoelace formula), `tags.building:orientation` (if present)

Solar nodes: `id`, `lat`, `lon` — count of results = `nearby_permits`

---

## Supabase Edge Runtime (internal)

Not an external API, but documented here because admins need to understand the routing.

| Edge Function | Calls | Triggered by |
|---|---|---|
| `weather-now` | NOAA NWS (current obs) | Home dashboard load |
| `weather-forecast` | NOAA NWS (forecast + alerts) | Home dashboard load |
| `solar-estimate` | NREL PVWatts v8 + Solar Resource | Property detail → Energy section |
| `utility-rate` | EIA v2 | Property detail → Solar estimate calc |
| `area-intel` | Census ACS 5-yr | Property detail → Area Context, Home → Area Intel card |
| `geo-reverse` | Census Geocoder + Nominatim | Any GPS fix (Home, Map, Walk) |
| `incentives-fetch` | DSIRE | Property detail → Incentives section |
| `geocode-address` | ArcGIS World Geocoder | Address search bar |
| `solar-rooftop` | Overpass API | Property detail → Roof Analysis (if no Google Solar key) |
| `nearby-permits` | Overpass API + `parcel` table | Property detail → Neighborhood Proof |
| `request-access` | — (writes to `rep_access_request`) | Public sign-up form |
| `approve-access` | — (writes to `rep` + `rep_access_request`) | Admin panel |
| `invite-create` | — (writes to `rep_invite`) | Admin panel |
| `invite-accept` | — (writes to `rep` + `rep_invite`) | Invite link |
| `push-send` | Web Push (VAPID) | Daily rewarm cron + trigger events |

---

## Rate limit summary

| API | Limit | Notes |
|---|---|---|
| NOAA NWS | ~1 req/sec | Unofficial; burst OK, sustained polling risky |
| NREL PVWatts | 1,000/day free | Cache per `(lat, lon, system_capacity)` |
| NREL Solar Resource | 1,000/day (shared with PVWatts) | Cache aggressively |
| EIA v2 | ~5,000/day | Daily batch acceptable |
| Census ACS | 500/day | Cache per county FIPS |
| Census Geocoder | ~10 req/sec | Per-request; no daily limit |
| Nominatim | 1 req/sec hard | Enforce in edge fn |
| ArcGIS Geocoder | ~100/min | Per address search; user-paced |
| DSIRE | ~10 req/sec | Cache per state |
| Overpass | 1–2 concurrent | Heavy queries may timeout; retry once |

---

## Adding a new API

1. Create a new edge function in `supabase/functions/<name>/index.ts`
2. Add the API key as a Supabase secret: `supabase secrets set MY_KEY=xxx`
3. Add to the verified sources table in `plan.md`
4. Add a row to the function table above
5. Call it from the frontend only through the edge function — never directly from the browser
6. Add a Zod schema in `packages/shared/src/schemas/` for the response shape
