# Sunpath — Roadmap

Field intelligence for door-to-door solar reps. One app. Every data source. Zero clipboard.

**Live at [sunpath.dev](https://sunpath.dev)** · [Report a bug or request a feature →](https://github.com/sunpath-dev/sunpath-dev.github.io/issues/new/choose)

---

## What's shipped

### Foundation & infrastructure
- Monorepo (pnpm workspaces, React 18, Vite 5, TypeScript strict, Tailwind)
- PWA — installable on phone home screen, works offline, service worker caching
- Supabase backend — 21 migrations, 21+ edge functions, PostGIS spatial queries
- GitHub Pages deployment with CI/CD on every push to `main`
- One-tap POC entry (no magic link friction for field testing)
- Push notifications — opt-in, Web Push via VAPID

### Territory map
- Full-screen MapLibre map with floating overlay controls
- 25 seeded parcels for Scott County, VA — color-coded by knock score (0–100)
- Address search with full US geocoding (ArcGIS World Geocoder — rural coverage)
- Satellite/aerial basemap toggle
- Parcel click → full property dashboard

### Property dashboard
- Full address display (Street, City, STATE)
- Knock score (9-factor algorithm: owner-occupancy, solar potential, rate trends, permit activity)
- HOA badge (red/yellow/green)
- Property owner (assessor data — owner name, owner-occupied status)
- Home facts: year built, sq ft, orientation, assessed value, last sale, FEMA flood zone
- Area context (US Census ACS 5-yr): owner-occ %, median income, median home value, energy burden
- Solar estimate: PVWatts kWh/yr, annual savings, payback with 30% ITC, 25-yr net
- Roof analysis: viable area sqft, max kW, panel count (OSM Overpass fallback; Google Solar API when key set)
- Incentives: federal ITC + state programs (DSIRE integration when key set; VA/TN hardcoded fallback)
- Neighborhood proof: nearby solar permits, recent home sales
- Knock outcome logging: 6 dispositions (No Answer / Soft No / Hard No / Callback / Sit / Sale)
- Doorcard PDF generation — quarter-sheet leave-behind with unique short URL

### Bill capture
- 3 input modes: photo, file upload, manual entry
- Linked to address (parcel ID) — zero PII stored
- OCR pipeline (Tesseract.js) + photo redaction (account numbers blurred before storage)

### Walk list
- Parcels ranked by knock score with GPS walk distance
- Outcome logging per parcel
- Add to route / CSV export

### Today dashboard
- Live weather (NOAA NWS — no key, official US data)
- Sunset countdown and daylight remaining
- Top doors to revisit with reasons (trigger events)
- Mini calendar with callback count per day

### Triggers (automated rewarm)
- Neighbor solar permit within 0.25 mi
- Utility rate hike (EIA YoY > 8%)
- Property sale monitor
- Callback-due reminders
- Daily rewarm push notification at 7 AM

### Pipeline
- Lead → Sit → Sold → Installed → Paid stage tracking
- Per-lead notes and files

### Multi-rep
- Invite flow, territory assignment, shared parcel data with per-rep door events
- Data export and GDPR/CCPA erase endpoints

---

## In progress — Phase 6: Property Dashboard & Data Integration

The property dashboard is the heart of the app. This sprint completes it.

| Item | Description | Status |
|------|-------------|--------|
| 6-A | **Capture Bill** button in property dashboard → bill capture pre-linked to that parcel | Planned |
| 6-B | Bill data upgrades financial model from "estimated" to "your actual usage" | Planned |
| 6-C | NREL Solar Resource — "X peak sun hours/day" in Energy section | Planned |
| 6-D | EIA state avg kWh/mo — "VA avg: 1,050 kWh/mo" baseline comparison | Planned |
| 6-E | Neighborhood heat map — MapLibre heatmap layer toggle (gradient vs. dots) | Planned |
| 6-F | **Build My Solar** button — coming-soon screen with panel layout preview description | Planned |
| 6-G | Property dashboard UI revamp — dashboard layout, skeleton loaders, estimated vs. actual badges | Planned |
| 6-H | **Property notes** — voice (Web Speech API), text, and photo capture linked to each parcel; smart follow-up trigger detection from note text | Planned |
| 6-I | **Reports module** — daily/weekly activity summary, conversion funnel, objection analysis, searchable note archive, export as PDF/text | Planned |

---

## Coming up — Phase 7: Intelligence Layer

Once Phase 6 is complete and there's 4+ weeks of rep data, these AI features activate.

| Item | Description |
|------|-------------|
| 7-A | AI note summarization — Claude API background summaries ("what happened / next step") |
| 7-B | Smart follow-up triggers — on-device keyword scan creates `callback_due` events from note text |
| 7-C | Objection pattern coaching — 30-day note analysis, close rate per objection type |
| 7-D | Best time/territory patterns — weekly edge function: "Tuesday 2–4 PM converts 2× your average" |
| 7-E | Bill capture impact — did capturing a bill before a second knock improve conversion? |
| 7-F | Neighborhood momentum signals — cluster permits + interest notes + sales → hot block overlay |
| 7-G | Voice transcript search — full-text search across spoken and typed notes via Postgres tsvector |

---

## Planned — Phase 8: Today Dashboard & Calendar

| Item | Description |
|------|-------------|
| 8-A | Territory context auto-detect from GPS — "Scott County, VA" label follows the rep's location |
| 8-B | Quick-switch territory picker — manually change county context without GPS |
| 8-C | Google Calendar / Outlook integration (read-only OAuth) — show calendar blocks, surface free walk windows |
| 8-D | Walk window planner — "You have 2h 45m before pickup at 5:45 — here's a 14-door cluster nearby" |

---

## Planned — Phase 9: Build My Solar (visual pitch tool)

| Item | Description |
|------|-------------|
| 9-A | Google Solar API integration — per-roof segments, exact viable area, pitch, annual sun exposure |
| 9-B | Satellite aerial overlay — panel layout shown on the actual roof image |
| 9-C | System summary card — panel count, kW, projected annual kWh, monthly savings |
| 9-D | On-porch sharing — one tap to share the visualization with the homeowner |

---

## Planned — Phase 10: Deeper parcel coverage

| Item | Description |
|------|-------------|
| 10-A | Full Scott County VA parcel ingest (VGIN ArcGIS REST adapter — built, needs run) |
| 10-B | Russell County VA adapter |
| 10-C | Scott County permit PDF parser (currently blocked — county publishes PDF only) |
| 10-D | Expand to surrounding SW Virginia counties |

---

## Deferred (won't build until explicitly requested)

- **Commission tracking** — schema column exists, no UI
- **Household / spouse view** — schema column exists, no UI
- **Capacitor native wrap** — iOS/Android app store submission (Phase 5 stretch goal)
- **Azure infrastructure migration** — keep on Supabase + GitHub Pages until scale demands it; Azure Static Web Apps + Azure DB for PostgreSQL evaluated and documented

---

## Infrastructure priorities (before any public launch)

### Authentication (HIGH PRIORITY — required before any live users)

The app currently uses one-tap POC entry — no real auth. Before any rep beyond the original developer uses the app, proper authentication is required.

- [ ] **OAuth login with Google / Apple / Microsoft** — Supabase Auth supports all three as social providers. No username/password to manage. Reps tap "Sign in with Google" (or Apple or Microsoft) and they're in.
  - Google OAuth: Google Cloud Console → Create OAuth 2.0 credentials → set in Supabase Auth settings
  - Apple Sign In: Apple Developer account required ($99/yr) → create App ID + Service ID → set in Supabase Auth settings
  - Microsoft/Outlook: Azure AD → App registration → set in Supabase Auth settings
- [ ] **Session management** — idle timeout + lockout on the PWA (configurable; default: 8 hours field day + auto-lock when phone locked)
- [ ] **Rep row provisioned on first sign-in** — already handled by DB trigger; verify it fires on OAuth sign-in, not just magic link
- [ ] Replace one-tap POC entry with the real OAuth flow in `apps/web/src/modules/auth/`

### Other pre-launch infrastructure

- [ ] Rename repo from `sunpath-dev.github..io` to `sunpath-dev.github.io` (two-dot typo)
- [ ] DNS records at registrar pointing sunpath.dev → GitHub Pages
- [ ] Google Solar API key → set `GOOGLE_SOLAR_API_KEY` Supabase secret
- [ ] DSIRE API key → set `DSIRE_API_KEY` Supabase secret
- [ ] Supabase Pro ($25/mo) — required for PITR and longer log retention before real users
- [ ] Full parcel ingest: `pnpm ingest:parcels` for Scott County VA
- [ ] Penetration test / security review before external reps
- [ ] Terms of Service and Privacy Policy
- [ ] Support contact: `support@sunpath.dev` (email forwarder or help desk)

---

## Request a feature or report a bug

Open an issue on GitHub: [github.com/sunpath-dev/sunpath-dev.github.io/issues](https://github.com/sunpath-dev/sunpath-dev.github.io/issues)

Use the **Feature Request** template for new ideas. Use the **Bug Report** template for anything broken.
