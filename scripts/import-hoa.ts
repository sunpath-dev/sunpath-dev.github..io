// scripts/import-hoa.ts
//
// Import HOA polygons from a GeoJSON FeatureCollection into the
// `hoa_zone` table. Each Feature must have:
//
//   geometry: Polygon (WGS84 / EPSG:4326)
//   properties.name: string         (required)
//   properties.state: string        (required, 2-letter)
//   properties.rule_color: 'red' | 'yellow' | 'green'   (required)
//   properties.county: string       (optional)
//   properties.notes: string        (optional)
//
// Usage:
//   pnpm tsx scripts/import-hoa.ts path/to/zones.geojson
//
// Auth: requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
// Uses service role because hoa_zone is admin-only writable per RLS.

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
import { createClient } from "@supabase/supabase-js";

interface Feature {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: {
    name?: string;
    state?: string;
    county?: string | null;
    rule_color?: "red" | "yellow" | "green";
    notes?: string | null;
  };
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

async function main(): Promise<void> {
  const path = argv[2];
  if (!path) {
    console.error("usage: tsx scripts/import-hoa.ts <zones.geojson>");
    exit(2);
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    exit(2);
  }

  const raw = readFileSync(path, "utf8");
  const fc = JSON.parse(raw) as FeatureCollection;
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    console.error("input is not a GeoJSON FeatureCollection");
    exit(2);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  let inserted = 0;
  let skipped = 0;

  for (const f of fc.features) {
    const p = f.properties ?? {};
    if (
      f.geometry?.type !== "Polygon" ||
      !p.name ||
      !p.state ||
      !p.rule_color
    ) {
      skipped++;
      continue;
    }
    // Convert GeoJSON Polygon to PostGIS WKT (single-ring assumption).
    const ring = f.geometry.coordinates[0];
    if (!ring || ring.length < 4) {
      skipped++;
      continue;
    }
    const wkt = `POLYGON((${ring
      .map((c) => `${c[0]} ${c[1]}`)
      .join(", ")}))`;

    // Use the PostGIS function to convert WKT → geometry server-side.
    const { error } = await sb.rpc("hoa_zone_upsert", {
      p_name: p.name,
      p_state: p.state,
      p_county: p.county ?? null,
      p_rule_color: p.rule_color,
      p_notes: p.notes ?? null,
      p_wkt: wkt,
    });
    if (error) {
      // Fall back to raw insert via REST if the helper RPC doesn't exist yet.
      const { error: insErr } = await sb
        .from("hoa_zone")
        .insert({
          name: p.name,
          state: p.state,
          county: p.county ?? null,
          rule_color: p.rule_color,
          notes: p.notes ?? null,
          // Supabase auto-converts EWKT-ish strings via PostGIS type when
          // the column is geometry; passing raw WKT works only if the
          // postgrest config allows it. The hoa_zone_upsert RPC is the
          // recommended path.
          geom: wkt,
        });
      if (insErr) {
        console.error(`! ${p.name}: ${insErr.message}`);
        skipped++;
        continue;
      }
    }
    inserted++;
    if (inserted % 25 === 0) console.log(`… ${inserted} inserted`);
  }

  console.log(`done. inserted=${inserted} skipped=${skipped}`);
}

void main().catch((err) => {
  console.error(err);
  exit(1);
});
