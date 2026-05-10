# Sunpath — Build Plan (full, all phases)

Source of truth: the design doc (v1.3) the user provided. All decisions and specs in §1–§15 of that doc are authoritative; this file is the execution sequence.

## Context locked in
- **Single repo** for everything: `sunpath-dev/sunpath-dev.github.io` (this workspace folder). The multi-repo org structure in design §9 is collapsed into this one repo.
- **Current infra state:** the Supabase project is **live and provisioned** (`sunpath-dev`, region `us-east-1`, ref `sclisaylpwnffkkyepow`, URL `https://sclisaylpwnffkkyepow.supabase.co`). All 19 migrations applied on 2026-05-10; all 19 edge functions deployed; data API reachable. Frontend at `https://sunpath.dev` ships checked-in publishable key fallback so the live PWA targets the real project. **GitHub Actions Supabase workflow now active**: `vars.SUPABASE_ENABLED=true` plus 7 repo secrets (`SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PUBLISHABLE_KEY`) configured via `pnpm github:secrets:set`. Secrets and credentials are intentionally **not** recorded in this repo.
- **Scope:** every phase (0 through 5) — but plan is organized so phases ship independently.
- **Hosting model:** this repo is the GitHub Pages user/org site → published at `https://sunpath-dev.github.io/` → CNAME `sunpath.dev`. Apex site, not a project page. That means `base: '/'` in Vite is correct and simplifies routing vs. project Pages.
- **POC posture (current).** Everything in Phases 0–5 is a proof of concept. Data protection is intentionally minimal beyond Supabase RLS + HTTPS + standard auth — *no* full security hardening, *no* compliance work, *no* production data-handling guarantees. **Before a real production release** (paying users or a wider rep team) the items in the new "Production hardening (pre-launch)" section must be completed.
- **License:** MIT.
- **First parcel adapter target:** Scott County, VA. Then Russell Co. and surrounding SW Virginia counties.

## TL;DR
Bootstrap this repo as a pnpm monorepo (Vite + React + TS + Tailwind + shadcn/ui + MapLibre + Supabase + PWA), wire CI + GH Pages deploy + Supabase deploy, point `sunpath.dev` at it, then ship the six modules (territory, capture, OCR, doorcard, triggers, HOA, pipeline) one phase at a time against real porch feedback.

---

## What Sunpath is

A **mobile-first field app for door-to-door solar reps** — installed on a phone like a native app, but actually a website (`sunpath.dev`) the rep saves to his home screen. One codebase, runs everywhere (iPhone, iPad, Android, desktop), works offline.

What it does for the rep, in order of his day:

1. **Before he walks** — opens a map of his territory, every house color-coded 0–100 by knock score (owner-occupied, solar production potential, neighborhood permit activity, recent rate hikes, recent home sales). Filters out renters and houses with existing solar. Exports a walk list.
2. **On the porch** — one tap logs the door (*No Answer / Soft No / Hard No / Callback / Sit / Sale*). GPS, timestamp, weather, photo, and voice memo auto-attach. Zero typing. Works fully offline; queues and syncs when signal returns.
3. **When someone shows him a bill** — snaps a photo, on-device OCR pulls kWh, dollar amount, utility name; joins it to a PVWatts production estimate for that exact roof; produces a personalized savings number and shareable PDF in 15 seconds.
4. **When no one answers** — generates a personalized leave-behind card with a unique short URL that lands on a callback form. Card-to-callback attribution built in.
5. **The next morning** — push notification with the top doors to revisit and *why each is different now* (neighbor pulled a permit, utility raised rates, house changed hands, callback promise came due).
6. **HOA pre-check** — red/yellow/green badge on every house so he doesn't waste a knock on a community that bans rooftop solar.
7. **Lead pipeline** — lead → sit → sold → installed, with notes/files per lead.

## What Sunpath is *not*

