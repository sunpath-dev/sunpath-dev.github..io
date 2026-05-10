# forecast-fetch

NOAA NWS forecast lookup for a point. POST `{ "lon": -82.59, "lat": 36.71 }` →
returns a normalized `WalkDayWeather` payload (see `packages/shared/src/schemas/weather.ts`).

- **Source:** [api.weather.gov](https://api.weather.gov) — free, no key, US Gov data.
- **Auth:** none. NWS requires a descriptive `User-Agent` header (set in `index.ts`).
- **Rate limit:** generous; if hit, retry after ~5s. Cache aggressively in the future cron version.

Local invocation:

```sh
supabase functions serve forecast-fetch
curl -X POST http://localhost:54321/functions/v1/forecast-fetch \
  -H 'Content-Type: application/json' \
  -d '{"lon": -82.59, "lat": 36.71}'
```
