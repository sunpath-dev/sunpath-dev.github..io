# CLAUDE.md

Repo-level guidance for Claude Code when working on **Sunpath**. Read this before doing anything in this repo.

## What this is

Sunpath is a mobile-first PWA for door-to-door solar reps. Single-repo monorepo, hosted at `sunpath.dev` via GitHub Pages. **POC posture** for now — production hardening is gated and lives in the `Production hardening (pre-launch)` section of [plan.md](plan.md).

The full plan (phases 0-5, deferred items, public data sources, scoring) is in [plan.md](plan.md). The full design spec (v1.3, paste verbatim) is in [docs/DESIGN.md](docs/DESIGN.md).

## Current infra status

- Supabase project exists: `sunpath-dev`
- Region: `us-east-1`
- Project ref: `sclisaylpwnffkkyepow`
- Project URL: `https://sclisaylpwnffkkyepow.supabase.co`
- Do not commit secrets. The anon key, service-role key, DB password, and access token stay in GitHub Actions secrets or Supabase project settings (or `.secrets.local`, gitignored, for local-only use).
- Backend is live: all 19 migrations applied and all 19 edge functions deployed on 2026-05-10 via `supabase db push --include-all` and `supabase functions deploy` (run locally with `SUPABASE_ACCESS_TOKEN` set). REST probes for `parcel`, `rep`, `door_event`, `lead`, `trigger_event`, `bill_capture`, `hoa_zone`, `audit_log` all return `200`.
- After running migrations through the CLI, you may need to invalidate the PostgREST schema cache. The reliable way: run a DDL change (e.g. `comment on schema public is 'reload-' || ...`) plus `notify pgrst, 'reload schema';` via the management API `POST /v1/projects/<ref>/database/query`.
- The repo `supabase` GitHub Actions workflow is still gated on `vars.SUPABASE_ENABLED == 'true'` and that variable is not currently set; the active GitHub PAT cannot set repo Actions variables/secrets, so future Supabase deploys are done from the local CLI until repo admin can enable the workflow.

## Stack at a glance

- **Monorepo:** pnpm workspaces, Node 20 (`.nvmrc`), TypeScript 5.5 strict (`noUncheckedIndexedAccess: true`)
- **Frontend:** React 18 + Vite 5 + vite-plugin-pwa, Tailwind, MapLibre GL, HashRouter
- **Backend:** Supabase (Postgres + PostGIS + Auth + Storage + Edge Functions)
- **Hosting:** GitHub Pages apex `sunpath.dev` from `apps/web/dist`
- **License:** MIT

## Workspace layout

```
apps/web/             # the PWA
packages/shared/      # zod schemas, scoring, parcel-adapter interface
packages/ui/          # shared shadcn components (planned)
parcel-adapters/      # county-specific data importers (Scott VA → Russell → SW VA)
supabase/             # migrations + edge functions
docs/                 # DESIGN.md (v1.3) and ADRs
.github/              # workflows + templates
```

## Path aliases

- `@/` → `apps/web/src`
- `@shared/` → `packages/shared/src`
- `@ui/` → `packages/ui/src`

## Hard rules (do not violate)

1. **Module isolation** — `modules/X/` may only import from `packages/shared` and `packages/ui`. Never `modules/Y/`. Cross-module comms = DB events. Enforced via ESLint `no-restricted-imports`.
2. **Zod at every boundary** — anything crossing the network or an Edge Function boundary is validated with a schema in `packages/shared/src/schemas/`.
3. **No cross-module barrel `index.ts`** (per design §12.12). Single-package barrel inside `packages/shared` is fine.
4. **Migrations are forward-only.** Never amend a committed SQL file in `supabase/migrations/`. Add a new one.
5. **Service-role key never reaches the client.** Edge Functions only. The browser uses the anon key.
6. **All third-party API calls go through Edge Functions** (NREL, NWS, DSIRE, EIA, Census, Overpass). Keeps keys off-device, allows central caching and rate-limiting.
7. **License headers not required** — repo is MIT, single LICENSE at root.

## Public data sources (verified May 2026)

Use these — full table with auth/rate-limit notes is in [plan.md](plan.md) under "Public data sources — verified":

- **NOAA NWS** (`api.weather.gov`) — primary weather. Free, no key, `User-Agent` header required.
- **NREL PVWatts v8 / Utility Rates v3 / Solar Resource** — free with API key.
- **DSIRE API** (`dsireusa.org/dsire-api/`) — incentives. Free with signup. *Note: design doc said no API exists; that's stale.*
- **EIA v2** — utility rate trends. Free with API key.
- **US Census ACS 5-year** — owner-occupancy, income, home value. Free with API key.
- **OpenStreetMap Overpass** — building footprints. Free; cache aggressively.
- **OpenWeather One Call 3.0** — *fallback only*. Now a paid product as of 2024 — primary US source is NWS.

## Conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.). Scope by package when useful (`feat(shared): ...`).
- **Branching:** trunk-based; small PRs to `main`; preview deploy on PR is fine, prod deploys on merge.
- **Testing priority:** Vitest unit tests for `scoring.ts`, OCR parsers, sync engine. Playwright e2e from Phase 2.
- **Secrets:** never commit. Local dev uses `apps/web/.env.local` (gitignored). Prod secrets live in GitHub Actions + Supabase project env.
- **PWA caching:** OSM tiles `CacheFirst` 30d, Supabase reads `NetworkFirst` 4s timeout — see `apps/web/vite.config.ts`.

## When making changes

- Read [plan.md](plan.md) first — it has the phase plan, deferred items, and the production-hardening checklist.
- For schema changes: write a new `supabase/migrations/NNNN_*.sql`, never edit existing ones. Update zod schemas in `packages/shared/src/schemas/` to match.
- For new public data sources: add to the verified table in [plan.md](plan.md), wrap in an Edge Function, never call from browser.
- New parcel adapter: add to `parcel-adapters/<state>/<county>.ts` implementing `ParcelAdapter` from `@shared/adapters`. Order: Scott VA → Russell VA → surrounding SW VA.

## Deferred — do not build unless explicitly asked

- Commission tracking (schema column stays, no UI/ingestion)
- Household / spouse view (schema column stays, no UI)
- Calendar integration (Google/iCal/CalDAV) — see Deferred section in plan.md for the full sketch
- Capacitor native wrapping

## What "done" looks like for any task

1. Code change is minimal and scoped to the request
2. Touched code has tests where it's testable (scoring, parsers, sync)
3. No new third-party API call is made directly from the browser
4. Zod schema covers any new boundary
5. If schema changed: new migration file + matching zod update
6. Build passes locally (`pnpm -r build`); CI green on PR

## Quick references

- Phase plan + deferred + hardening checklist: [plan.md](plan.md)
- Full design spec v1.3 (verbatim from user): [docs/DESIGN.md](docs/DESIGN.md)
- Knock score reference impl: [packages/shared/src/scoring.ts](packages/shared/src/scoring.ts)
- Security policy: [SECURITY.md](SECURITY.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
