#!/usr/bin/env node
/**
 * Parcel ingest CLI.
 *
 * Pulls parcels from a county adapter and upserts them into Supabase via the
 * service role key. NEVER ship this script's output to the browser — it uses
 * the service-role key from `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Usage:
 *   pnpm tsx scripts/ingest-parcels.ts --adapter scott-va [--limit 5000] [--dry-run]
 *
 * Supported adapters (SW Virginia via VGIN VA_Address_Points statewide layer):
 *   scott-va, russell-va, washington-va, smyth-va, wythe-va, tazewell-va,
 *   buchanan-va, dickenson-va, giles-va, grayson-va, lee-va, montgomery-va,
 *   pulaski-va, roanoke-va, wise-va
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   VGIN_ADDRESSES_URL — override the FeatureServer URL.
 */
import { createClient } from "@supabase/supabase-js";
import {
  createScottCountyVaAdapter,
  scottCountyVaAdapter,
  fetchArcGisFeatures,
  type ArcGisFeature,
} from "@sunpath/parcel-adapters";
import type { ParcelAdapter, Parcel, ParcelRaw } from "@sunpath/shared";

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

interface Args {
  adapter: string;
  limit: number;
  dryRun: boolean;
}

const DEFAULT_VGIN_ADDRESSES_URL =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Address_Points/FeatureServer/0";

// Map adapter slug → { stateFips, countyFips, countyName }
const SW_VA_COUNTIES: Record<string, { countyFips: string; countyName: string }> = {
  "scott-va":      { countyFips: "169", countyName: "Scott County" },
  "russell-va":    { countyFips: "167", countyName: "Russell County" },
  "washington-va": { countyFips: "191", countyName: "Washington County" },
  "smyth-va":      { countyFips: "173", countyName: "Smyth County" },
  "wythe-va":      { countyFips: "197", countyName: "Wythe County" },
  "tazewell-va":   { countyFips: "185", countyName: "Tazewell County" },
  "buchanan-va":   { countyFips: "027", countyName: "Buchanan County" },
  "dickenson-va":  { countyFips: "051", countyName: "Dickenson County" },
  "giles-va":      { countyFips: "071", countyName: "Giles County" },
  "grayson-va":    { countyFips: "077", countyName: "Grayson County" },
  "lee-va":        { countyFips: "105", countyName: "Lee County" },
  "montgomery-va": { countyFips: "121", countyName: "Montgomery County" },
  "pulaski-va":    { countyFips: "155", countyName: "Pulaski County" },
  "roanoke-va":    { countyFips: "161", countyName: "Roanoke County" },
  "wise-va":       { countyFips: "195", countyName: "Wise County" },
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  const out: Args = { adapter: "scott-va", limit: Infinity, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--adapter") out.adapter = argv[++i] ?? out.adapter;
    else if (a === "--limit") out.limit = Number(argv[++i] ?? out.limit);
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generic VA county adapter (VGIN VA_Address_Points, any county by FIPS)
// ---------------------------------------------------------------------------

function formatZip(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n).padStart(5, "0");
}

function createVaCountyAdapter(countyFips: string, countyName: string): ParcelAdapter {
  const fipsFull = `51${countyFips}`;
  const endpoint = process.env.VGIN_ADDRESSES_URL ?? DEFAULT_VGIN_ADDRESSES_URL;
  return {
    meta: {
      source: `VGIN VA_Address_Points (${countyName}, FIPS ${fipsFull})`,
      stateFips: "51",
      countyFips,
    },
    fetchAll() {
      return fetchArcGisFeatures({
        url: endpoint,
        where: `FIPS = '${fipsFull}'`,
      });
    },
    normalize(raw: ParcelRaw): Parcel | null {
      const feature = raw as unknown as ArcGisFeature;
      const props = feature?.properties ?? {};
      const externalId = props["ADDPTKEY"];
      if (!externalId) return null;
      const fullAddr = props["FULLADDR"];
      if (!fullAddr || typeof fullAddr !== "string" || !fullAddr.trim()) return null;
      const rawCity =
        (props["PO_NAME"] as string | undefined)?.trim() ||
        (props["MUNICIPALITY"] as string | undefined)?.trim() ||
        countyName;
      const postal = formatZip(props["ZIP_5"]);
      if (!postal) return null;
      const geom = feature.geometry;
      if (!geom || geom.type !== "Point") return null;
      const [lon, lat] = geom.coordinates as [number, number];
      if (!isFinite(lon) || !isFinite(lat)) return null;
      return {
        external_id: String(externalId),
        state_fips: "51",
        county_fips: countyFips,
        address_line1: fullAddr.trim(),
        city: rawCity,
        state: "VA",
        postal_code: postal,
        centroid: { type: "Point" as const, coordinates: [lon, lat] as [number, number] },
        has_existing_solar: false,
        primary_orientation: "unknown" as const,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function pickAdapter(name: string): ParcelAdapter {
  if (name === "scott-va") {
    const endpoint = process.env.VGIN_ADDRESSES_URL ?? process.env.VGIN_PARCELS_URL;
    return endpoint
      ? createScottCountyVaAdapter({ endpoint })
      : scottCountyVaAdapter;
  }
  const county = SW_VA_COUNTIES[name];
  if (county) {
    return createVaCountyAdapter(county.countyFips, county.countyName);
  }
  throw new Error(
    `Unknown adapter: ${name}. Valid options: ${Object.keys(SW_VA_COUNTIES).join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const adapter = pickAdapter(args.adapter);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).",
    );
  }

  const supabase =
    !args.dryRun && supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  console.log(`[ingest] adapter=${args.adapter} dryRun=${args.dryRun}`);
  console.log(`[ingest] source=${adapter.meta.source}`);

  let seen = 0;
  let kept = 0;
  let upserted = 0;
  let batch: ReturnType<ParcelAdapter["normalize"]>[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch.filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) {
      batch = [];
      return;
    }
    if (supabase) {
      const payload = rows.map((r) => ({
        external_id: r.external_id,
        state_fips: r.state_fips,
        county_fips: r.county_fips,
        address_line1: r.address_line1,
        address_line2: r.address_line2 ?? null,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        centroid: `SRID=4326;POINT(${r.centroid.coordinates[0]} ${r.centroid.coordinates[1]})`,
        primary_orientation: r.primary_orientation,
        year_built: r.year_built ?? null,
        assessed_value_usd: r.assessed_value_usd ?? null,
        has_existing_solar: r.has_existing_solar,
      }));
      const { error } = await supabase
        .from("parcel")
        .upsert(payload, { onConflict: "state_fips,county_fips,external_id" });
      if (error) {
        console.error("[ingest] upsert failed:", error.message);
      } else {
        upserted += rows.length;
      }
    }
    batch = [];
  };

  for await (const raw of adapter.fetchAll()) {
    seen += 1;
    const norm = adapter.normalize(raw);
    if (norm) kept += 1;
    batch.push(norm);
    if (batch.length >= 500) await flush();
    if (seen >= args.limit) break;
  }
  await flush();

  console.log(
    `[ingest] done — seen=${seen} kept=${kept} upserted=${upserted}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
