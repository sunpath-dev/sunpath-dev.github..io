// Walk-day forecast — calls the `forecast-fetch` Edge Function.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";
import { WalkDayWeatherSchema, type WalkDayWeather } from "@sunpath/shared";

interface State {
  loading: boolean;
  data: WalkDayWeather | null;
  error: string | null;
}

const initial: State = { loading: false, data: null, error: null };

/**
 * Fetches today's NOAA forecast for the given point. Re-fetches when the
 * coords drift more than ~1 km (avoids hammering the function on every
 * geolocation tick). Returns null until both coords and a result are present.
 */
export function useWalkDayForecast(
  point: { lat: number; lon: number } | null,
): State {
  const [state, setState] = useState<State>(initial);

  useEffect(() => {
    if (!point) return;
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data, error } = await supabase.functions.invoke(
          "forecast-fetch",
          { body: { lon: point.lon, lat: point.lat } },
        );
        if (cancelled) return;
        if (error) {
          setState({ loading: false, data: null, error: error.message });
          return;
        }
        const parsed = WalkDayWeatherSchema.safeParse(data);
        if (!parsed.success) {
          setState({
            loading: false,
            data: null,
            error: `bad payload: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          });
          return;
        }
        setState({ loading: false, data: parsed.data, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // round to 0.01° (~1 km) to coalesce nearby geolocation ticks
  }, [point && Math.round(point.lat * 100), point && Math.round(point.lon * 100)]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
