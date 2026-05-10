# parcel-adapters

County-specific data importers. Each adapter implements `ParcelAdapter` from
`@sunpath/shared`:

```ts
import type { ParcelAdapter } from "@sunpath/shared";
```

## Roadmap

1. **Scott County, VA** (`51169`) — first; rep's home county.
2. **Russell County, VA** (`51167`) — second.
3. Surrounding SW Virginia: Wise, Lee, Washington, Smyth, Tazewell, Buchanan, Dickenson.

## Adapter contract

- Implement `meta`, `fetchAll()` (async iterable of raw records), `normalize(raw)` (returns `Parcel | null`; `null` skips).
- **Run in Edge Functions or Node scripts only.** Never in the browser.
- Cache aggressively. County GIS endpoints are slow and sometimes flaky.
- Skip non-residential parcels in `normalize()` — the app only knocks doors.
- If owner data is exposed by the county, **redact** the name into
  `owner_name_redacted` (e.g. first initial + last name) before storage. Full
  owner names are not stored client-side.

## Per-county data sources

Where to find each county's parcel data needs to be confirmed individually.
Possible patterns:

- ArcGIS REST FeatureServer (`/MapServer/<id>/query?...&f=geojson`) — best case.
- Static CSV / shapefile download — needs ETL.
- PDF-only assessor records — escalate; we won't ingest those programmatically for the POC.

When you onboard a new county, add a row to the source table in
[../plan.md](../plan.md) under "Public data sources — verified."
