import { describe, expect, it } from "vitest";
import { fetchArcGisFeatures } from "./arcgis.js";

function makeFetch(pages: Array<{ features: unknown[]; exceededTransferLimit?: boolean }>): typeof fetch {
  let i = 0;
  return (async () => {
    const body = pages[Math.min(i, pages.length - 1)] ?? { features: [] };
    i += 1;
    return new Response(
      JSON.stringify({ type: "FeatureCollection", ...body }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

describe("fetchArcGisFeatures", () => {
  it("yields all features across pages", async () => {
    const fetcher = makeFetch([
      {
        features: Array.from({ length: 3 }, (_, k) => ({
          type: "Feature",
          properties: { PIN: `a-${k}` },
          geometry: null,
        })),
        exceededTransferLimit: true,
      },
      {
        features: Array.from({ length: 2 }, (_, k) => ({
          type: "Feature",
          properties: { PIN: `b-${k}` },
          geometry: null,
        })),
      },
    ]);
    const out: unknown[] = [];
    for await (const f of fetchArcGisFeatures({
      url: "https://example/0",
      pageSize: 3,
      fetcher,
    })) {
      out.push(f);
    }
    expect(out).toHaveLength(5);
  });

  it("throws on non-OK", async () => {
    const fetcher = (async () =>
      new Response("nope", { status: 500, statusText: "boom" })) as unknown as typeof fetch;
    await expect(async () => {
      for await (const _ of fetchArcGisFeatures({
        url: "https://example/0",
        fetcher,
      })) {
        void _;
      }
    }).rejects.toThrow(/500/);
  });
});