- **Not a CRM** — no quotas, leaderboards, manager dashboards.
- **Not a design platform** — no roof modeling or panel layout (that's Aurora / HelioScope territory). Sunpath gives a rough savings number from a bill photo + a public solar-production estimate; a real designer still produces the engineered proposal after handoff.
- **Not an installer ops tool** — stops at "sold." Permitting, scheduling, install tracking are out of scope.
- **Not a lead-buying marketplace** — every lead came from a door he knocked.
- **Not (yet) a commission/payout tracker or family-finance view** — explicitly deferred (see "Deferred" below).

It's specifically the **field intelligence layer** between the rep's phone and the doors he knocks — telling him *which* door, *why now*, and capturing *what happened* with as few taps as physically possible.

---

## UI flow & screen mockups

User flow: **sign-on → Today dashboard → tools (map, walk list, bill, etc.)**.

Phone ≈ 360px · Tablet ≈ 768px · Desktop ≈ 1200px. Two-pane on tablet, three-pane on desktop where real estate allows.

---

### Screen 1 — Sign-on

```
PHONE                          TABLET                                  DESKTOP
┌───────────────────────┐      ┌──────────────────────────────────┐   ┌────────────────────────────────────────────┐
│                       │      │                                  │   │                                            │
│       Sunpath         │      │             Sunpath              │   │                  Sunpath                   │
│  Field intel for      │      │   Field intelligence for solar   │   │     Field intelligence for solar reps.     │
│   solar reps.         │      │             reps.                │   │                                            │
│                       │      │                                  │   │       ┌──────────────────────────┐         │
│   [▶ Enter the app]   │      │     [▶ Enter the app]            │   │       │     ▶ Enter the app      │         │
│                       │      │                                  │   │       └──────────────────────────┘         │
│                       │      │   (Future: email + password)     │   │       Future: email + password here        │
└───────────────────────┘      └──────────────────────────────────┘   └────────────────────────────────────────────┘
```

---

### Screen 2 — Today dashboard (default landing)

```
PHONE                                TABLET (2-col)                                 DESKTOP (sidebar + main)
┌───────────────────────────────┐    ┌────────────────────────────────────────┐    ┌─────────────────────────────────────────────────────────┐
│ Today · Mon May 11            │    │ Today · Mon May 11                     │    │ ┌──────────┐ Today · Monday May 11                       │
│ ☀ 72°F clear · wind 5mph N   │    │ ☀ 72°F · wind 5mph N · sunset 8:14    │    │ │ Sunpath  │ ┌─────────────┬───────────────────────────┐  │
│ Sunset 8:14 · 3h walk left   │    │ ─────────────────────────────────────  │    │ │ ▲ Today  │ │ NOW         │ FORECAST · Mon              │  │
├───────────────────────────────┤    │ ┌─────────────────┐ ┌────────────────┐│    │ │  Map     │ │ ☀ 72°F      │ High 78° / Low 54°          │  │
│ 🔍 Type address...            │    │ │ NOW  ☀ 72°F     │ │ FORECAST       ││    │ │  Walk    │ │ wind 5mph   │ Precip 0% · Wind 8mph       │  │
├───────────────────────────────┤    │ │ wind 5mph N     │ │ High 78° low 54││    │ │  Bill    │ │ 3h daylight │ Sunrise 6:24 · Sunset 8:14  │  │
│ FORECAST                      │    │ │ Sunset 8:14     │ │ Precip 0%      ││    │ │  Settings│ └─────────────┴───────────────────────────┘  │
│ High 78° / Low 54°            │    │ └─────────────────┘ └────────────────┘│    │ │          │ 🔍 Type an address...                         │
│ Precip 0% · Wind 8mph         │    │ 🔍 Type an address...                  │    │ │          │ ──────────────────────────────────────────── │
│ Walkability ★★★              │    │ ──────────────────────────────────────  │    │ │          │ TOP DOORS TO REVISIT (5)                     │
├───────────────────────────────┤    │ TOP DOORS TO REVISIT (5)                │    │ │          │ 🔴 142 Maple St    score 92  permit 1 day ago│
│ TOP DOORS TO REVISIT          │    │ 🔴 142 Maple St   score 92  permit 1d  │    │ │          │ 🟠 88 Oak Ave      score 78  sold last week  │
│ 🔴 142 Maple — neighbor       │    │ 🟠 88 Oak Ave     score 78  sold       │    │ │          │ 🟡 14 Cherry Ln    score 64  callback due    │
│   solar permit 1d ago         │    │ 🟡 14 Cherry Ln   score 64  callback   │    │ │          │ 🟢 7 Pine Ct       score 58  rate hike       │
│ 🟠 88 Oak Ave — sold last wk  │    │ 🟢 7 Pine Ct      score 58  rate hike  │    │ │          │ ──────────────────────────────────────────── │
│ 🟡 14 Cherry — callback due   │    │ ──────────────────────────────────────  │    │ │          │ 12 doors today · 47 this week · 💬 Pitches  │
│ ─────────────────────────────│    │ [▶ Start walking] [🗺 Map] [📋 List]   │    │ │          │ [▶ Start walking] [🗺 Map] [📋 Walk list]    │
│ 12 doors today · 💬 Pitches   │    │                                        │    │ └──────────┘                                              │
│ [▶ Start walking]             │    │ [Today][Map][Walk][Bill][⚙]            │    └─────────────────────────────────────────────────────────┘
│ [🗺 Map] [📋 Walk list]       │    └────────────────────────────────────────┘
│ [Today][Map][Walk][Bill][⚙]   │
└───────────────────────────────┘
```

---

### Screen 3 — Map (territory)

```
PHONE                                TABLET (split: list + map)                    DESKTOP (3-pane: nav + map + detail)
┌───────────────────────────────┐    ┌────────────────────────────────────────┐    ┌─────────────────────────────────────────────────────────┐
│ ← Map · Gate City, VA         │    │ Map · Gate City, VA  [Filters ▼] [🛰]  │    │ ┌──────────┐ Map  🔍 search  [Filters ▼]  [🛰 Satellite]  │
│ 🔍 search · [Filters ▼] [🛰] │    │ ┌──────────────┬─────────────────────┐ │    │ │  Today   │ ┌─────────────────────────┬─────────────────┐│
│ 47 parcels · cold ●●●● hot    │    │ │ TOP IN VIEW  │   ●●  ●●           ││    │ │ ▲ Map    │ │   ●●●  ●●               │ 142 Maple St    ││
├───────────────────────────────┤    │ │ 🔴 142 Maple │  ●  ●  ●●●         ││    │ │  Walk    │ │  ● ● ● ● ●●●            │ score 92        ││
│                               │    │ │   score 92   │ ●●● ●●● ● ●        ││    │ │  Bill    │ │   ● ●● ●●●  ●           │ Built 1987      ││
│      ●●  ●●  ●                │    │ │ 🟠 88 Oak    │  ● ●●  ● ● ●       ││    │ │  Settings│ │  ● ●  ●● ●● ● ●         │ 1,420 sqft      ││
│     ●  ●  ●●●                 │    │ │   score 78   │   ●●● ●●  ●        ││    │ │          │ │  Gate City, VA          │ Assessed $142k  ││
│    ●●● ●●● ● ●                │    │ │ 🟡 14 Cherry │ ─────────────────  ││    │ │          │ │ ──────────────────────  │ Orientation: S  ││
│     ● ●●  ● ●                 │    │ │   score 64   │ score 60-100        ││    │ │          │ │ score 60-100 owner-occ  │ FEMA: zone X    ││
│    ●●● ●●●  ●                 │    │ │ 🟢 7 Pine    │ ☑ owner-occupied    ││    │ │          │ │                         │ Census: 78% own ││
│                               │    │ │   score 58   │ ☐ has solar         ││    │ │          │ │                         │ Utility AEP     ││
│ Gate City · 47 parcels        │    │ └──────────────┴─────────────────────┘ │    │ │          │ │                         │ $0.142/kWh +9%  ││
├───────────────────────────────┤    │ [Today][Map][Walk][Bill][⚙]            │    │ │          │ │                         │ Sun 4.8 hrs/day ││
│ [Today][Map][Walk][Bill][⚙]   │    └────────────────────────────────────────┘    │ │          │ │                         │ [Knock][Doorca] ││
└───────────────────────────────┘                                                   │ └──────────┘ └─────────────────────────┴─────────────────┘│
                                                                                    └─────────────────────────────────────────────────────────┘
```

🛰 = satellite/aerial basemap toggle (free ESRI World Imagery tiles). Detail sheet on phone slides up from bottom when a dot is tapped.

---

### Screen 4 — Parcel detail sheet (data showcase — heart of the app)

```
PHONE (bottom sheet, 70vh)              TABLET (right rail)                       DESKTOP (right rail, 3-pane)
┌───────────────────────────────┐       ┌──────────────────────────────┐          ┌────────────────────────────────────┐
│ 142 Maple St           [✕]    │       │ 142 Maple St          [✕]    │          │ 142 Maple St                 [✕]   │
│ Gate City, VA 24251           │       │ Gate City, VA 24251          │          │ Gate City, VA 24251 · 36.62, -82.59│
│ ─────────────────────────────│       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ KNOCK SCORE  92 / 100         │       │ KNOCK SCORE  92 / 100        │          │ KNOCK SCORE  92 / 100  HOA: green ●│
│ HOA: green ●                  │       │ HOA: Maple Hills · solar OK  │          │ ─────────────────────────────────  │
│ ─────────────────────────────│       │ ───────────────────────────  │          │ HOME FACTS                         │
│ HOME FACTS                    │       │ HOME FACTS                   │          │  Built 1987 · 1,420 sqft           │
│ Built 1987 · 1,420 sqft       │       │  Built 1987 · 1,420 sqft     │          │  Orientation: South                │
│ Orientation: South            │       │  Orientation: South          │          │  Assessed $142,000                 │
│ Assessed $142,000             │       │  Assessed $142,000           │          │  Last sold 2018-04-15 · $128,000   │
│ Last sold 2018 · $128k        │       │  Last sold 2018 · $128,000   │          │  FEMA flood zone: X (low risk)     │
│ FEMA flood zone: X            │       │  FEMA flood zone: X (low)    │          │ ─────────────────────────────────  │
│ ─────────────────────────────│       │ ───────────────────────────  │          │ AREA CONTEXT (Census)              │
│ AREA CONTEXT (Census)         │       │ AREA CONTEXT                 │          │  78% owner-occupied                │
│ 78% owner-occupied            │       │  78% owner-occupied          │          │  Median income $52,400             │
│ Med income $52,400            │       │  Median income $52,400       │          │  Median home $115,200              │
│ Med home $115,200             │       │  Median home $115,200        │          │  Energy burden 4.8% · Broadband 79%│
│ Energy burden 4.8%            │       │  Energy burden 4.8%          │          │ ─────────────────────────────────  │
│ ─────────────────────────────│       │  Broadband adoption 79%      │          │ ENERGY & SOLAR                     │
│ ENERGY & SOLAR                │       │ ───────────────────────────  │          │  Utility: AEP Appalachian Power    │
│ Utility: AEP                  │       │ ENERGY & SOLAR               │          │  Rate: $0.142/kWh · +9.1% YoY     │
│ Rate: $0.142/kWh (+9% YoY)    │       │  Utility: AEP Power          │          │  NREL annual sun: 4.8 hrs/day      │
│ Sun 4.8 hrs/day (NREL)        │       │  Rate: $0.142/kWh +9.1% YoY  │          │  PVWatts (7kW): 9,840 kWh/yr       │
│ ─────────────────────────────│       │  Annual sun: 4.8 hrs/day     │          │   ≈ $1,400/yr savings @ current rate│
│ ROOF ANALYSIS (Google Solar)  │       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ S-facing · 940 sqft viable    │       │ ROOF ANALYSIS                │          │ ROOF ANALYSIS (Google Solar API)   │
│ Max system 7.2 kW · 18 panels │       │  S-facing · 940 sqft viable  │          │  S-facing · 940 sqft viable        │
│ ─────────────────────────────│       │  Max 7.2 kW · 18 panels      │          │  Max system 7.2 kW · 18 panels     │
│ FINANCIAL MODEL               │       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ $1,400/yr savings             │       │ FINANCIAL MODEL              │          │ FINANCIAL MODEL                    │
│ Payback 8.4 yrs (with 30% ITC)│       │  $1,400/yr savings           │          │  $1,400/yr savings (at current rate)│
│ 25-yr net savings: $18,900    │       │  Payback 8.4 yrs w/ ITC      │          │  Payback 8.4 yrs (with 30% ITC)    │
│ ─────────────────────────────│       │  25-yr net: $18,900          │          │  25-yr net savings: ~$18,900       │
│ INCENTIVES                    │       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ ITC 30% federal               │       │ INCENTIVES                   │          │ INCENTIVES                         │
│ + VA Solar Rebate 25%         │       │  ITC 30% federal credit      │          │  ITC 30% federal investment tax    │
│ + Net metering: yes (1:1)     │       │  VA Solar Rebate 25%         │          │   credit (no cap; through 2032)    │
│ ─────────────────────────────│       │  Net metering: yes (1:1)     │          │  VA Solar Rebate 25% (state)       │
│ NEIGHBORHOOD PROOF            │       │ ───────────────────────────  │          │  Net metering: yes (1:1)           │
│ ◆ 3 solar permits ¼ mi 30d    │       │ NEIGHBORHOOD PROOF           │          │ ─────────────────────────────────  │
│ ◆ 2 home sales · median $135k │       │  ◆ 3 solar permits ¼ mi 30d  │          │ NEIGHBORHOOD PROOF                 │
│ ─────────────────────────────│       │  ◆ 2 sales · median $135k    │          │  ◆ 3 neighbor solar permits ¼ mi   │
│ [▶ Knock] [🖨 Doorcard] [💬]  │       │ ───────────────────────────  │          │  ◆ 2 home sales nearby · med $135k │
└───────────────────────────────┘       │ [▶ Knock] [🖨 Doorcard] [💬] │          │ ─────────────────────────────────  │
                                        └──────────────────────────────┘          │ [▶ Knock this door] [🖨 Doorcard]  │
                                                                                  │ [💬 Pitch scripts]                 │
                                                                                  └────────────────────────────────────┘
```

Every section fails open — if a source is down, that section doesn't render. Ambient mode (geocoder fallback, no parcel match): hides Knock score, HOA, incentives; still shows Census + PVWatts + flood zone at the geocoded coords. 💬 = pitch script / objection cheat sheet panel.

---

### Screen 5 — Walk list

```
PHONE                                TABLET (split: list + detail)                  DESKTOP (3-pane)
┌───────────────────────────────┐    ┌────────────────────────────────────────┐    ┌─────────────────────────────────────────────────────────┐
│ Walk list · Mon May 11        │    │ Walk list · Mon May 11  ☀ 72°F · 3h   │    │ ┌──────────┐ Walk list · Mon May 11  ☀ 72°F · 3h day     │
│ ☀ 72°F clear · 3h daylight   │    │ ┌──────────────────┬─────────────────┐ │    │ │  Today   │ ┌────────────────────┬─────────────────────┐  │
│ Sort: ▼ score                 │    │ │ Sort: ▼ score    │ TAPPED PARCEL   ││    │ │  Map     │ │ Sort: ▼ score      │ 142 Maple St (open) │  │
├───────────────────────────────┤    │ │ ─────────────── │ 142 Maple St    ││    │ │ ▲ Walk   │ │ ─────────────────  │ Built 1987 · S-face │  │
│ 🔴 142 Maple St      92       │    │ │ 🔴 142 Maple 92  │ score 92        ││    │ │  Bill    │ │ 🔴 142 Maple   92  │ Assessed $142k      │  │
│   ¼ mi · 4 min walk           │    │ │ 🟠 88 Oak    78  │ HOA green       ││    │ │  Settings│ │ 🟠 88 Oak      78  │ DISPOSITION         │  │
│ 🟠 88 Oak Ave        78       │    │ │ 🟡 14 Cherry 64  │ Built 1987      ││    │ │          │ │ 🟡 14 Cherry   64  │ ┌──────────┬──────┐ │  │
│   0.3 mi · 6 min walk         │    │ │ 🟢 7 Pine    58  │ DISPOSITION     ││    │ │          │ │ 🟢 7 Pine      58  │ │No answer │Soft  │ │  │
│ 🟡 14 Cherry Ln      64       │    │ │              │   │ ┌─────┬─────┐  ││    │ │          │ │ 🟢 33 Birch    55  │ │Hard no   │no    │ │  │
│   0.5 mi · 10 min walk        │    │ │              │   │ │No   │Soft │  ││    │ │          │ │                    │ │Callback  │Sit   │ │  │
│ 🟢 7 Pine Ct         58       │    │ │              │   │ │ans  │ no  │  ││    │ │          │ │                    │ │Sale      │      │ │  │
│ ─────────────────────────────│    │ │              │   │ ├─────┼─────┤  ││    │ │          │ │                    │ └──────────┴──────┘ │  │
│ Tap a row → detail + buttons  │    │ │              │   │ │Hard │Call │  ││    │ │          │ │                    │ [▶ Next door]       │  │
├───────────────────────────────┤    │ │              │   │ ├─────┼─────┤  ││    │ └──────────┘ └────────────────────┴─────────────────────┘ │
│ [Today][Map][▲ Walk][Bill][⚙] │    │ │              │   │ │Sit  │Sale │  ││    └─────────────────────────────────────────────────────────┘
└───────────────────────────────┘    │ │              │   │ └─────┴─────┘  ││
                                     │ │              │   │ [Next door →]  ││
                                     │ └──────────────┴───┴────────────────┘│
                                     └────────────────────────────────────────┘
```

6 disposition buttons: No Answer / Soft No / Hard No / Callback / Sit / Sale. "Next door →" advances to next unworked parcel by score.

---

### Screen 6 — Bill capture (3 input modes, zero PII)

```
PHONE                                TABLET                                          DESKTOP
┌───────────────────────────────┐    ┌────────────────────────────────────────┐    ┌─────────────────────────────────────────────────────────┐
│ Bill capture                  │    │ Bill capture                           │    │ ┌──────────┐ Bill capture                                  │
│ Linked to: 142 Maple St       │    │ Linked to: 142 Maple St                │    │ │  Today   │ Linked to: 142 Maple St                       │
│ ─────────────────────────────│    │ ┌──────────────────┬─────────────────┐ │    │ │  Map     │ ┌──────────────────────┬───────────────────┐ │
│ [📷 Photo][📁 File][✎ Manual] │    │ │ INPUT            │ PARSED FIELDS   │ │    │ │  Walk    │ │ ┌──────┬──────┬─────┐│ PARSED FIELDS     │ │
│ ─────────────────────────────│    │ │ [📷][📁][✎ Man]  │ Utility:  AEP   │ │    │ │ ▲ Bill   │ │ │📷 Pho│📁 Fil│✎ Man││ Utility:  AEP     │ │
│ [Selected: ✎ Manual entry]    │    │ │                  │ Total kWh: 1,140│ │    │ │  Settings│ │ └──────┴──────┴─────┘│ Total kWh: 1,140  │ │
│ Utility:  [AEP_______]        │    │ │ Utility: AEP     │ Rate: $0.142    │ │    │ │          │ │ Utility: [AEP_____]  │ Rate: $0.142/kWh  │ │
│ Total kWh: [1140____]         │    │ │ Total kWh: 1140  │ Total: $162.13  │ │    │ │          │ │ kWh: [1140_______]  │ Total: $162.13    │ │
│ Rate $/kWh: [0.142__]         │    │ │ Rate: 0.142      │ Period:         │ │    │ │          │ │ Rate: [0.142_____]  │ Period: Apr-May   │ │
│ Total $: [162.13___]          │    │ │ Total: 162.13    │  Apr 12 - May 11│ │    │ │          │ │ Total $: [162.13__] │ ─────────────────│ │
│ Period: [Apr 12-May 11]       │    │ │ Period: Apr12-   │ ─────────────── │ │    │ │          │ │ Period: [Apr12-May] │ Annualized:       │ │
│ [💾 Save]                     │    │ │   May11          │ Annualized      │ │    │ │          │ │ [💾 Save]           │  ≈13,680 kWh/yr   │ │
│ ⓘ No personal info stored.    │    │ │ [💾 Save]        │  ≈13,680 kWh/yr │ │    │ │          │ │                      │ Cross-check:      │ │
│   Only kWh, rate, dates       │    │ │                  │ Cross-check:    │ │    │ │          │ │                      │  PVWatts 9,840    │ │
│   linked to this address.     │    │ │                  │  PVWatts 9,840  │ │    │ │          │ │                      │  → ~$1,400 saved  │ │
├───────────────────────────────┤    │ │                  │  → ~$1,400 saved│ │    │ │          │ │                      │ ⓘ Addr-linked,    │ │
│ [Today][Map][Walk][▲Bill][⚙]  │    │ │                  │ ⓘ No PII saved. │ │    │ │          │ │                      │   no PII saved.   │ │
└───────────────────────────────┘    │ └──────────────────┴─────────────────┘ │    │ └──────────┘ └──────────────────────┴───────────────────┘ │
                                     └────────────────────────────────────────┘    └─────────────────────────────────────────────────────────┘
```

All 3 modes feed the same `redactBillText` + parser pipeline; only parsed numerics persist. Linked to `parcel_id` (address), not a person.

---

### Screen 7 — Pipeline (deemphasized — sub-route, not a tab)

```
PHONE                              TABLET / DESKTOP
┌──────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
│ ← Pipeline                   │   │ ← Pipeline (sub-route under Today → "View pipeline") │
│ ───────────────────────────  │   │ ───────────────────────────────────────────────────  │
│ LEAD (3)                     │   │ LEAD (3)         SIT (2)          SOLD (1)           │
│  142 Maple                   │   │  142 Maple       55 Hickory       88 Oak (sold 5/3)  │
│  88 Oak  · 7 Pine            │   │  88 Oak          14 Cherry                           │
│ SIT (2) · SOLD (1)           │   │ INSTALLED (0)    PAID (0)                            │
└──────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

Removed from bottom nav by default. Reachable from Today dashboard or Settings → "Show Pipeline tab".

---

### Screen 8 — Settings

```
PHONE                              TABLET / DESKTOP
┌──────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
│ Settings                     │   │ Settings                                             │
│ ───────────────────────────  │   │ ──────────────────────────────────────────────────── │
│ Rep ID: poc-abc123 (POC)     │   │ Rep ID: poc-abc123 (POC mode)                        │
│ Push notifications: [opt-in] │   │ Push notifications: [✔ enabled]                      │
│ Show Pipeline tab: [☐]       │   │ Show Pipeline tab: [☐]                               │
│ Sign out                     │   │ Auth method: [Future: email + password]               │
└──────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

---

## Competitive landscape — what we add vs. skip

Researched: SalesRabbit, Spotio, Sunbase, Solo, Knockbase, Knockwise, Hero by Demand IQ, Knockio.

### What we're adding (Tier-1)

| # | Feature | Notes |
|---|---|---|
| C1 | **Google Solar API** — per-roof segments, pitch, area, annual sun exposure, max panel count | Free API. Competitors charge $49+/mo for the equivalent (SalesRabbit, Aurora). Edge function `solar-rooftop/`. |
| C2 | **Satellite / aerial basemap toggle** (🛰) | ESRI World Imagery, free tiles, ~30 lines. Rep shows homeowner their own roof mid-conversation. |
| C3 | **Pitch script + objection cheat sheet** (💬 panel) | Every competitor mentions it. Static markdown, editable in `apps/web/src/content/pitches.md`. |
| C4 | **Financial model** — $/yr saved, payback with ITC, 25-yr savings | All inputs already in PVWatts call. ~50 lines of math in `packages/shared/src/finance.ts`. |
| C5 | **Sunset countdown + daylight remaining** | Solar reps walk until dark; "3h walk left" is a real planning input. From NWS astronomy endpoint. |
| C6 | **Roof age proxy** from permit history | New roof + rate hike = best pitch. Framework exists in `triggers-scan-permits/`; fill the empty ADAPTERS array. |
| C7 | **Doors knocked today + streak** counter | "12 doors today · 47 this week". Lightest gamification. Reads `door_event` count by date. |

### What we deliberately don't copy (and why)

| Feature | Why not |
|---|---|
| Homeowner name / income / mortgage / credit (SalesRabbit DataGrid, Spotio "200 data points") | Conflicts with zero-PII posture. Their moat is consumer data brokerage; ours is open-data intelligence. This is a feature, not a gap — it belongs in the README "What we don't store" section. |
| AI follow-up calling | Requires homeowner phone numbers (PII). Out of scope. |
| E-signature / contract on porch | CRM/closing tool downstream. Out of scope. |
| Multi-rep leaderboards | Single-rep POC. Schema supports `rep_id`; revisit post-POC. |
| "Do Not Knock" registry | No federal source; per-rep flags risk creating a homeowner profile (PII). Skip. |
| Mortgage / equity / credit data | PII. Skip. |

---

## Phase 0 — Skeleton (foundation)

Goal: rep can install the PWA on his phone, log in, and see a MapLibre map of his territory.

**0.1 — Repo plumbing** *(no dependencies)*
- Add design doc verbatim as `docs/DESIGN.md` (preserve the v1.3 source).
- Replace placeholder `README.md`; add `LICENSE` (MIT pending confirmation), `CONTRIBUTING.md`, `SECURITY.md`, `.gitignore` (Node + Vite + Supabase + macOS/Windows), `.editorconfig`, `.nvmrc` (`20`).
- Issue templates (`.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`) and `pull_request_template.md`.
- Conventional Commits commitlint + Husky pre-commit hooks. *(Optional polish — flagged below.)*

**0.2 — Monorepo scaffold** *(parallel with 0.1)*
- `pnpm init`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`).
- `apps/web/` — Vite + React 18 + TS 5.4 strict (`noUncheckedIndexedAccess: true`).
- `packages/shared/` — types, zod schemas, scoring function, adapter interfaces.
- `packages/ui/` — shadcn-generated components.
- `supabase/` — `migrations/`, `functions/`, generated config.
- `parcel-adapters/` — folder per `<state>/<county>.ts` (replaces the separate repo from design §9).
- Path aliases: `@/` → `apps/web/src/`, `@shared/` → `packages/shared/src/`.

**0.3 — Web app dependencies & config** *(depends on 0.2)*
- Install per design §12.2: `@supabase/supabase-js`, `zustand`, `dexie`, `maplibre-gl`, `react-router-dom`, `zod`, `date-fns`, `vite-plugin-pwa`, `workbox-window`.
- Tailwind + PostCSS + autoprefixer + shadcn init.
- `vite.config.ts` per design §12.3 (PWA plugin, runtime caching for tiles + Supabase, manifest from §12.4, `base: '/'`).
- Generate placeholder PWA icons (192, 512, maskable-512) — solid color + sun glyph.
- Routing: `HashRouter` per design §12.5.
- `apps/web/src/lib/supabase.ts` per §12.6.
- `.env.local` template (gitignored) + `.env.example` checked in per §12.7.

**0.4 — Supabase project** *(parallel with 0.3, blocks 0.6)* ✅ shipped.
- Project created: `sunpath-dev` in `us-east-1`.
- Recorded non-secret identifiers: project ref `sclisaylpwnffkkyepow`, URL `https://sclisaylpwnffkkyepow.supabase.co`.
- Keep secrets out of git: anon key, service-role key, DB password, and access token belong in GitHub Actions secrets / Supabase project settings, not this repo.
- All 19 migrations applied to remote on 2026-05-10 via `supabase db push --include-all`. REST probes for `parcel`, `rep`, `door_event`, `lead`, `trigger_event`, `bill_capture`, `hoa_zone`, `audit_log` all return `200`. All 19 edge functions deployed via `supabase functions deploy`.
- Commit `supabase/migrations/0001_init.sql` verbatim from design §12.8 (parcel/property_signal/area_signal/door_event/lead/bill_capture/quote/trigger_event/incentive/rep/commission_event + RLS + `set_updated_at` trigger).
- Configure Auth: enable email magic link only (no passwords).

**0.5 — CI/CD workflows** *(depends on 0.2, 0.4)*
- `.github/workflows/ci.yml` per design §12.9 (lint + typecheck + test + build on PR/main).
- `.github/workflows/deploy.yml` per design §12.10 (build `apps/web`, write `CNAME` = `sunpath.dev`, deploy to GH Pages). Repo Settings → Pages → source = "GitHub Actions".
- `.github/workflows/supabase.yml` per design §12.11 (db push + functions deploy on changes under `supabase/`).
- Actions secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `NREL_API_KEY`, `CENSUS_API_KEY`.
- Branch protection on `main`: require CI green + PR review (even solo — keeps history clean).

**0.6 — DNS + domain** *(depends on 0.5 succeeding once)*

URL chain: browser → `sunpath.dev` (DNS) → GitHub Pages edge → repo's Pages artifact (`apps/web/dist`).

Three-step setup, all currently outstanding:

1. **Repo rename (USER ACTION).** Repo is currently named `sunpath-dev.github..io` (two dots — typo). GitHub Pages won't serve it as `<owner>.github.io`. Rename in GitHub → Settings → General → "Repository name" to `sunpath-dev.github.io`. Git remotes auto-redirect; local clones keep working.
2. **DNS records (USER ACTION at registrar for `sunpath.dev`):**
   - `A @ 185.199.108.153`
   - `A @ 185.199.109.153`
   - `A @ 185.199.110.153`
   - `A @ 185.199.111.153`
   - `AAAA @ 2606:50c0:8000::153` (and `:8001::153`, `:8002::153`, `:8003::153`)
   - `CNAME www → sunpath-dev.github.io.`
3. **GitHub Pages settings (USER ACTION):** Settings → Pages → Source = GitHub Actions; Custom domain = `sunpath.dev`; Enforce HTTPS = on. (`.dev` is HSTS-preloaded so TLS is mandatory — Pages provisions Let's Encrypt automatically once DNS resolves, usually < 1 hr.)

Already shipped on the repo side:
- `apps/web/public/CNAME` contains `sunpath.dev` (Vite copies to `dist/CNAME`, which Pages reads as the canonical host). ✅
- `apps/web/vite.config.ts` uses `base: '/'` (correct for apex / `<user>.github.io` deploy — no subpath rewrite). ✅
- `.github/workflows/deploy.yml` uses `actions/deploy-pages` and uploads `apps/web/dist`. ✅

Verify after DNS propagates: `https://sunpath.dev` serves the PWA shell; `dig sunpath.dev +short` returns the four `185.199.*.153` IPs.

**0.7 — Auth + map shell + offline sync engine** *(depends on 0.3, 0.4)*
- Email magic-link login screen.
- `rep` row auto-created on first login (DB trigger or app-side on auth event).
- Top-level layout with bottom nav (mobile-first): Map / Walk List / Pipeline / Settings.
- MapLibre map centered on rep's territory (default to a hardcoded lat/lon until territory editor exists), OSM raster tiles, basic geolocation pin.
- **Offline sync engine** in `apps/web/src/lib/sync/`: Dexie tables mirror server tables; mutation queue with retry + conflict resolution (last-write-wins for v1); replay on `online` event.
- Layer registry pattern so later modules can register map layers without touching `core`.
- PWA install prompt + service worker verification (Lighthouse PWA audit ≥ 90).

**Phase 0 deliverable:** rep visits `sunpath.dev` on his phone, taps "Add to Home Screen," logs in via magic link, sees a map of his area. Works offline (cached shell). CI builds and deploys on every push to `main`.

---

## Phase 1 — Territory MVP

Goal: rep plans tomorrow's walk from the couch.

**1.1 — Parcel adapter framework** *(parallel)*
- `packages/shared/src/adapters.ts`: `ParcelAdapter` interface (`fetchAll(): AsyncIterable<ParcelRaw>`, `normalize(raw): Parcel`). ✅ shipped.
- First adapter: rep's top county. Decide ArcGIS REST vs. Tyler portal vs. CSV based on what's available. ✅ shipped (Scott County VA via VGIN ArcGIS REST).
- Edge function `supabase/functions/ingest-parcels/`: reads adapter, upserts into `parcel`. Cron daily. ✅ shipped (incremental edge fn capped at 5k features/run; full backfill via `pnpm ingest:parcels` CLI).

**1.2 — Census ACS enrichment** *(parallel with 1.1)*
- Edge function `ingest-area-signals/`: pulls `B19013_001E`, `B25003_002E`, `B25077_001E` for relevant block groups, populates `area_signal`. Refresh monthly. ✅ shipped (writes per-county ACS payloads scoped to a county-bbox polygon; proper TIGER polygons deferred).

**1.3 — PVWatts + Utility Rates enrichment** *(depends on 1.1)*
- Edge function `pvwatts-fetch/`: per-parcel call to PVWatts v8 + Utility Rates v3, results cached into `property_signal kind=pvwatts` when `parcel_id` is supplied. ✅ shipped.

**1.4 — Knock score v1** *(depends on 1.1, 1.2, 1.3)*
- `packages/shared/src/scoring.ts`: pure function from design §13 (9 factors, total 100, exclude `has_existing_solar`). ✅ shipped.
- Unit tests covering each factor and edge cases. ✅ shipped.
- Edge function `score-parcels/`: nightly batch updates `parcel.score` and `parcel.score_factors`. ✅ shipped (migration 0014 `compute_parcel_score_full()` + `recompute_scores_batch()`; edge fn loops in 500-row pages).

**1.5 — Territory module UI** *(depends on 1.4)*
- `modules/territory/`: heatmap layer (color-graded by `score`), filter panel (score range, owner-occupied, no existing solar, value bracket), parcel detail sheet with score factors.
- "Add to walk list" action → creates a saved walk list.
- CSV export of walk list.

**Phase 1 deliverable:** rep filters and exports a walk list for his next session.

---

## Phase 2 — Walk & Capture

Goal: rep stops carrying a clipboard.

- **2.1 Walk list view** — sortable list + map view of today's targets, "next door" navigation.
- **2.2 One-tap capture** — disposition buttons (`no_answer`/`soft_no`/`hard_no`/`callback`/`sit`/`sale`), GPS auto-attach, OpenWeather snapshot, photo (camera API), voice memo (MediaRecorder).
- **2.3 Offline-first writes** — every door event queues locally first, syncs in background. Visible queue indicator.
- **2.4 Bill OCR** — Tesseract.js on web (on-device); extract kWh/$ /utility/rate class. Fallback to Edge function `ocr-fallback/` calling Cloud Vision when confidence < threshold. Store in `bill_capture`.
- **2.5 Instant savings card** — joins bill OCR + `property_signal` → personalized savings number; PDF generated client-side (jsPDF), sharable via Web Share API.

**Phase 2 deliverable:** rep logs every door, photos a bill, and shows a savings number in 15 seconds.

---

## Phase 3 — Engagement

Goal: no-answers convert into callbacks.

- **3.1 Doorcard PDF generator** — Edge function `doorcard-pdf/`: address + roof guess + neighborhood avg + savings preview; quarter-sheet print layout (batch) and on-demand single. ✅ shipped (pdf-lib quarter-sheet template; per-parcel & batch via `parcel_ids[]`; pipeline UI 🖨 button calls it).
- **3.2 Short-URL + landing pages** — slug per parcel (e.g. `sunpath.dev/#/d/<slug>`); landing page renders saving preview + callback form; submission writes to `lead`. ✅ shipped (`callback-submit` edge fn + `CallbackRoute`).
- **3.3 Lead pipeline** — `modules/pipeline/`: lead → sit → sold → installed → paid; drag/tap stage transitions; per-lead notes/files. ✅ shipped (`apps/web/src/modules/pipeline/`).
- **3.4 Follow-up reminders** — push notifications (Web Push via Supabase Edge Function + VAPID). ✅ shipped (migration 0011 + `push-send` + SW push handler + `PushOptIn`).

**Phase 3 deliverable:** doors that didn't open turn into measurable callbacks.

---

## Phase 4 — Rewarm Triggers

Goal: dormant "no" doors become new pipeline.

- **4.1 Permit scanner** — per-county adapter under `parcel-adapters/<state>/<county>-permits.ts`; daily Edge function `ingest-permits/` writes `trigger_event` rows of type `neighbor_permit` for parcels within 0.25 mi of any new solar permit. *Framework shipped in `triggers-scan-permits/`; real Scott VA PDF parser is the remaining work.*
- **4.2 Rate-filing watcher** — Edge function `rate-watch-eia/`: pulls EIA v2 retail rate trends, emits `rate_hike` trigger when YoY > 8%. ✅ shipped.
- **4.3 Property-sale monitor** — Edge function `triggers-property-sales/`: diffs `property_signal kind=sale` against `parcel.last_sale_date`, emits `sold` triggers. ✅ shipped.
- **4.4 Callback-due cron** — Edge function `triggers-callback-due/` emits `callback_due` triggers for door events with disposition `callback` past their reminder. ✅ shipped.
- **4.5 Daily rewarm push** — Edge function `rewarm-push/` finds reps with open triggers, dispatches Web Push tickle via `push-send/`. ✅ shipped.

**Phase 4 deliverable:** every morning the rep gets a list of doors to revisit with reasons.

*Commission tracking and the household/spouse view are deferred — see "Deferred" below. The `commission_event` table and `rep.household_view_token` column stay in the schema (cheap to keep, lets us re-add the feature without a migration), but no UI ships.*

---

## Phase 5 — HOA, polish, optional native

- **5.1 HOA module** — manual polygon import per market (start with rep's top 3); spatial join to parcels; red/yellow/green badge on walk list and detail sheet. ✅ shipped (migration 0006: `hoa_zone` + `hoa_for_parcel`; importer `scripts/import-hoa.ts`).
- **5.2 Photo redaction** — auto-detect + blur account numbers on bill images (regex on OCR text → bounding-box mask) before storage. ✅ shipped (Tesseract OCR + redactor in `apps/web/src/modules/bill/`).
- **5.3 Sentry + PostHog** — wire free-tier instrumentation; PII-safe event names. ✅ shipped (lightweight DSN-based shim in `apps/web/src/lib/observability.ts`; swap to real SDKs pre-launch).
- **5.4 Multi-rep support** — invite flow, territory assignment, shared parcel data with per-rep door events (RLS already supports this). ✅ shipped (migration 0012 + `invite-create`/`invite-accept` edge functions + UI).
- **5.5 Capacitor native wrap** *(only on user request)* — wrap `apps/web` build into iOS + Android binaries; native ML Kit OCR replaces Tesseract.js; submit to stores.

---

## Phase 2.5 — Walk-day weather forecast

Goal: rep checks the day before "should I knock tomorrow, and where?" and gets a forecast-aware view of his planned walk.

- **Data source: NOAA NWS API** (`api.weather.gov`). Free, no key, no rate-limit fees, official US Gov data. Requires a polite `User-Agent` header. Returns hourly + 7-day forecasts plus active alerts (severe thunderstorms, heat advisories, etc.). *Per research May 2026: this is the right primary source — the design doc's OpenWeather suggestion is now a paid product (One Call 3.0 requires a credit-card-backed subscription).* ✅ shipped (`forecast-fetch/` edge fn).
- **Data source (fallback): OpenWeather One Call 3.0** for non-US edge cases or when NWS is down. Requires `VITE_OPENWEATHER_API_KEY`; first 1,000 calls/day free under the One Call by Call plan.
- Edge function `forecast-fetch/`: hourly cron pulls forecast for each rep's territory centroid; cached 1 hour. ✅ shipped.
- UI: walk-list header shows forecast strip — temp, precip %, wind, UV, sunrise/sunset, NWS alerts. Color cues for "great walk weather" / "marginal" / "stay home." ✅ shipped (`apps/web/src/modules/walk/useWalkDayForecast.ts`).
- Walk-list sort option: rank by *expected daylight remaining*, downrank parcels with active severe-weather alerts in the area.
- Daily push (~7am): tomorrow's outlook + suggested time window (e.g. "best between 4–7pm — clear, 72°F, sunset 8:14").

**Phase 2.5 deliverable:** rep stops walking into thunderstorms; uses good-weather windows efficiently.

---

## Deferred (not scoped, may revisit later)

- **Commission tracking** — pending vs paid, expected pay dates, monthly goal vs actual. Schema (`commission_event` table) stays in the initial migration so future re-introduction is non-breaking, but no ingestion, UI, or workflow is built. *Reason: not relevant until there's revenue to track.*
- **Household / spouse view** — read-only family link via `rep.household_view_token`. Column stays in schema; no UI. *Same reason as above.*
- **Calendar integration** — connect Google Calendar / Apple Calendar / Outlook (CalDAV) read-only. Use existing events to figure out *how much continuous walking time* the rep has on a given day, in a given area, before his next commitment. Then suggest a walk plan that fits the slot (e.g. "you have 90 minutes free at 4pm before kid pickup at 5:45 — here's a 12-door cluster within a 3-block radius"). Data shape: pull events for the next 7 days, filter to ones with a location or that block walking time, intersect with the rep's territory polygons, surface "walking windows." Privacy: read-only, OAuth scopes minimal, never store event details server-side beyond start/end/has-location flag. *Reason: powerful but non-trivial OAuth + provider-specific work; revisit after Phases 0–4 prove core utility.*

---

## Production hardening (pre-launch — required before real users)

**Status:** none of this is built during Phases 0–5. The POC ships with Supabase RLS + HTTPS + magic-link auth and *that's it*. Everything below is a hard gate before the app moves from "rep + maybe a friend" to "paying users or external reps."

**Data protection**
- Encrypt sensitive columns at rest (`bill_capture.image_url` storage objects, `lead.phone`, `lead.email`, `lead.contact_name`) using `pgsodium` or column-level encryption in Postgres.
- Auto-redact account numbers from bill images **before** they hit storage (already planned as Phase 5.2 — promote to mandatory). ✅ shipped (Tesseract OCR + redactor).
- Storage bucket policies: signed URLs only, short TTL, no public reads. ✅ shipped (migration 0018: `bill_capture` bucket private + per-rep RLS on `storage.objects`).
- PII retention policy: define how long door notes, voice memos, photos, and bill images live; implement a scheduled purge function. ✅ shipped (migration 0016: `pii_retention_policy` + `purge_expired_pii()` + daily cron + `erase_homeowner_pii()` for GDPR/CCPA).
- Audit log table: every read/write of PII captured with rep_id + timestamp + IP. ✅ shipped (migration 0013: `audit_log` + `record_audit()`).

**Auth & access**
- Re-evaluate magic-link-only — consider TOTP / WebAuthn for reps with sensitive territory data.
- Session timeout + idle lockout on the PWA.
- Service-role key rotation procedure documented and tested.
- Anon key scoped down to the minimum surface RLS allows.

**Compliance**
- **TCPA** review before any SMS/auto-call functionality (design §10 already flags this).
- **State DNC list** integration if outbound calling/SMS is added.
- **GDPR/CCPA-style** data export + delete endpoints per rep and per homeowner contact. ✅ shipped (`erase_homeowner_pii()` in 0016; `export_homeowner_pii()` in 0017 + `homeowner-export/` edge fn behind `HOMEOWNER_EXPORT_TOKEN`).
- **Solar industry**: review state-specific rules on door-to-door sales (cooling-off periods, required disclosures).
- **Terms of Service + Privacy Policy** drafted and accepted at signup.
- **Data Processing Agreement** with Supabase if storing PII for users beyond the original rep.

**Operational security**
- Secrets management hardened: GitHub Actions OIDC instead of long-lived tokens where possible; Supabase access tokens rotated quarterly.
- `dependabot.yml` + automated security patching. ✅ shipped.
- Sentry (Phase 5.3) gets PII scrubbing config.
- PostHog (Phase 5.3) configured to never capture form values or bill content.
- Rate limiting on Edge Functions (Supabase has limited built-in support; may need a Cloudflare Worker proxy). ✅ shipped (migration 0015: `rate_limit_check()` RPC + `callback-submit` per-IP 10/hr).
- Backup + restore procedure tested (Supabase Pro adds PITR — needs to be on by launch).

**Infrastructure**
- Move off free tier where it matters: Supabase Pro ($25/mo) for PITR, longer log retention, and predictable performance.
- Custom error pages on `sunpath.dev`.
- Status page (UptimeRobot free tier or similar).
- Incident response runbook in `docs/`.

**Code/process**
- Penetration test or third-party security review against Phase 0–5 code before launch.
- All P0/P1 security findings closed before flipping the switch.
- DPIA (Data Protection Impact Assessment) document on file.

This list is the *minimum* gate. Add to it as the product picks up features that handle more sensitive data (financing applications, contracts, e-signatures, etc.).

---

## Public data sources — verified (May 2026 research)

This is the authoritative list, replacing design §14 where the two diverge. All sources are free for the POC scope; rate-limit notes are from primary docs.

| Source | URL | Auth | Free? | Notes / corrections to design doc |
|---|---|---|---|---|
| **NREL PVWatts v8** | `https://developer.nrel.gov/api/pvwatts/v8.json` | API key (free signup) | Yes | 1,000/hr, 10,000/day per key. Cache by lat/lon to 4 decimals — neighbors share results. |
| **NREL Utility Rates v3** | `https://developer.nrel.gov/api/utility_rates/v3.json` | Same NREL key | Yes | Returns avg residential $/kWh + utility name. |
| **NREL Solar Resource Data** | `https://developer.nrel.gov/api/solar/solar_resource/v1.json` | Same NREL key | Yes | Raw irradiance, underlies PVWatts. |
| **DSIRE API** | `https://dsireusa.org/dsire-api/` | Free signup | Yes | **Correction to design §14**: DSIRE *does* have a real API. Use it instead of scraping CSV. Returns full program data: jurisdictions, types, amounts, expirations, eligibility. |
| **US Census ACS 5-year** | `https://api.census.gov/data/2022/acs/acs5` | API key (free signup) | Yes | Variables: `B19013_001E` (median income), `B25003_002E` (owner-occupied units), `B25077_001E` (median home value). Block-group geography for Scott County, VA: `state:51 county:169`. |
| **NOAA NWS API** | `https://api.weather.gov` | None — `User-Agent` header required | Yes | **Primary weather source.** No key, no fees, US-only, official Gov data. Hourly + 7-day forecasts, severe weather alerts. Generous rate limit (typical 5-second cooldown if exceeded). **Replaces OpenWeather as primary** since OW One Call 3.0 became a paid product. |
| **OpenWeather One Call 3.0** | `https://api.openweathermap.org/data/3.0/onecall` | API key + paid subscription | **No** — credit-card-backed subscription required (1,000 calls/day free *within* the One Call by Call plan only). | **Correction to design**: not free anymore. Use only as fallback for non-US or NWS outages. |
| **EIA v2** | `https://api.eia.gov/v2/electricity/retail-sales/data/` | API key (free signup) | Yes | State-level retail rate trends; backs the rate-hike trigger. |
| **OpenStreetMap Overpass** | `https://overpass-api.de/api/interpreter` | None | Yes | Building footprints, addresses. Be polite — cache aggressively, batch by neighborhood. Heavy users should self-host an instance. |
| **USPS Address Validation** | API via business.usps.com | Account + opaque approval | Yes (limited) | Standardize captured addresses. Optional for POC. |
| **Sunrise-Sunset.org** | `https://api.sunrise-sunset.org/json` | None | Yes | Daylight bounds for territory time-blocking. Tiny payload, cache by lat/lon + date. |
| **County parcel data** | varies per county | varies | varies | No single endpoint. Scott County, VA: confirm available export format (ArcGIS REST vs. CSV vs. PDF-only). Build an adapter per county; first three: Scott → Russell → surrounding SW VA. |
| **County permit data** | varies per county | varies | varies | Same per-county adapter pattern. Drives the `neighbor_permit` rewarm trigger. |

**Standard practice for all of these:** wrap in a Supabase Edge Function with retries + caching, never call directly from the browser (avoids leaking keys, simplifies CORS, lets us add rate-limit logic centrally). The browser only ever sees the joined Sunpath schema.

---

## New / proposed features (added post-design v1.3)

These extend the v1.3 design based on conversation. Captured here so the design history is clear.

1. **Walk-day weather forecast (Phase 2.5).** See its dedicated section above. Driver: NOAA NWS API.
2. **Calendar integration (Deferred).** See the deferred section. Driver: Google Calendar / iCal / CalDAV read-only OAuth.
3. **DSIRE API over scraping.** Replaces design §14's "no public API; download CSV" guidance.
4. **NWS as primary weather source over OpenWeather.** Replaces design §3 / §14 weather guidance for the US market.
5. **Marketing white paper (`docs/whitepaper.md`).** A print-ready, non-technical explainer for prospective installers/owners — positioning, the rep workflow, the data sources behind the scoring, the privacy posture, and where Sunpath sits relative to existing CRMs. Lives next to the design doc; updated whenever the public-facing pitch changes.

When the design doc is next revised, these should be folded in as v1.4.

---

## Cross-cutting work (applies across all phases)

- **Module isolation rule** (design §9): `modules/X/` may only import from `packages/shared` and `packages/ui` — never `modules/Y/`. Cross-module communication is DB events. Enforced via ESLint `no-restricted-imports`.
- **Zod at boundaries** — every network/edge-function payload validated with shared zod schemas in `packages/shared`.
- **No barrel index files across modules** (design §12.12).
- **Migrations forward-only**, never amend committed SQL.
- **Service-role key never reaches client** — Edge Functions only.
- **Test priorities:** Vitest unit tests for `scoring.ts`, OCR parsers, sync engine; Playwright e2e starting Phase 2.
- **All third-party API calls go through Edge Functions**, not the browser. Keeps keys off-device, lets us cache, rate-limit, and swap providers without client redeploys.

---

## Relevant files (Phase 0 — to be created)

- `docs/DESIGN.md` — verbatim copy of the user-supplied design doc (source of truth).
- `README.md` — replaces current one-line placeholder.
- `pnpm-workspace.yaml`, `package.json`, `.nvmrc`, `.gitignore`, `.editorconfig`.
- `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.ts`, `apps/web/index.html`, `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/`.
- `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/lib/supabase.ts`, `apps/web/src/lib/sync/`, `apps/web/src/modules/core/`.
- `packages/shared/src/scoring.ts`, `packages/shared/src/adapters.ts`, `packages/shared/src/schemas/`.
- `packages/ui/` — shadcn components.
- `supabase/migrations/0001_init.sql`, `supabase/config.toml`, `supabase/functions/`.
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/supabase.yml`.
- `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/pull_request_template.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`.

---

## Verification

**Phase 0 acceptance:**
1. `pnpm install && pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm --filter web build` all pass locally.
2. Push to `main` triggers CI green and Pages deploy.
3. `https://sunpath.dev` loads with valid HTTPS, no console errors.
4. Lighthouse PWA score ≥ 90 (installable, offline, manifest, service worker).
5. "Add to Home Screen" produces a standalone-launching icon on iPhone + Android.
6. Magic-link auth flow round-trips; `rep` row exists in DB.
7. Map renders OSM tiles centered on a configurable lat/lon.
8. Network-disabled reload still serves the app shell; queued mutation visible in dev tools when offline.
9. `supabase db diff` is clean against committed migration.
10. Repo `Pages` settings show source = GitHub Actions, custom domain = `sunpath.dev`, HTTPS enforced.

**Per-phase acceptance:** each phase's deliverable line in §7 of the design doc is the exit gate. Don't start phase N+1 until rep has used phase N for ≥ 1 week of real door work and the resulting feedback is logged as issues in GitHub Projects.

---

## Decisions captured

- **Single-repo collapse:** design §9 multi-repo plan (`.github`, `sunpath-dev`, `sunpath`, `sunpath-docs`, `parcel-adapters`) is replaced by one repo (`sunpath-dev/sunpath-dev.github.io`). Parcel adapters live in a top-level `parcel-adapters/` folder. Docs live in `docs/`. Org-profile/landing concerns can be split out later if needed.
- **Apex GH Pages site:** this repo is the org user-pages repo, so `base: '/'` in Vite, no project-page path prefix.
- **HashRouter** confirmed (design §12.5) — works on apex Pages without `404.html` tricks.
- **Clean start:** no GitHub repos, no Supabase project, no DNS, no API keys exist yet — every step in Phase 0.1–0.6 must be executed.

## Open questions / further considerations

1. **License?** Design doc doesn't specify. Recommend **MIT** for permissiveness; **AGPL** if you want to keep forks open-source; **proprietary/UNLICENSED** if this stays a private commercial tool. *Default: MIT, change later if needed.*
2. **Husky + commitlint:** minor friction for a solo dev. *Recommendation: skip in Phase 0, add when a second contributor joins.*
3. **Org-level repos** (`.github` defaults, profile repo): design called for them, but with single-repo collapse they're optional. *Recommendation: skip until/unless a second repo exists.*
4. **First county for Phase 1 adapter** — need name + state to scope. Required input before Phase 1 starts.
5. **Apple/Google developer accounts:** not needed until Phase 5 native wrap. Defer.
