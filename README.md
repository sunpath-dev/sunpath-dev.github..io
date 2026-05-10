# Sunpath

> Field intelligence for solar door-to-door teams.

[![Deploy](https://github.com/sunpath-dev/sunpath-dev.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunpath-dev/sunpath-dev.github.io/actions/workflows/deploy.yml)

A mobile-first Progressive Web App for door-to-door solar reps. Live at **[sunpath.dev](https://sunpath.dev)**.

## What it does

Sunpath sits between a rep's phone and the doors he knocks. It tells him **which** door, **why now**, and captures **what happened** with as few taps as physically possible.

- **Pre-qualifies** every parcel in his territory using free public data (county records, Census, NREL PVWatts, building permits, utility rates).
- **One-tap door logging** with auto GPS, weather, photo, voice memo. Works fully offline; syncs when reconnected.
- **Bill-photo OCR** → instant personalized savings card in 15 seconds.
- **Personalized leave-behind cards** with attribution-tracked callback URLs.
- **Daily rewarm push** — old "no" doors come back warm when neighbors go solar, utilities raise rates, or houses change hands.
- **HOA pre-check** so he doesn't waste a knock on a community that bans rooftop solar.
- **Lead pipeline** (lead → sit → sold → installed).

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + MapLibre GL, packaged as a PWA.
- **Backend:** Supabase (Postgres + PostGIS + Auth + Storage + Edge Functions).
- **Hosting:** GitHub Pages with `sunpath.dev` as the custom domain.
- **CI/CD:** GitHub Actions.

Designed to run on free tiers (~$1/month) until real usage justifies upgrades.

## Repo layout

```
apps/web/           # Vite + React PWA (the rep's app)
packages/shared/    # Types, zod schemas, scoring function, adapter interfaces
packages/ui/        # shadcn-generated components
parcel-adapters/    # County-by-county parcel data adapters (<state>/<county>.ts)
supabase/
  migrations/       # SQL schema migrations
  functions/        # Edge Functions (ingestion, enrichment, triggers)
docs/
  DESIGN.md         # Full product + technical design (source of truth)
plan.md             # Phase-by-phase build plan
```

## Getting started

```bash
# Prereqs: Node 20, pnpm 9
nvm use                          # picks up .nvmrc
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Supabase + API keys
pnpm dev                         # local dev server at http://localhost:5173
```

## Documentation

- **[plan.md](plan.md)** — phased build plan and execution sequence.
- **[docs/DESIGN.md](docs/DESIGN.md)** — full product and technical design (v1.3).
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — branching, commits, PR conventions.
- **[SECURITY.md](SECURITY.md)** — vulnerability reporting.

## License

[MIT](LICENSE)