/**
 * Generic ArcGIS REST FeatureServer parcel source.
 *
 * Most Virginia counties (and a lot of US counties) publish parcels through an
 * ArcGIS REST FeatureServer. The query protocol is well-defined:
 *
 *   GET <url>/query?where=1=1&outFields=*&f=geojson&resultRecordCount=N&resultOffset=K
 *
 * This module handles paging and decoding. County adapters supply:
 *   - the FeatureServer layer URL,
 *   - the `where` filter (e.g. county filter for a statewide layer),
 *   - a field mapping from `properties` to our Parcel shape.
 */

import type { ParcelRaw } from "@sunpath/shared";

export interface ArcGisQueryOptions {
  /** Full FeatureServer layer URL ending in `/<layerId>`. */
  url: string;
  /** ArcGIS `where` clause. Default `1=1`. */
  where?: string;
  /** Page size. ArcGIS commonly caps at 1000–2000 — defaults to 1000. */
  pageSize?: number;
  /** Custom fetch (for tests or rate-limited scenarios). */
  fetcher?: typeof fetch;
}

export interface ArcGisFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Point" | "Polygon" | "MultiPolygon" | string;
    coordinates: unknown;
  } | null;
}

interface ArcGisFeatureCollection {
  type: "FeatureCollection";
  features: ArcGisFeature[];
  exceededTransferLimit?: boolean;
}

export async function* fetchArcGisFeatures(
  opts: ArcGisQueryOptions,
): AsyncIterable<ParcelRaw> {
  const where = opts.where ?? "1=1";
  const pageSize = opts.pageSize ?? 1000;
  const fetcher = opts.fetcher ?? fetch;

  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields: "*",
      f: "geojson",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      returnGeometry: "true",
      outSR: "4326",
    });
    const url = `${opts.url}/query?${params.toString()}`;
    const resp = await fetcher(url, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(
        `ArcGIS query failed: ${resp.status} ${resp.statusText} for ${url}`,
      );
    }
    const json = (await resp.json()) as ArcGisFeatureCollection;
    if (!json.features || json.features.length === 0) return;
    for (const f of json.features) {
      yield f as unknown as ParcelRaw;
    }
    if (!json.exceededTransferLimit && json.features.length < pageSize) return;
    offset += json.features.length;
  }
}
