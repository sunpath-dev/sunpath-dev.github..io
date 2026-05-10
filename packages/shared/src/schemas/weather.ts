import { z } from "zod";

/**
 * NOAA NWS forecast — narrowed to the fields we actually use.
 * Full schema: https://api.weather.gov/openapi.json
 */
export const NwsPeriodSchema = z.object({
  number: z.number().int(),
  name: z.string(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  isDaytime: z.boolean(),
  temperature: z.number(),
  temperatureUnit: z.enum(["F", "C"]),
  windSpeed: z.string(),
  windDirection: z.string().optional(),
  shortForecast: z.string(),
  detailedForecast: z.string().optional(),
  probabilityOfPrecipitation: z
    .object({
      unitCode: z.string(),
      value: z.number().nullable(),
    })
    .optional(),
});
export type NwsPeriod = z.infer<typeof NwsPeriodSchema>;

export const NwsForecastSchema = z.object({
  properties: z.object({
    updated: z.string().datetime({ offset: true }),
    periods: z.array(NwsPeriodSchema),
  }),
});
export type NwsForecast = z.infer<typeof NwsForecastSchema>;

/**
 * Sunpath-internal walk-day forecast — the simplified shape the UI consumes.
 */
export const WalkDayWeatherSchema = z.object({
  fetched_at: z.string().datetime(),
  centroid: z.tuple([z.number(), z.number()]), // [lon, lat]
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  high_f: z.number(),
  low_f: z.number(),
  precip_chance_pct: z.number().min(0).max(100),
  wind_mph_max: z.number().nonnegative(),
  sunrise: z.string().datetime(),
  sunset: z.string().datetime(),
  short_forecast: z.string(),
  alerts: z.array(
    z.object({
      event: z.string(),
      severity: z.enum(["Minor", "Moderate", "Severe", "Extreme", "Unknown"]),
      headline: z.string(),
      ends: z.string().datetime().optional(),
    }),
  ),
  /** Heuristic walk-quality score 0-100 — used to sort/highlight walk lists. */
  walkability: z.number().min(0).max(100),
});
export type WalkDayWeather = z.infer<typeof WalkDayWeatherSchema>;
