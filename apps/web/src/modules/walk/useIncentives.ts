// Walk module — incentives hook backed by the `incentives-fetch` Edge Function.
import { useEffect, useState } from "react";
import {
  IncentivesResponseSchema,
  type IncentivesResponse,
} from "@sunpath/shared";
import { supabase } from "@/lib/supabase.js";

interface State {
  loading: boolean;
  data: IncentivesResponse | null;
  error: string | null;
}

const INITIAL: State = { loading: false, data: null, error: null };

export function useIncentives(state: string | null): State {
  const [s, setState] = useState<State>(INITIAL);

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    (async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const { data, error } = await supabase.functions.invoke(
          "incentives-fetch",
          { body: { state } },
        );
        if (cancelled) return;
        if (error) {
          setState({ loading: false, data: null, error: error.message });
          return;
        }
        const parsed = IncentivesResponseSchema.safeParse(data);
        if (!parsed.success) {
          setState({
            loading: false,
            data: null,
            error: "incentives schema mismatch",
          });
          return;
        }
        setState({ loading: false, data: parsed.data, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({ loading: false, data: null, error: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  return s;
}
