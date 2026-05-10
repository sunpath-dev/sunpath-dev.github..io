# Sunpath — Changelog

All notable changes to Sunpath. Dates are approximate session dates.

---

## [Unreleased] — Phase 6 active sprint

### Planned
- `parcel_note` table + migration for property notes (voice/text/photo)
- Property dashboard "Capture Bill" button pre-linked to parcel_id
- Bill data feeds financial model (estimated → actual)
- NREL Solar Resource: peak sun hours/day in Energy section
- EIA state avg kWh/mo baseline comparison
- Neighborhood heat map layer toggle (MapLibre heatmap vs. dots)
- "Build My Solar" button — coming-soon screen
- Property dashboard UI revamp (dashboard layout, skeletons, badges)
- Reports module: daily/weekly, conversion funnel, note search, export

---

## [0.6.0] — 2026-05-10 · Today dashboard + walk list + bill capture revamp

### Added
- Today dashboard: live NOAA NWS weather, sunset countdown, top doors to revisit, mini calendar with callback counts, address search
- Walk list module: knock-score-sorted list with GPS distance, outcome logging per parcel
- Bill capture: 3 input modes (photo, file upload, manual), OCR pipeline, photo redaction (account numbers blurred before storage), zero-PII storage
- `weather-now` edge function for current conditions

### Changed
- Property detail sheet: full address display (Street, City, STATE) — was showing coordinates only
- Property detail sheet: all text bumped to high-contrast (slate-900 values, slate-700 labels) — was illegible light grey on white
- Map layout: full-screen with floating overlay controls — removed fixed header that ate viewport height

---

## [0.5.0] — 2026-05-10 · Property dashboard enrichment

### Added
- Property owner section in detail sheet: owner name (assessor data), owner-occupied status
- Home facts now pulled from database: year built, assessed value, roof orientation
- `solar-rooftop` edge function: OSM Overpass building footprint → viable area, max kW, panel count (Google Solar API when key is set, OSM fallback always available)
- `incentives-fetch` update: DSIRE API wired when `DSIRE_API_KEY` is set; VA/TN hardcoded fallback when not

### Fixed
- Home Facts section was always blank — click handler never passed DB fields to detail sheet
- Address search bar was missing from territory map on mobile
- State hardcoded as "VA" in click handler — now reads from parcel data

---

## [0.4.0] — 2026-05-10 · Auth switch + CI/CD

### Added
- One-tap POC entry (replaced magic-link for field testing)
- GitHub Actions Supabase workflow active: `vars.SUPABASE_ENABLED=true` + 7 repo secrets
- `pnpm github:secrets:set` script for secret provisioning

### Fixed
- Smoke test updated for POC entry button

---

## [0.3.0] — 2026-05-10 · Pipeline, triggers, multi-rep

### Added
- Lead pipeline module: Lead → Sit → Sold → Installed → Paid stage tracking with drag/tap transitions
- Short URL + doorcard landing pages (`sunpath.dev/#/d/<slug>`) with callback form
- Doorcard PDF generator (pdf-lib quarter-sheet template, per-parcel and batch)
- Web Push notifications via VAPID — opt-in, daily rewarm push at 7 AM
- Rewarm trigger system: neighbor permit, utility rate hike, property sale, callback-due
- Multi-rep invite flow and territory assignment
- GDPR/CCPA erase and export endpoints
- Audit log (`audit_log` table + `record_audit()`)
- PII retention policy with scheduled purge cron
- Rate limit check RPC (`rate_limit_check()` on `callback-submit`)
- Private bill_capture storage bucket with per-rep RLS
- HOA zones module: manual polygon import, spatial join, red/yellow/green badge

### Schema
- Migrations 0001–0021 applied to remote

---

## [0.2.0] — 2026-05-10 · Territory map MVP

### Added
- Territory map with MapLibre GL — color-coded knock score pins
- Knock score v1: 9-factor algorithm in `packages/shared/src/scoring.ts`
- Score unit tests (Vitest)
- `score-parcels` edge function: nightly batch updates `parcel.score` and `parcel.score_factors`
- PVWatts v8 + Utility Rates v3 edge functions
- Census ACS 5-year enrichment (`ingest-area-signals`)
- Scott County VA parcel adapter (VGIN ArcGIS REST) + incremental ingest edge function
- Filter panel: score range, owner-occupied, no existing solar, value bracket
- Walk list generation + CSV export
- "Add to walk list" action on property detail sheet

---

## [0.1.0] — 2026-05-10 · Skeleton

### Added
- pnpm monorepo: `apps/web`, `packages/shared`, `packages/ui`, `parcel-adapters`, `supabase`
- Vite 5 + React 18 + TypeScript strict (`noUncheckedIndexedAccess: true`)
- Tailwind + shadcn/ui components
- PWA manifest, service worker, offline shell caching
- MapLibre GL map shell with OSM raster tiles
- HashRouter routing
- Supabase project provisioned (`sunpath-dev`, `us-east-1`, ref `sclisaylpwnffkkyepow`)
- `apps/web/src/lib/supabase.ts` with publishable key fallback
- GitHub Pages deployment workflow (`apps/web/dist`)
- `apps/web/public/CNAME` = `sunpath.dev`
- CONTRIBUTING.md, SECURITY.md, LICENSE (MIT), issue templates, PR template
- Dependabot auto-updates
- Sentry + PostHog observability shim (`apps/web/src/lib/observability.ts`)
