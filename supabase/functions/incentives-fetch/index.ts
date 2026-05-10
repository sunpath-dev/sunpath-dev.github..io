// incentives-fetch — Supabase Edge Function
//
// Returns a normalized list of solar incentives applicable to the given
// state (and optionally postal code). Falls back to a curated list of
// federal/state programs when DSIRE_API_KEY is not configured, so this
// works in POC-mode without any key.
//
// Source: https://programs.dsireusa.org/  (API access requires signup)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Incentive {
  id: string;
  name: string;
  scope: "federal" | "state" | "utility" | "local";
  state?: string;
  summary: string;
  kind:
    | "tax_credit"
    | "rebate"
    | "loan"
    | "exemption"
    | "performance_payment"
    | "grant"
    | "other";
  max_benefit_usd: number | null;
  benefit_pct: number | null;
  expires_on: string | null;
  source_url: string;
}

const FEDERAL: Incentive[] = [
  {
    id: "fed:itc",
    name: "Residential Clean Energy Credit (federal ITC)",
    scope: "federal",
    summary:
      "30% federal income-tax credit on qualified residential solar costs through 2032; 26% in 2033; 22% in 2034.",
    kind: "tax_credit",
    max_benefit_usd: null,
    benefit_pct: 30,
    expires_on: "2032-12-31",
    source_url:
      "https://www.irs.gov/credits-deductions/residential-clean-energy-credit",
  },
];

// Curated state list — extend as we onboard each market.
const BY_STATE: Record<string, Incentive[]> = {
  VA: [
    {
      id: "va:net-metering",
      name: "Virginia Net Metering",
      scope: "state",
      state: "VA",
      summary:
        "Eligible residential systems up to 25 kW receive bill credits for excess generation exported to the grid.",
      kind: "performance_payment",
      max_benefit_usd: null,
      benefit_pct: null,
      expires_on: null,
      source_url:
        "https://www.scc.virginia.gov/pages/Net-Energy-Metering",
    },
    {
      id: "va:solar-property-exemption",
      name: "Virginia Solar Energy Equipment Property Tax Exemption",
      scope: "state",
      state: "VA",
      summary:
        "Localities may exempt residential solar equipment from local property tax — Scott County participation varies.",
      kind: "exemption",
      max_benefit_usd: null,
      benefit_pct: null,
      expires_on: null,
      source_url:
        "https://law.lis.virginia.gov/vacode/title58.1/chapter36/section58.1-3661/",
    },
  ],
  TN: [
    {
      id: "tn:green-energy-property-tax",
      name: "Tennessee Green Energy Property Tax Assessment",
      scope: "state",
      state: "TN",
      summary:
        "Solar installations are assessed for property-tax purposes at no more than 12.5% of installed cost.",
      kind: "exemption",
      max_benefit_usd: null,
      benefit_pct: null,
      expires_on: null,
      source_url:
        "https://www.tn.gov/environment/program-areas/eep-energy-efficiency-programs.html",
    },
  ],
};

function fallback(state: string): Incentive[] {
  const upper = state.toUpperCase();
  const stateRows = BY_STATE[upper] ?? [];
  return [...FEDERAL, ...stateRows];
}

interface RequestBody {
  state: string;
  postal_code?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (typeof body.state !== "string" || body.state.length !== 2) {
    return Response.json(
      { error: "state (2-letter) is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const stateUpper = body.state.toUpperCase();

  // Live DSIRE API integration — opt-in via env. The exact endpoint
  // shape depends on the DSIRE access tier; left as a TODO for now.
  // const apiKey = Deno.env.get("DSIRE_API_KEY");
  // if (apiKey) { ... }

  const programs = fallback(stateUpper);
  const payload = {
    state: stateUpper,
    fetched_at: new Date().toISOString(),
    is_fallback: true,
    programs,
  };
  return Response.json(payload, { headers: CORS_HEADERS });
});
