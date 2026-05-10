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
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   VGIN_PARCELS_URL — override the FeatureServer URL for the Scott adapter.
 */
import { createClient } from "@supabase/supabase-js";
import {
  createScottCountyVaAdapter,
  scottCountyVaAdapter,
} from "@sunpath/parcel-adapters";
import type { ParcelAdapter } from "@sunpath/shared";

interface Args {
  adapter: string;
  limit: number;
  dryRun: boolean;
}

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

function pickAdapter(name: string): ParcelAdapter {
  switch (name) {
    case "scott-va": {
      const endpoint = process.env.VGIN_PARCELS_URL;
      return endpoint
        ? createScottCountyVaAdapter({ endpoint })
        : scottCountyVaAdapter;
    }
    default:
      throw new Error(`Unknown adapter: ${name}`);
  }
}

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
        // PostGIS expects WKT; geography column will cast.
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
