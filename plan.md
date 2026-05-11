# Sunpath — Build Plan (full, all phases)

Source of truth: the design doc (v1.3) the user provided. All decisions and specs in §1–§15 of that doc are authoritative; this file is the execution sequence.

## Context locked in
- **Single repo** for everything: `sunpath-dev/sunpath-dev.github.io` (this workspace folder). The multi-repo org structure in design §9 is collapsed into this one repo.
- **Current infra state (updated 2026-05-10):** the Supabase project is **live and provisioned** (`sunpath-dev`, region `us-east-1`, ref `sclisaylpwnffkkyepow`, URL `https://sclisaylpwnffkkyepow.supabase.co`). **21 migrations applied**; **21+ edge functions deployed** including `solar-rooftop` (OSM Overpass fallback) and updated `incentives-fetch` (DSIRE wired); data API reachable for `parcel`, `rep`, `door_event`, `lead`, `trigger_event`, `bill_capture`, `hoa_zone`, `audit_log`. Frontend at `https://sunpath.dev` ships checked-in publishable key fallback so the live PWA targets the real project. **GitHub Actions Supabase workflow now active**: `vars.SUPABASE_ENABLED=true` plus 7 repo secrets configured via `pnpm github:secrets:set`. Secrets and credentials are intentionally **not** recorded in this repo.
- **Scope:** every phase (0 through 5) plus Phase 6 (Property Dashboard sprint) — but plan is organized so phases ship independently.
- **Hosting model:** this repo is the GitHub Pages user/org site → published at `https://sunpath-dev.github.io/` → CNAME `sunpath.dev`. Apex site, not a project page. That means `base: '/'` in Vite is correct and simplifies routing vs. project Pages.
- **POC posture (current).** Everything in Phases 0–6 is a proof of concept. Data protection is intentionally minimal beyond Supabase RLS + HTTPS + standard auth — *no* full security hardening, *no* compliance work, *no* production data-handling guarantees. **Before a real production release** (paying users or a wider rep team) the items in the new "Production hardening (pre-launch)" section must be completed.
- **License:** MIT.
- **First parcel adapter target:** Scott County, VA. Then Russell Co. and surrounding SW Virginia counties.
- **Product direction (locked 2026-05-10):** The **property detail sheet is the primary product**. When a rep taps a house, the sheet must give everything needed for a conversation with that homeowner — sun data, financials, incentives, bill data, neighborhood proof — in one dashboard. The walk list / route builder is an explicitly secondary sub-tool that supports planning, not the main event. Every sprint must advance the property dashboard before touching walk logistics.

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
- **Not a full design platform** — no engineered panel layout (that's Aurora / HelioScope). The *"Build My Solar"* button (see Phase 6-F) gives a visual preview for on-porch pitch; a real designer still produces the engineering proposal post-handoff.
- **Not an installer ops tool** — stops at "sold." Permitting, scheduling, install tracking are out of scope.
- **Not a lead-buying marketplace** — every lead came from a door he knocked.
- **Not (yet) a commission/payout tracker or family-finance view** — explicitly deferred (see "Deferred" below).

It's specifically the **field intelligence layer** between the rep's phone and the doors he knocks — telling him *which* door, *why now*, and capturing *what happened* with as few taps as physically possible.

---

## Product mental model (anchor — re-read when prioritizing)

The user is a **solo solar rep with no marketing budget and no team**. His phone is his entire intelligence platform. The app has three zones:

**Zone 1 — Today dashboard (morning planning, ~10% of time)**
The rep starts here. He sees: today's weather (current + forecast + walk window), any calendar blocks (Google / Outlook — deferred but planned), the top doors to revisit today with reasons, and his stats (doors knocked, streak). He sets his intention for the day and heads out.

**Zone 2 — Map + Property dashboard (the work, ~90% of time)**
The map shows every house in his territory color-coded by knock score. He taps a house and gets a complete briefing dashboard on that property. Before knocking, he wants to know:
- Does this house get good sun? (NREL solar resource, roof orientation, OSM footprint)
- Who lives here, are they the owner, how long have they owned it? (assessor data)
- What are they probably paying? (EIA state avg, or actual bill if previously captured)
- What would solar save them exactly? (PVWatts + financial model + ITC)
- Is the neighborhood trending toward solar? (permit triggers, existing installs)
- Any HOA that would block it?
- What's the best pitch angle? (rate trend +9% YoY, ITC deadline 2032, neighbor proof)

**Zone 3 — Walk sub-tools (supporting, never primary)**
Walk list, route order, outcome logging, revisit queue. These are useful logistics that support the primary work; they are not the reason the rep opens the app. Build them lean. Never prioritize them over Zone 2 data richness.

---

## UI flow & screen mockups

> **Updated 2026-05-10 session 9.** Complete redesign — 6-tab nav, Properties primary dashboard, draggable + collapsible cards on every screen. The old 5-tab (Today/Map/Walk/Bill/Settings) mockups are replaced by the spec below.

---

### Information architecture

#### Bottom navigation — 6 tabs, always in this order

```
┌──────────────────────────────────────────────────────────────────┐
│                         (active screen)                          │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ 🏠 Home │ 🏘 Properties │ 🗺 Map │ ☀ Build │ 📊 Reports │ ⚙ About │
└──────────────────────────────────────────────────────────────────┘
```

- Active tab: amber-600 text + icon. Inactive: slate-400.
- On mobile: fixed 56px bar at bottom, inset for safe area. Keyboard visible → bar hidden (CSS `env(keyboard-inset-height)`).
- On tablet (≥768px) and desktop (≥1024px): collapses to a left-rail sidebar with icon + label.
- **Walk** and **Bill** are NOT tabs. Walk lives inside Properties. Bill is a button inside the property detail.
- **Rule (load-bearing):** never re-add Walk or Bill as primary nav tabs. See CLAUDE.md.

#### Per-dashboard sub-navigation

Each dashboard has its own secondary nav strip (36px tall, slate-100 bg, horizontally scrollable on phones):

| Dashboard | Sub-nav |
|---|---|
| Home | *(none — Home is the root)* |
| Properties | `🔍 Search · 🗺 Map · 🚶 Walk · 📝 Notes · 📊 Stats` |
| Map | `🏠 Home · 🏘 Properties · 🔍 Search · 🛰 Satellite · ⚙ Filters` |
| Build | `🏠 Home · 🏘 Properties` |
| Reports | `🏠 Home · 🏘 Properties` |
| About | *(none)* |

Active sub-nav item: amber underline. Inactive: slate-500 text. Touch target: min 44px tall.

#### Route map

```
/                       → redirect to /home
/home                   → Home dashboard  (was /today)
/properties             → Properties landing
/properties/:id         → Full property dashboard
/properties/walk        → Active walking session  (was /walk)
/properties/notes       → Notes browser — Phase 6-I stub now
/territory              → Map  (URL stays; nav label = "Map")
/build                  → Build My Solar stub
/reports                → Reports stub
/about                  → About / settings  (was /settings)
/settings               → redirect to /about
/today                  → redirect to /home
/walk                   → redirect to /properties/walk
/bill?parcel_id=…       → Bill capture (only entered from property detail)
```

---

### Shared component: `<DashboardCard>`

Every section on every dashboard (except non-draggable headers and action bars) wraps in this component.

**Props:**
```tsx
interface DashboardCardProps {
  id: string;                // unique within dashboard, used as sort key
  title: string;             // header label
  badge?: string | number;   // optional badge (e.g. note count "3")
  collapsedByDefault?: boolean;
  storageKey: string;        // e.g. "dashboard:home" — shared with DashboardCardList
  children: React.ReactNode;
}
```

**Visual anatomy (phone, collapsed = false):**
```
┌──────────────────────────────────────────────┐
│ ⋮⋮  Section title              [badge]   ▾  │  ← header (44px touch target)
├──────────────────────────────────────────────┤
│                                              │
│   … card body content …                     │
│                                              │
└──────────────────────────────────────────────┘
```

**Behavior:**
- `⋮⋮` drag handle: visible on hover/touch; 24×44px touch area; shows grab cursor on desktop.
- `▾` / `▸` collapse chevron: animates 200ms. Collapsed body height = 0px, overflow hidden.
- Drag-to-reorder: powered by `@dnd-kit/sortable` (`useSortable` hook on each card, `SortableContext` in `DashboardCardList`).
- Mobile drag: long-press (500ms) activates drag; visual lift shadow added.
- Desktop drag: click-drag on the `⋮⋮` handle.
- Drop indicator: 2px amber line at insertion point.
- Drag overlay: a semi-transparent clone of the card floats with the cursor.

**Layout persistence — localStorage schema:**
```json
// key: "dashboard:home"
{
  "order": ["full-forecast", "walk-window", "calendar", "planning", "area-intel", "quick-actions", "pitch"],
  "collapsed": { "calendar": true }
}
```
Key naming: `dashboard:{screen}` where screen = `home`, `properties-landing`, `properties-detail`, etc.

**Reset:** Footer link `[↺ Reset layout]` clears the localStorage key and restores default order.

**Post-auth roadmap:** Supabase table `rep_dashboard_layout (rep_id, dashboard, order jsonb, collapsed jsonb)` — sync on login, write on change. Phase 8-D.

**File:** `apps/web/src/components/DashboardCard.tsx`
**List host:** `apps/web/src/components/DashboardCardList.tsx` (wraps `DndContext + SortableContext + DragOverlay`)
**Hook:** `apps/web/src/hooks/useDashboardLayout.ts` (read/write localStorage, returns `{order, collapsed, reorder, toggle}`)

**Dependencies to add:**
```
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

### Design tokens (Tailwind classes used throughout)

| Role | Class |
|---|---|
| Primary action | `bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700` |
| Secondary action | `border border-slate-300 text-slate-700 hover:bg-slate-50` |
| Page background | `bg-slate-50` |
| Card background | `bg-white rounded-xl shadow-sm border border-slate-100` |
| Section header | `text-xs font-semibold uppercase tracking-wide text-slate-500` |
| Body text | `text-sm text-slate-800` |
| Muted text | `text-xs text-slate-500` |
| Error text | `text-xs text-red-600` |
| Score dot red (≥80) | `bg-red-500` |
| Score dot orange (≥60) | `bg-orange-400` |
| Score dot yellow (≥40) | `bg-yellow-400` |
| Score dot amber (<40) | `bg-amber-300` |
| Amber header strip | `bg-amber-500 text-white` |
| Skeleton | `animate-pulse rounded bg-slate-100` |

---

### Screen 1 — Sign-in / Login (`/`)

```
PHONE                               TABLET                                  DESKTOP
┌────────────────────────────────┐  ┌──────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│                                │  │                                  │   │                                              │
│         ☀  Sunpath             │  │        ☀  Sunpath                │   │              ☀  Sunpath                     │
│   Field intelligence for       │  │   Field intelligence for         │   │        Field intelligence for solar reps.    │
│       solar reps.              │  │         solar reps.              │   │                                              │
│                                │  │                                  │   │   ┌──────────────────────────────────────┐   │
│ ┌──────────────────────────┐   │  │  ┌────────────────────────────┐  │   │   │   Continue with Google               │   │
│ │   Continue with Google   │   │  │  │   Continue with Google     │  │   │   └──────────────────────────────────────┘   │
│ └──────────────────────────┘   │  │  └────────────────────────────┘  │   │   ┌──────────────────────────────────────┐   │
│ ┌──────────────────────────┐   │  │  ┌────────────────────────────┐  │   │   │   Continue with Microsoft            │   │
│ │ Continue with Microsoft  │   │  │  │  Continue with Microsoft   │  │   │   └──────────────────────────────────────┘   │
│ └──────────────────────────┘   │  │  └────────────────────────────┘  │   │   ┌──────────────────────────────────────┐   │
│ ┌──────────────────────────┐   │  │  ┌────────────────────────────┐  │   │   │   Continue with Apple                │   │
│ │  Continue with Apple     │   │  │  │   Continue with Apple      │  │   │   └──────────────────────────────────────┘   │
│ └──────────────────────────┘   │  │  └────────────────────────────┘  │   │                                              │
│ ┌──────────────────────────┐   │  │  ┌────────────────────────────┐  │   │   ┌──────────────────────────────────────┐   │
│ │  ▶ Enter as guest (POC)  │   │  │  │  ▶ Enter as guest (POC)   │  │   │   │   ▶ Enter as guest (POC)             │   │
│ └──────────────────────────┘   │  │  └────────────────────────────┘  │   │   └──────────────────────────────────────┘   │
└────────────────────────────────┘  └──────────────────────────────────┘   └──────────────────────────────────────────────┘
```

**Behavior:**
- Google / Microsoft / Apple buttons: visible now, disabled until Phase 8 OAuth wired. Each shows `opacity-50 cursor-not-allowed` + tooltip "Coming soon — Phase 8".
- "Enter as guest (POC)" button: fully active, calls `enter()` from `useAuth()`. Amber fill, full-width on phone.
- Background: `bg-slate-50`. Logo: amber-500 sun icon + "Sunpath" in slate-900.

**File:** `apps/web/src/components/SignInScreen.tsx` (exists — update OAuth buttons)

---

### Screen 2 — Home dashboard (`/home`)

**Purpose:** rep's morning briefing. ~10% of daily usage. Every card is `<DashboardCard>` (draggable + collapsible). The amber weather header is non-draggable.

```
PHONE                                          TABLET (2-col grid)
┌──────────────────────────────────────────┐   ┌─────────────────────────────────────────────────────────┐
│ ╔══════════════════════════════════════╗ │   │ ╔═══════════════════════════════════════════════════╗   │
│ ║ Mon · May 11              ▼ rep ▼   ║ │   │ ║ Mon · May 11                        ▼ rep ▼        ║   │
│ ║ ☀ 72°F clear · 5mph N               ║ │   │ ║ ☀ 72°F clear · wind 5mph N · sunset 8:14           ║   │
│ ║ ☀ sunset 8:14 · 5h 14m left        ║ │   │ ║ 5h 14m of daylight remaining                       ║   │
│ ╚══════════════════════════════════════╝ │   │ ╚═══════════════════════════════════════════════════╝   │
│                                          │   │ ┌─────────────────────────┐ ┌──────────────────────────┐│
│ ⋮⋮ Full day forecast              ▾     │   │ │ ⋮⋮ Full day forecast  ▾ │ │ ⋮⋮ Walk window        ▾  ││
│ ┌──────────────────────────────────────┐│   │ │ 8a  11a  2p   5p   8p   │ │ Route: 8 stops · 1h 40m ││
│ │ 8a  11a  2p  5p   8p                 ││   │ │ 64° 71°  78°  75°  64°  │ │ Best window: 4–7 PM     ││
│ │  ☁   ☀   ☀   ☀    ◐                 ││   │ │  ☁   ☀   ☀    ☀    ◐   │ │ Starts in: 23 min       ││
│ │ 64°  71° 78°  75°  64°               ││   │ │ Walkability: ★ ★ ★      │ │ [▶ Start Walking]       ││
│ │ Walkability: ★ ★ ★                  ││   │ │ Best window: 4–7 PM     │ └──────────────────────────┘│
│ │ Best walk window: 4–7 PM            ││   │ └─────────────────────────┘ ┌──────────────────────────┐│
│ └──────────────────────────────────────┘│   │ ┌─────────────────────────┐ │ ⋮⋮ Calendar          ▾  ││
│                                          │   │ │ ⋮⋮ Planning          ▾  │ │ M  T  W  T  F  S  S    ││
│ ⋮⋮ Walk window                    ▾     │   │ │ 3 callbacks due today   │ │ ●  ●  ◌  ●  ●  ◌  ◌    ││
│ ┌──────────────────────────────────────┐│   │ │ ● 142 Maple — 3d ago    │ │ 🔗 Google · Outlook    ││
│ │ Route: 8 stops · ~1h 40m total walk  ││   │ │ ● 88 Oak — 5d ago       │ │    · Apple  (coming)   ││
│ │ Best window starts in 23 min         ││   │ └─────────────────────────┘ └──────────────────────────┘│
│ │ [▶ Start Walking → Properties/Walk]  ││   │ ┌─────────────────────────┐ ┌──────────────────────────┐│
│ └──────────────────────────────────────┘│   │ │ ⋮⋮ Area Intel        ▾  │ │ ⋮⋮ Quick actions     ▾  ││
│                                          │   │ │ Scott County, VA   ▾    │ │ [▶ Start route]         ││
│ ⋮⋮ Calendar                       ▾     │   │ │ Owner-occ 78%           │ │ [🗺 Open map]           ││
│ ┌──────────────────────────────────────┐│   │ │ Median income $52,400   │ │ [💬 Pitch scripts]      ││
│ │ M   T   W   T   F   S   S            ││   │ │ Utility $0.142/kWh +9%  │ └──────────────────────────┘│
│ │ ●   ●   ◌   ●   ●   ◌   ◌           ││   │ └─────────────────────────┘                            │
│ │ 🔗 Connect Google Calendar           ││   │   [↺ Reset layout]                                     │
│ │ 🔗 Connect Outlook                   ││   ├─────────────────────────────────────────────────────────┤
│ │ 🔗 Connect Apple Calendar            ││   │ 🏠 Home  🏘 Prop  🗺 Map  ☀ Build  📊 Rpts  ⚙ About    │
│ │ (all disabled — Phase 8)             ││   └─────────────────────────────────────────────────────────┘
│ └──────────────────────────────────────┘│
│                                          │   DESKTOP (left rail + 3-col card grid)
│ ⋮⋮ Planning                       ▾     │   ┌────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────┐│   │ ┌──────┐  Mon · May 11                               ▼ rep ▼        │
│ │ 3 callbacks due today                ││   │ │ 🏠   │  ☀ 72°F clear · 5mph N · sunset 8:14 · 5h 14m left        │
│ │ ● 142 Maple — 3d ago       [View]   ││   │ │ Home │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│ │ ● 88 Oak — 5d ago          [View]   ││   │ │ 🏘   │  │⋮⋮Forecast▾│ │⋮⋮Walk Wnd▾│ │⋮⋮Calendar▾│ │⋮⋮Plan ▾│  │
│ │ ● 14 Cherry — 6d ago       [View]   ││   │ │ Prop │  │ 8a 11a 2p │ │8 stops     │ │M T W T F  │ │3 callbks│  │
│ │ Todos: 2 open                        ││   │ │ 🗺   │  │ ★ ★ ★     │ │~1h 40m     │ │● ● ◌ ● ● │ │●142Mapl │  │
│ └──────────────────────────────────────┘│   │ │ Map  │  │4–7PM best │ │[▶ Start]   │ │coming...  │ │●88 Oak  │  │
│                                          │   │ │ ☀    │  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│ ⋮⋮ Area Intelligence              ▾     │   │ │ Build│  ┌────────────┐ ┌────────────┐                               │
│ ┌──────────────────────────────────────┐│   │ │ 📊   │  │⋮⋮AreaIntel│ │⋮⋮Actions  │  [↺ Reset layout]             │
│ │ Scott County, VA         ▾ change    ││   │ │ Rpts │  │ScottCo VA │ │[▶ Start]   │                               │
│ │ Owner-occ 78% · Inc $52,400          ││   │ │ ⚙    │  │78% own-occ│ │[🗺 Map]    │                               │
│ │ Med home $115,200                    ││   │ │ About│  └────────────┘ └────────────┘                               │
│ │ $0.142/kWh (+9% YoY)                ││   │ └──────┘                                                               │
│ │ 3 solar permits last 30d             ││   └────────────────────────────────────────────────────────────────────────┘
│ └──────────────────────────────────────┘│
│                                          │
│ ⋮⋮ Quick actions                  ▾     │
│ ┌──────────────────────────────────────┐│
│ │ [▶ Start route]  [🗺 Open map]       ││
│ │ [💬 Pitch scripts]                   ││
│ └──────────────────────────────────────┘│
│                                          │
│   [↺ Reset layout]                       │
├──────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                          │
└──────────────────────────────────────────┘
```

**Home — section-by-section data flow:**

| Section | Data source | Empty state | Loading state | storageKey id |
|---|---|---|---|---|
| Weather header (non-draggable) | `weather-now` edge fn → NWS | "Allow location for weather" | Inline "Loading…" | — |
| Full day forecast | Same edge fn — extend for hourly | "Forecast unavailable" | Skeleton rows | `full-forecast` |
| Walk window | localStorage `route` + forecast | "Plan your route in Properties first" + [Open Properties] | Shows once route + weather loaded | `walk-window` |
| Calendar | Disabled OAuth — no data yet | "Connect your calendar (Phase 8)" | N/A | `calendar` |
| Planning | `door_event` where outcome='callback' last 30d | "No callbacks logged — knock some doors" | Skeleton rows | `planning` |
| Area Intelligence | `geo-reverse` edge fn → census-fetch | "Allow location for area data" | Skeleton tiles | `area-intel` |
| Quick actions | None | N/A | N/A | `quick-actions` |
| Pitch scripts | Static — no data fetch | N/A | N/A | `pitch` |

**Bugs fixed in this screen:**
1. `sunsetCountdown()` — fix to handle ISO 8601 TZ strings AND time-only strings. Add 60s interval refresh.
2. Area Intelligence hardcode — replace `state_fips: "51", county_fips: "169"` with `geo-reverse` edge fn call keyed on GPS; quick-switch picker stored in `localStorage["dashboard:home:area-override"]`.

**File:** `apps/web/src/modules/home/route.tsx` (new; replaces `today/route.tsx` which remains as a redirect)

---

### Screen 3 — Properties landing (`/properties`)

**Purpose:** starting point for field work. Three cards: search, today's walk plan, recently viewed.

```
PHONE                                              TABLET / DESKTOP
┌────────────────────────────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│ Properties                                 │     │ Properties                                               │
│ 🔍 Search · 🗺 Map · 🚶 Walk · 📝 Notes   │     │ 🔍 Search · 🗺 Map · 🚶 Walk · 📝 Notes · 📊 Stats      │
├────────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ ⋮⋮ Search                            ▾     │     │ ┌───────────────────────────┐ ┌───────────────────────────┐│
│ ┌──────────────────────────────────────┐   │     │ │ ⋮⋮ Search             ▾   │ │ ⋮⋮ Today's Walk Plan  ▾   ││
│ │ 🔍 Type address or owner name…       │   │     │ │ 🔍 Type address…          │ │ 8 houses · ~1h 40m walk   ││
│ └──────────────────────────────────────┘   │     │ │                           │ │ 🔴 142 Maple  92  0.0mi   ││
│ Results dropdown when typing:              │     │ │ Matches appear here       │ │ 🟠 88 Oak     78  0.3mi   ││
│ ┌──────────────────────────────────────┐   │     │ │  142 Maple  score 92  ▸   │ │ 🟡 14 Cherry  64  0.5mi   ││
│ │ 🔴 142 Maple St   score 92    ▸      │   │     │ │  88 Oak     score 78  ▸   │ │ 🟢 7 Pine     58  0.8mi   ││
│ │ 🟠 88 Oak Ave     score 78    ▸      │   │     │ │  14 Cherry  score 64  ▸   │ │ … +4 more                 ││
│ │ 🟡 14 Cherry Ln   score 64    ▸      │   │     │ └───────────────────────────┘ │ [▶ Start Walk]  [+ Add]   ││
│ └──────────────────────────────────────┘   │     │ ┌───────────────────────────┐ └───────────────────────────┘│
│                                            │     │ │ ⋮⋮ Recently viewed    ▾   │                              │
│ ⋮⋮ Today's Walk Plan                 ▾     │     │ │ 142 Maple St  2 min ago   │                              │
│ ┌──────────────────────────────────────┐   │     │ │ 88 Oak Ave    12 min ago  │                              │
│ │ 8 houses · ~1h 40m walk              │   │     │ │ 14 Cherry Ln  1 hr ago    │                              │
│ │ 🔴 142 Maple  92   0.0 mi  ✓ done   │   │     │ │ 7 Pine Ct     yesterday   │                              │
│ │ 🟠 88 Oak     78   0.3 mi  ⏳ next  │   │     │ │ +6 more      [View all]   │                              │
│ │ 🟡 14 Cherry  64   0.5 mi            │   │     │ └───────────────────────────┘                              │
│ │ 🟢 7 Pine     58   0.8 mi            │   │     │   [↺ Reset layout]                                         │
│ │ … +4 more                            │   │     ├──────────────────────────────────────────────────────────┤
│ │ [▶ Start Walk]    [+ Add house]      │   │     │ 🏠 🏘 🗺 ☀ 📊 ⚙                                          │
│ └──────────────────────────────────────┘   │     └──────────────────────────────────────────────────────────┘
│                                            │
│ ⋮⋮ Recently viewed                   ▾     │
│ ┌──────────────────────────────────────┐   │
│ │ 142 Maple St    2 min ago    [Open]  │   │
│ │ 88 Oak Ave      12 min ago   [Open]  │   │
│ │ 14 Cherry Ln    1 hr ago     [Open]  │   │
│ │ 7 Pine Ct       yesterday    [Open]  │   │
│ │ + 6 more               [View all →] │   │
│ └──────────────────────────────────────┘   │
│                                            │
│   [↺ Reset layout]                         │
├────────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                            │
└────────────────────────────────────────────┘
```

**Properties landing — data flow:**

| Section | Data source | Persistence | Empty state |
|---|---|---|---|
| Search | Supabase `parcel` full-text (address_line1) debounced 300ms | Session only | "Type to search properties" |
| Today's Walk Plan | `localStorage["route"]` (RouteEntry[]) | Persists across sessions | "No route planned. Open the map, tap a property, hit Add to route." + [Open Map] |
| Recently viewed | `localStorage["properties:recent"]` (max 10, {id, address, score, viewedAt}) | Persists across sessions, max 10 | "Tap any property on the map or use search." |

Sub-nav behavior:
- `🔍 Search` → focuses the search input and scrolls to top
- `🗺 Map` → `navigate('/territory')`
- `🚶 Walk` → `navigate('/properties/walk')` (disabled + tooltip if route is empty)
- `📝 Notes` → `navigate('/properties/notes')` (stub)
- `📊 Stats` → opens a small modal with knock count, callback count, bills captured count

**File:** `apps/web/src/modules/properties/route.tsx`

---

### Screen 4 — Property detail board (`/properties/:id`) — THE primary screen

Every section is a `<DashboardCard>`. The amber header and the sticky action bar are non-draggable.

```
PHONE
┌──────────────────────────────────────────────────────┐
│ ← 142 Maple St                     [📌] [🔗] [✕]    │  ← non-draggable header
│ Gate City, VA 24251                                  │
│ ──────────────────────────────────────────────────   │
│ KNOCK 92  ●HOA green  ★ Bill linked                  │  ← hero strip (non-draggable)
│ $1,620/yr savings · Payback 8.1y · ☀ 4.8 hrs/day    │
│ ──────────────────────────────────────────────────   │
│ ⋮⋮ Property owner                             ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ Owner: J. Smith  (redacted per privacy policy) │   │
│ │ Owner-occupied · purchased 2018                │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Home facts                                  ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ Built 1987 · 1,420 sqft · South-facing         │   │
│ │ Assessed $142,000 · Last sold 2018 $128,000    │   │
│ │ FEMA flood zone: X (low risk)                  │   │
│ │ Roof age proxy: permit re-roof 2014            │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Area context (Census ACS 5-yr)             ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ 78% owner-occupied                             │   │
│ │ Median income $52,400                          │   │
│ │ Median home value $115,200                     │   │
│ │ Energy burden 4.8% · Broadband adoption 79%   │   │
│ │ Median tenure 14.3 yrs                         │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Energy & solar                             ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ Utility: AEP Appalachian Power                 │   │
│ │ Rate: $0.142/kWh (+9.0% YoY — EIA trend)      │   │
│ │ ☀ Peak sun: 4.8 hrs/day (NREL solar resource)  │   │
│ │ State avg: 1,050 kWh/mo (EIA VA baseline)      │   │
│ │ ─────── ★ Bill captured 2026-05-09 ──────────  │   │
│ │   Your usage: 1,140 kWh/mo                     │   │
│ │   Utility: AEP · Rate: $0.142/kWh              │   │
│ │   Annual total: ~13,680 kWh/yr                 │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Roof analysis                              ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ Orientation: South-facing                      │   │
│ │ Viable area: ~940 sqft (OSM Overpass estimate) │   │
│ │ Max system: 7.2 kW · ~18 panels               │   │
│ │ Source: OSM Overpass fallback                  │   │
│ │ (Google Solar API unlocks exact segments)      │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Financial model                            ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ ★ Based on your actual bill                    │   │
│ │ Annual savings: $1,620/yr                      │   │
│ │ Payback: 8.1 yrs (with 30% federal ITC)       │   │
│ │ 25-yr net savings: ~$21,400                    │   │
│ │ [⚙ Adjust assumptions]                         │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Incentives                                 ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ Federal ITC: 30% (no cap · through 2032)       │   │
│ │ VA Solar Rebate: 25% (state — DSIRE)           │   │
│ │ Net metering: Yes, 1:1 (Dominion VA)           │   │
│ │ Source: DSIRE API + IRS Publication 946        │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Neighborhood proof                         ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ ◆ 3 solar permits within ¼ mi · last 30 days   │   │
│ │   Trend: ↑ +3 vs prior 30 days                 │   │
│ │ ◆ 2 home sales nearby · median $135,000        │   │
│ │ ◆ Solar adoption: 11 / 187 homes (5.9%)        │   │
│ │ ◆ HOA: Maple Hills — solar approved ✓          │   │
│ │ ◆ Solar permits this year: 14                  │   │
│ │ ◆ Avg nearby system size: 6.8 kW               │   │
│ │ [🗺 View heat map →]                            │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Notes  [3]                                 ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ 2026-05-08  Husband works nights, kids home    │   │
│ │   weekends. Wants HOA approval first.     [✎]  │   │
│ │ 2026-05-01  Roof looks newer than 1987.   [✎]  │   │
│ │ 2026-04-22  Initial knock, no answer.     [✎]  │   │
│ │ ──────────────────────────────────────────     │   │
│ │ [+ Text note]         [🎤 Voice note]          │   │
│ └────────────────────────────────────────────────┘   │
│ ⋮⋮ Activity history                           ▾      │
│ ┌────────────────────────────────────────────────┐   │
│ │ 2026-05-09 · Bill captured                     │   │
│ │ 2026-05-08 · Knock → Callback                  │   │
│ │ 2026-05-01 · Knock → No answer                 │   │
│ │ 2026-04-22 · Knock → No answer                 │   │
│ └────────────────────────────────────────────────┘   │
│   [↺ Reset layout]                                   │
│                                                      │
│ ╔════════════════════════════════════════════════╗   │  ← sticky action bar (non-draggable)
│ ║  [📄 Capture Bill]      [☀ Build My Solar]    ║   │
│ ║  [➕ Route]  [▶ Knock]  [🖨 Doorcard]  [💬]  ║   │
│ ╚════════════════════════════════════════════════╝   │
├──────────────────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                                      │
└──────────────────────────────────────────────────────┘

TABLET / DESKTOP (2-column layout)
┌────────────────────────────────────────────────────────────────────────────────┐
│ ← 142 Maple St                                          [📌] [🔗] [✕]         │
│ Gate City, VA 24251                                                            │
│ ────────────────────────────────────────────────────────────────────────────   │
│ KNOCK 92  ● HOA green  ★ Bill linked  ·  $1,620/yr · 8.1y payback · 4.8h sun  │
│ ────────────────────────────────────────────────────────────────────────────   │
│ LEFT COLUMN (sortable cards)              │ RIGHT COLUMN (sticky summary panel) │
│ ⋮⋮ Property owner              ▾         │ ╔══════════════════════════════╗   │
│ ⋮⋮ Home facts                  ▾         │ ║  $1,620/yr savings           ║   │
│ ⋮⋮ Area context                ▾         │ ║  Payback: 8.1 yrs w/ ITC    ║   │
│ ⋮⋮ Energy & solar              ▾         │ ║  25-yr net: ~$21,400         ║   │
│ ⋮⋮ Roof analysis               ▾         │ ╚══════════════════════════════╝   │
│ ⋮⋮ Financial model             ▾         │ [📄 Capture Bill]                  │
│ ⋮⋮ Incentives                  ▾         │ [☀ Build My Solar]                 │
│ ⋮⋮ Neighborhood proof          ▾         │ ─────────────────────────────────   │
│ ⋮⋮ Notes [3]                   ▾         │ [➕ Route]  [▶ Knock]               │
│ ⋮⋮ Activity history            ▾         │ [🖨 Doorcard]  [💬 Pitch]          │
│   [↺ Reset layout]                       │                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Property detail — every button, exhaustively:**

| Location | Button | Action |
|---|---|---|
| Header | `←` Back | `navigate('/properties')` |
| Header | `📌` Pin | Moves this property to top of Recently viewed in localStorage |
| Header | `🔗` Share | Copies deep-link URL to clipboard; or opens share sheet on mobile |
| Header (bottom-sheet only) | `✕` Close | Dismisses bottom sheet, stays on map |
| Header (bottom-sheet only) | `→ Open full dashboard` | `navigate('/properties/:id')` |
| Neighborhood proof card | `🗺 View heat map →` | `navigate('/territory?heatmap=1')` — Phase 6-E |
| Financial model card | `⚙ Adjust assumptions` | Opens modal: ITC %, system cost $/W, annual rate escalator |
| Notes card | `+ Text note` | Opens inline textarea (same NoteEditor component) |
| Notes card | `🎤 Voice note` | Opens NoteEditor with Web Speech mic active |
| Notes card | `✎` (per row) | Opens NoteEditor pre-filled with that note |
| Sticky bar primary | `📄 Capture Bill` | `navigate('/bill?parcel_id=…&address=…')` |
| Sticky bar primary | `☀ Build My Solar` | `navigate('/build')` OR opens Build My Solar modal if a property is pre-selected |
| Sticky bar secondary | `➕ Route` | Calls `addToRoute(parcel)` from `route.ts`. Toggles to `[− Route]` when already in list |
| Sticky bar secondary | `▶ Knock` | Opens disposition picker inline above the bar |
| Sticky bar secondary | `🖨 Doorcard` | Calls `doorcard-pdf/` edge function; opens PDF in new tab |
| Sticky bar secondary | `💬 Pitch` | Opens pitch scripts modal (same modal as Home) |

**Property detail — data sources:**

| Card | Source | Skeleton? | Error fallback |
|---|---|---|---|
| Header | `parcel` table | N/A | "Property not found" |
| Property owner | `parcel` table (`owner_name_redacted`, `owner_occupied`, `year_built`, `assessed_value_usd`) | Yes | Section hidden |
| Home facts | `parcel` table | Yes | Section hidden |
| Area context | `census-fetch` edge fn | Yes | "Census data unavailable" |
| Energy & solar | `pvwatts-fetch` + `utility_rate_observation` + `bill_capture` | Yes | EIA fallback + state avg |
| Roof analysis | `solar-rooftop` edge fn (OSM fallback) | Yes | "Roof data unavailable" |
| Financial model | Computed from above fields | Yes | "Provide bill data for a real estimate" |
| Incentives | `incentives-fetch` edge fn (DSIRE) | Yes | Hardcoded ITC + state fallback |
| Neighborhood proof | `trigger_event` + `parcel` (nearby) | Yes | "No permit data on record" |
| Notes | Dexie first → Supabase `parcel_note` | No (instant from Dexie) | Dexie-only |
| Activity history | `door_event` | Yes | "No activity logged" |

**File:** `apps/web/src/modules/properties/PropertyDetailRoute.tsx`
**Reuses:** `apps/web/src/modules/territory/ParcelDetailSheet.tsx` (refactor: extract the section JSX into the page; sheet uses same sections in compact mode)

---

### Screen 5 — Walk session (`/properties/walk`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌───────────────────────────────────────────────────────────┐
│ ← Walk session  ☀ 72°F · 4h 12m left  │     │ Walk session  ☀ 72°F · sunset 8:14 · 4h 12m daylight left│
│ Progress: 1 / 8 done                   │     │ ┌─────────────────────────┬───────────────────────────────┐│
├────────────────────────────────────────┤     │ │ ROUTE  (8 stops)         │ CURRENT STOP                  ││
│ ▶ CURRENT TARGET                       │     │ │ 🔴 142 Maple  92  ◀now  │ 142 Maple St                  ││
│ 142 Maple St, Gate City VA            │     │ │ 🟠 88 Oak     78        │ Knock score: 92 · HOA green ● ││
│ Score 92 · South-facing               │     │ │ 🟡 14 Cherry  64        │ Built 1987 · 1,420 sqft       ││
│ Built 1987 · 1,420 sqft              │     │ │ 🟢 7 Pine     58        │ S-facing · ★ Bill linked      ││
│ ★ Bill linked · $1,620/yr savings    │     │ │ 🟢 33 Birch   55        │ $1,620/yr savings             ││
│ ──────────────────────────────────── │     │ │ 🟢 22 Elm     52        │ [Open full dashboard →]       ││
│ [Open full dashboard →]               │     │ │ 🟢 11 Aspen   50        │ ──────────────────────────────││
│ ──────────────────────────────────── │     │ │ 🟢 5 Maple Ct 48        │ DISPOSITION                   ││
│ DISPOSITION                           │     │ │                         │ ┌────────┬────────┬──────────┐ ││
│ ┌──────────┬──────────┬──────────┐    │     │ │                         │ │No ans  │Soft no │ Hard no  │ ││
│ │ No ans   │ Soft no  │ Hard no  │    │     │ │                         │ ├────────┼────────┼──────────┤ ││
│ ├──────────┼──────────┼──────────┤    │     │ │                         │ │Callback│  Sit   │  Sale    │ ││
│ │ Callback │   Sit    │  Sale    │    │     │ │                         │ └────────┴────────┴──────────┘ ││
│ └──────────┴──────────┴──────────┘    │     │ │                         │ [📝 Quick note] [🎤 Voice]    ││
│                                       │     │ │                         │ [▶ Next door]                 ││
│ [📝 Quick note]   [🎤 Voice note]    │     │ └─────────────────────────┴───────────────────────────────┘│
│ [▶ Next door →]                       │     └───────────────────────────────────────────────────────────┘
├────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │
└────────────────────────────────────────┘
```

**Walk session state machine:**
- `idle` → rep selects "Start Walk" from Home or Properties landing
- `active` → displaying current target. All disposition buttons active.
- `recording_note` → note textarea / voice mic open
- `completed` → all stops worked; shows summary (total knocked, outcomes)

**Disposition tap behavior:**
1. Tap any disposition button → calls `recordDoorEvent(parcel_id, outcome, {gps, timestamp, weather_snapshot})`
2. Outcome written to Dexie first (instant) → synced to Supabase via outbox
3. Parcel row in route list shows status pill: ✓ done / ↩ callback / etc.
4. Auto-advance: after 1.5s delay, moves to next unworked stop (can be overridden by tapping a row)

**Quick note / voice:** same NoteEditor component used in property detail, linked to current stop's parcel_id.

**File:** `apps/web/src/modules/properties/WalkRoute.tsx` (relocated from `walk/route.tsx`)

---

### Screen 6 — Map / Territory (`/territory`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌───────────────────────────────────────────────────────────┐
│ Map                                    │     │ Map                                                       │
│ 🏠 Home · 🏘 Prop · 🔍 · 🛰 · ⚙ Fltr │     │ 🏠 Home · 🏘 Properties · 🔍 Search · 🛰 Satellite · ⚙Fltr│
├────────────────────────────────────────┤     ├───────────────────────────────────────────────────────────┤
│ 🔍 Type address to jump to…            │     │ 🔍 Type address to jump to…               [Filters ▼]    │
│ ──────────────────────────────────── │     │                                                           │
│       ●●  ●●  ●      (score-tinted)  │     │      ●●●  ●●           ●●  ●●  ●  ●●●                     │
│      ●  ●  ●●●       red=high        │     │     ● ● ● ● ●●●        ●● ●● ●●  ●● ●                     │
│     ●●● ●●● ● ●      amber=lower     │     │      ● ●● ●●●  ●  ●●● ●●● ●   ●  ● ●                     │
│      ● ●●  ● ●                       │     │     ● ●  ●● ●● ● ●  ● ●●●  ●  ● ●                         │
│     ●●● ●●●  ●                       │     │                                                           │
│                                      │     │ Gate City · 47 parcels in view · cold ●●●● hot score      │
│ Gate City · 47 parcels               │     │ [☑ Heat map overlay]                                      │
│ [☑ Heat map]                         │     │                                                           │
│                                      │     │ ← Pin tap opens this bottom sheet:                        │
│ ─── (pin tap → bottom sheet) ───     │     │  ┌─────────────────────────────────────────────────────┐  │
│ ┌────────────────────────────────┐   │     │  │ 142 Maple St    [Open full dashboard →]    [✕]      │  │
│ │ 142 Maple St                   │   │     │  │ Knock 92 · HOA green · South-facing                  │  │
│ │ [Open full dashboard →]  [✕]  │   │     │  │ Built 1987 · $142k assessed                          │  │
│ │ Score 92 · HOA green ●         │   │     │  │ $1,620/yr savings · 4.8 hrs/day sun                  │  │
│ │ Built 1987 · 1,420 sqft        │   │     │  │ [📄 Capture Bill] [➕ Route] [▶ Knock]               │  │
│ │ $1,620/yr est · 4.8 sun hrs    │   │     │  └─────────────────────────────────────────────────────┘  │
│ │ [📄 Bill] [➕ Route] [▶ Knock] │   │     │                                                           │
│ └────────────────────────────────┘   │     ├───────────────────────────────────────────────────────────┤
├────────────────────────────────────────┤     │ 🏠 🏘 🗺 ☀ 📊 ⚙                                          │
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │     └───────────────────────────────────────────────────────────┘
└────────────────────────────────────────┘
```

**Map features (all current + additions):**
- Score-tinted pins (red ≥80, orange ≥60, yellow ≥40, amber <40)
- Satellite / OSM toggle (🛰)
- Filter panel: score range slider, owner-occupied checkbox, has-bill-captured badge, in-route badge
- **Heat map overlay** (Phase 6-E): MapLibre heatmap layer of `parcel.score` values
- Address search: `AddressSearch` component, on result → `flyTo` + open bottom sheet
- Pin tap → bottom sheet preview with `Open full dashboard →` link
- Long-press on pin → quick summary tooltip without full sheet
- Cluster pins at zoom < 12 (Phase 6.5)

**File:** `apps/web/src/modules/territory/route.tsx` (existing — add sub-nav strip, add "Open full dashboard →" to sheet)

---

### Screen 7 — Bill capture (`/bill?parcel_id=&address=`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│ ← Capture bill                         │     │ ← Capture bill                                           │
│ Linked to: 142 Maple St                │     │ Linked to: 142 Maple St, Gate City VA 24251              │
├────────────────────────────────────────┤     ├─────────────────────────────┬────────────────────────────┤
│ Select input mode:                     │     │ INPUT MODE                  │ PARSED / LIVE CROSSCHECK   │
│ [📷 Photo] [📁 File] [✎ Manual]        │     │ [📷 Photo][📁 File][✎ Man]  │ Utility:  AEP              │
│                                        │     │                             │ Total kWh: 1,140           │
│ Selected: ✎ Manual entry               │     │ Utility:   [AEP__________]  │ Rate:     $0.142/kWh       │
│ ──────────────────────────────────── │     │ Total kWh: [1140_________]  │ Total:    $162.13          │
│ Utility:     [AEP__________]          │     │ Rate:      [0.142________]  │ Period:   Apr 12–May 11   │
│ Total kWh:   [1140_________]          │     │ Total $:   [162.13_______]  │ ─────────────────────────  │
│ Rate $/kWh:  [0.142________]          │     │ Period:    [Apr12–May11__]  │ Annualized: 13,680 kWh/yr │
│ Total $:     [162.13_______]          │     │                             │ PVWatts est: 9,840 kWh/yr │
│ Period:      [Apr 12–May 11]          │     │ [💾 Save to 142 Maple St]   │ → Est savings: ~$1,400/yr │
│                                        │     │                             │ ⓘ No PII — addr-linked    │
│ [💾 Save to 142 Maple St]             │     └─────────────────────────────┴────────────────────────────┘
│ ⓘ No personal info stored.            │
│   Only kWh, rate, dates linked to      │
│   the property address.               │
├────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │
└────────────────────────────────────────┘
```

**Bill capture — modes:**
- **📷 Photo** — opens camera; on-device OCR (Tesseract.js) parses kWh + rate + dates; results pre-fill fields for confirmation
- **📁 File** — file picker for a saved bill image; same OCR pipeline
- **✎ Manual** — form fields only (current behavior)

**Save behavior:** writes to `bill_capture` via Dexie outbox (instant) → Supabase sync. Navigates back to `/properties/:id` after save.

**No parcel_id guard:** if visited without `?parcel_id=`, show a warning "Open a property first, then tap Capture Bill" with [Open Properties →] link.

**File:** `apps/web/src/modules/bill/route.tsx` (existing — add the guard, no other changes)

---

### Screen 8 — Build My Solar (`/build`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│ Build My Solar                         │     │ Build My Solar                                           │
│ 🏠 Home · 🏘 Properties                │     │ 🏠 Home · 🏘 Properties                                  │
├────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ ☀ Coming Soon                          │     │ ☀ Coming Soon                                            │
│                                        │     │                                                          │
│ Aerial roof imagery with panel layout, │     │   Aerial roof imagery with panel layout                  │
│ exact system size, and per-panel       │     │   · Exact system size, per-panel production              │
│ production estimates.                  │     │   · 3D rotate · Compare configurations                   │
│                                        │     │   · Lock in system size and panel count                  │
│ · 3D rotate                            │     │                                                          │
│ · Compare configurations               │     │   Selling tool for the porch — show the homeowner        │
│ · Per-panel production estimates       │     │   exactly what their roof will look like.                 │
│                                        │     │                                                          │
│ Powered by Google Solar API +          │     │   Powered by Google Solar API + satellite imagery         │
│ satellite imagery (Google Solar API    │     │   (GOOGLE_SOLAR_API_KEY required — see TODO.md)          │
│ key required — see TODO.md)            │     │                                                          │
│                                        │     │   [Open builder for: 142 Maple St]  (disabled)          │
│ [Open builder for current property]    │     │                                                          │
│  (disabled — select a property first) │     ├──────────────────────────────────────────────────────────┤
├────────────────────────────────────────┤     │ 🏠 🏘 🗺 ☀ 📊 ⚙                                          │
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │     └──────────────────────────────────────────────────────────┘
└────────────────────────────────────────┘
```

The "Open builder" button becomes active if a property was recently viewed (reads `localStorage["properties:recent"][0]`). Pre-populates with that parcel's details. When Google Solar API key is not set, shows the OSM-estimated values and a note "Upgrade to Google Solar API for exact roof segments."

**File:** `apps/web/src/modules/build/route.tsx` (new)

---

### Screen 9 — Reports (`/reports`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│ Reports                                │     │ Reports                                                  │
│ 🏠 Home · 🏘 Properties                │     │ 🏠 Home · 🏘 Properties                                  │
├────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ 📊 Coming Soon                         │     │ 📊 Coming Soon                                           │
│                                        │     │                                                          │
│ · Daily + weekly summaries             │     │   Daily and weekly summaries                             │
│ · Conversion funnel by trigger reason  │     │   · Conversion funnel by trigger reason                  │
│ · Objection analysis from notes        │     │   · Objection analysis from notes (Phase 7 AI)           │
│ · Best-time-of-day patterns            │     │   · Best-time-of-day patterns                            │
│ · Note search across properties        │     │   · Note search across all properties                    │
│ · PDF / text / CSV export              │     │   · PDF / text / CSV export                              │
│                                        │     │                                                          │
│ [Generate today's summary] (disabled)  │     │   [Generate today's summary]   [Export this week]       │
│                                        │     │   (both disabled — Phase 6-I)                           │
├────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │     │ 🏠 🏘 🗺 ☀ 📊 ⚙                                          │
└────────────────────────────────────────┘     └──────────────────────────────────────────────────────────┘
```

**File:** `apps/web/src/modules/reports/route.tsx` (new)

---

### Screen 10 — About / Settings (`/about`)

```
PHONE                                          TABLET / DESKTOP
┌────────────────────────────────────────┐     ┌──────────────────────────────────────────────────────────┐
│ About                                  │     │ About                                                    │
├────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ Rep ID: poc-abc123 (POC mode)          │     │ Rep ID: poc-abc123  (POC mode — no auth)                 │
│ Auth: One-tap guest entry              │     │ Auth: One-tap guest entry                                │
│ [Sign out]                             │     │ [Sign out]                                               │
│ ──────────────────────────────────── │     │ ────────────────────────────────────────────────────────  │
│ Push notifications: [✔ enabled]        │     │ Push notifications: [✔ enabled]                          │
│ Default area: Scott County, VA    ▾    │     │ Default area: Scott County, VA  ▾ (overrides GPS)        │
│ Reset all dashboard layouts: [Reset]   │     │ Reset all dashboard layouts: [Reset all]                 │
│ ──────────────────────────────────── │     │ ────────────────────────────────────────────────────────  │
│ Version 0.6.5  ·  Build 8caa932        │     │ Version 0.6.5  ·  Build 8caa932                          │
│ [Roadmap]  [Privacy]  [Support]        │     │ [Roadmap]  [Privacy]  [Support]                          │
├────────────────────────────────────────┤     ├──────────────────────────────────────────────────────────┤
│ 🏠 🏘 🗺 ☀ 📊 ⚙                        │     │ 🏠 🏘 🗺 ☀ 📊 ⚙                                          │
└────────────────────────────────────────┘     └──────────────────────────────────────────────────────────┘
```

**File:** `apps/web/src/modules/settings/route.tsx` (existing — rename route alias to `/about`, add layout reset button)

---

### Advanced neighborhood data (Neighborhood proof card — full data list)

These data points all live in the "Neighborhood proof" `<DashboardCard>` on the property detail board:

| Data point | Source | Status |
|---|---|---|
| Solar permits within ¼ mi, last 30d | `trigger_event` table | ✅ wired |
| Trend vs prior 30d (↑ ↓ →) | Derived from `trigger_event` | 🔲 build in Phase 6.5 |
| Recent home sales nearby, median price | `trigger_event` (type='sale') | ✅ wired |
| Solar adoption rate (% of nearby homes) | `parcel.has_existing_solar` count | 🔲 build in Phase 6.5 |
| HOA status + ruling | `hoa_zone` table | ✅ wired |
| Solar permits this year (annual) | `trigger_event` count YTD | 🔲 build in Phase 6.5 |
| Avg system size of nearby installs (kW) | `trigger_event` metadata | 🔲 Phase 6.5 if data available |
| `[🗺 View heat map →]` | Link to `/territory?heatmap=1` | Phase 6-E |
| Neighborhood momentum signal (qualitative) | Claude API summary | Phase 7-A |
| Best pitch angle for this block | Claude analysis | Phase 7-B |

---

### Files to create

| Path | Purpose |
|---|---|
| `apps/web/src/components/DashboardCard.tsx` | Reorderable + collapsible card wrapper |
| `apps/web/src/components/DashboardCardList.tsx` | `DndContext + SortableContext + DragOverlay` host |
| `apps/web/src/hooks/useDashboardLayout.ts` | localStorage read/write for layout state |
| `apps/web/src/modules/home/route.tsx` | Home dashboard (replaces today/route.tsx) |
| `apps/web/src/modules/properties/route.tsx` | Properties landing page |
| `apps/web/src/modules/properties/PropertyDetailRoute.tsx` | Full-page property detail |
| `apps/web/src/modules/properties/WalkRoute.tsx` | Walk session (relocated) |
| `apps/web/src/modules/properties/NotesRoute.tsx` | Notes browser stub |
| `apps/web/src/modules/properties/SubNav.tsx` | Per-dashboard sub-nav strip component |
| `apps/web/src/modules/build/route.tsx` | Build My Solar stub |
| `apps/web/src/modules/reports/route.tsx` | Reports stub |
| `supabase/functions/geo-reverse/index.ts` | Nominatim reverse geocode → county/state |

### Files to modify

| Path | Change |
|---|---|
| `apps/web/src/components/AppShell.tsx` | 5-tab → 6-tab nav; left rail on desktop ≥1024px |
| `apps/web/src/App.tsx` | Add new routes; redirects for `/`, `/today`, `/walk`, `/settings` |
| `apps/web/src/modules/today/route.tsx` | Convert to redirect → `/home` |
| `apps/web/src/modules/territory/route.tsx` | Add sub-nav strip at top |
| `apps/web/src/modules/territory/ParcelDetailSheet.tsx` | Add "Open full dashboard →" link |
| `apps/web/src/modules/bill/route.tsx` | Add no-parcel-id guard |
| `apps/web/src/modules/settings/route.tsx` | Route alias `/about`; add layout reset button |
| `CLAUDE.md` | Add "Navigation hard rule: 6 tabs, never re-add Walk or Bill" |
| `ROADMAP.md` | Add Phase 6.5 and Phase 8-D entries |

### Files to delete

| Path | Reason |
|---|---|
| `apps/web/src/modules/walk/route.tsx` | Content moved to `properties/WalkRoute.tsx` |

### New npm package

```sh
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

### Bugs fixed in this phase

1. **Daylight countdown** — `sunsetCountdown()` in `today/route.tsx` produces wrong values. Fix: detect whether `weather.sunset` is an ISO 8601 timestamp (has `T`) or a bare time string (`HH:MM`); if bare time, combine with today's local date. Add 60-second `setInterval` to refresh the countdown without user interaction.

2. **Area Intelligence hardcoded county** — Replace `{ state_fips: "51", county_fips: "169" }` with a call to the new `geo-reverse/` edge function keyed on the rep's GPS coordinates (rounded to 3 decimal places for caching). Store result in `localStorage["dashboard:home:area-geocode"]` per `{lat,lon}` key. Quick-switch picker stores override in `localStorage["dashboard:home:area-override"]`.

---

### Roadmap additions

- **Phase 6.5 — Nav restructure + draggable cards** (this work)
- **Phase 6-E — Neighborhood heat map** (`has_existing_solar` + `score` heatmap layer on Map, linked from Neighborhood proof card)
- **Phase 8-D — Per-profile dashboard layout sync** (Supabase `rep_dashboard_layout` table; sync order/collapsed on login)
- **Phase 9 — Calendar OAuth** (Google + Outlook + Apple, unlocks walk-window recommendations around appointments)

---

### Verification checklist

1. `cd apps/web && npx tsc --noEmit` → zero errors
2. `cd apps/web && npx eslint src --max-warnings=0` → zero warnings
3. `cd apps/web && npx vite build` → succeeds
4. On phone viewport (360px):
   - Bottom nav shows 6 tabs: Home / Properties / Map / Build / Reports / About
   - Home: weather header non-draggable; all other cards drag + collapse; layout persists after reload
   - Home: daylight countdown shows correct remaining time and updates every 60s
   - Home: Area Intel label auto-detects county from GPS; quick-switch picker works
   - Properties landing: search finds parcels; walk plan shows route; recently viewed persists after reload
   - Properties detail (`/properties/:id`): all 10 sections render; all buttons work; voice note works
   - Walk session: disposition buttons write to Dexie; route advances; quick note works
   - Map: sub-nav at top; pin tap opens bottom sheet; "Open full dashboard →" navigates correctly
   - Build / Reports: stubs render
   - About: layout reset button clears localStorage and reloads default card order
5. On tablet viewport (768px): nav becomes left rail; Properties detail uses 2-column layout
6. `curl` test on `geo-reverse/` edge function with Gate City VA coordinates → returns `{county: "Scott County", state: "VA", state_fips: "51", county_fips: "169"}`
7. Confirm `CLAUDE.md` carries the 6-tab nav hard rule

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

### Screen 4 — Property dashboard (heart of the app — the rep's complete briefing per house)

This is the **primary screen** of Sunpath. A rep spends most of their time here, not on the walk list. Design goal: everything needed for a homeowner conversation in one dashboard. No switching apps, no missing data.

Sections (all required; fail open if source unavailable):
1. Header: address, city/state, knock score, HOA badge
2. Property owner: owner name (assessor), owner-occupied status
3. Home facts: year built, sq ft, orientation, assessed value, last sale, FEMA flood zone
4. Area context (Census): owner-occ %, median income, median home value, energy burden
5. Energy & solar: utility name, $/kWh + YoY trend, **NREL peak sun hours/day**, PVWatts estimate, **EIA state avg kWh/mo as baseline**
6. Bill data (when captured): actual kWh/mo, rate, utility name — upgrades financial model from "estimated" to "your actual usage"
7. Roof analysis: viable area sqft, max kW, panel count (Google Solar API when key set; OSM Overpass fallback)
8. Financial model: annual savings, payback with 30% ITC, 25-yr net
9. Incentives: federal ITC + live state programs (DSIRE)
10. Neighborhood proof: nearby solar permits, recent home sales
11. Action row: **[📄 Capture Bill]** — **[☀ Build My Solar]** — [▶ Knock] — [🖨 Doorcard] — [💬 Pitch]

```
PHONE (bottom sheet, 70vh)              TABLET (right rail)                       DESKTOP (right rail, 3-pane)
┌───────────────────────────────┐       ┌──────────────────────────────┐          ┌────────────────────────────────────┐
│ 142 Maple St           [✕]    │       │ 142 Maple St          [✕]    │          │ 142 Maple St                 [✕]   │
│ Gate City, VA 24251           │       │ Gate City, VA 24251          │          │ Gate City, VA 24251 · 36.62, -82.59│
│ ─────────────────────────────│       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ KNOCK SCORE  92 / 100         │       │ KNOCK SCORE  92 / 100        │          │ KNOCK SCORE  92 / 100  HOA: green ●│
│ HOA: green ●                  │       │ HOA: Maple Hills · solar OK  │          │ ─────────────────────────────────  │
│ Owner: J. Smith · Owner-occ   │       │ Owner: J. Smith · Owner-occ  │          │ PROPERTY OWNER                     │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  J. Smith · Owner-occupied         │
│ HOME FACTS                    │       │ HOME FACTS                   │          │ ─────────────────────────────────  │
│ Built 1987 · 1,420 sqft       │       │  Built 1987 · 1,420 sqft     │          │ HOME FACTS                         │
│ Orientation: South            │       │  Orientation: South          │          │  Built 1987 · 1,420 sqft           │
│ Assessed $142,000             │       │  Assessed $142,000           │          │  Orientation: South                │
│ Last sold 2018 · $128k        │       │  Last sold 2018 · $128,000   │          │  Assessed $142,000                 │
│ FEMA flood zone: X            │       │  FEMA flood zone: X (low)    │          │  Last sold 2018-04-15 · $128,000   │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  FEMA flood zone: X (low risk)     │
│ AREA CONTEXT (Census)         │       │ AREA CONTEXT                 │          │ ─────────────────────────────────  │
│ 78% owner-occupied            │       │  78% owner-occupied          │          │ AREA CONTEXT (Census)              │
│ Med income $52,400            │       │  Median income $52,400       │          │  78% owner-occupied                │
│ Med home $115,200             │       │  Median home $115,200        │          │  Median income $52,400             │
│ Energy burden 4.8%            │       │  Energy burden 4.8%          │          │  Median home $115,200              │
│ ─────────────────────────────│       │  Broadband adoption 79%      │          │  Energy burden 4.8% · Broadband 79%│
│ ENERGY & SOLAR                │       │ ───────────────────────────  │          │ ─────────────────────────────────  │
│ Utility: AEP                  │       │ ENERGY & SOLAR               │          │ ENERGY & SOLAR                     │
│ Rate: $0.142/kWh (+9% YoY)    │       │  Utility: AEP Power          │          │  Utility: AEP Appalachian Power    │
│ Sun: 4.8 hrs/day (NREL)       │       │  Rate: $0.142/kWh +9.1% YoY  │          │  Rate: $0.142/kWh · +9.1% YoY     │
│ State avg: 1,050 kWh/mo (EIA) │       │  Sun: 4.8 hrs/day (NREL)     │          │  NREL annual sun: 4.8 hrs/day      │
│ ── Bill captured ──           │       │  State avg: 1,050 kWh/mo     │          │  State avg: 1,050 kWh/mo (EIA)     │
│ Your usage: 1,140 kWh/mo      │       │  ── Bill captured ──         │          │  PVWatts (7kW): 9,840 kWh/yr       │
│ AEP · $0.142/kWh              │       │  Your usage: 1,140 kWh/mo    │          │  ── Bill captured ──               │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  Your usage: 1,140 kWh/mo (actual) │
│ ROOF ANALYSIS (OSM fallback)  │       │ ROOF ANALYSIS                │          │  AEP · $0.142/kWh                  │
│ S-facing · 940 sqft viable    │       │  S-facing · 940 sqft viable  │          │ ─────────────────────────────────  │
│ Max system 7.2 kW · 18 panels │       │  Max 7.2 kW · 18 panels      │          │ ROOF ANALYSIS (OSM fallback)       │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  S-facing · 940 sqft viable        │
│ FINANCIAL MODEL               │       │ FINANCIAL MODEL              │          │  Max system 7.2 kW · 18 panels     │
│ ★ Based on your actual bill   │       │  ★ Based on your actual bill  │          │ ─────────────────────────────────  │
│ $1,620/yr savings             │       │  $1,620/yr savings           │          │ FINANCIAL MODEL (actual bill)      │
│ Payback 8.1 yrs (with 30%ITC) │       │  Payback 8.1 yrs w/ ITC      │          │  $1,620/yr savings (★ actual bill) │
│ 25-yr net savings: $21,400    │       │  25-yr net: $21,400          │          │  Payback 8.1 yrs (with 30% ITC)    │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  25-yr net savings: ~$21,400       │
│ INCENTIVES                    │       │ INCENTIVES                   │          │ ─────────────────────────────────  │
│ ITC 30% federal               │       │  ITC 30% federal credit      │          │ INCENTIVES                         │
│ + VA Solar Rebate 25%         │       │  VA Solar Rebate 25%         │          │  ITC 30% federal (no cap; thru 2032│
│ + Net metering: yes (1:1)     │       │  Net metering: yes (1:1)     │          │  VA Solar Rebate 25% (state)       │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  Net metering: yes (1:1)           │
│ NEIGHBORHOOD PROOF            │       │ NEIGHBORHOOD PROOF           │          │ ─────────────────────────────────  │
│ ◆ 3 solar permits ¼ mi 30d    │       │  ◆ 3 solar permits ¼ mi 30d  │          │ NEIGHBORHOOD PROOF                 │
│ ◆ 2 home sales · median $135k │       │  ◆ 2 sales · median $135k    │          │  ◆ 3 neighbor solar permits ¼ mi   │
│ ─────────────────────────────│       │ ───────────────────────────  │          │  ◆ 2 home sales nearby · med $135k │
│ [📄 Capture Bill]             │       │ [📄 Capture Bill]            │          │ ─────────────────────────────────  │
│ [☀ Build My Solar]            │       │ [☀ Build My Solar]           │          │ [📄 Capture Bill] [☀ Build My Solar│
│ [▶ Knock] [🖨 Doorcard] [💬]  │       │ [▶ Knock] [🖨 Doorcard] [💬] │          │ [▶ Knock] [🖨 Doorcard] [💬 Pitch] │
└───────────────────────────────┘       └──────────────────────────────┘          └────────────────────────────────────┘
```

Every section fails open — if a source is down, that section doesn't render. Ambient mode (geocoder fallback, no parcel match): hides Knock score, HOA, incentives; still shows Census + PVWatts + flood zone at the geocoded coords. 💬 = pitch script / objection cheat sheet panel.

★ = financial model upgraded from "estimated" to "actual" when bill data is captured for this parcel. Label clearly so rep knows which mode they're in.

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
| C1 | **Google Solar API** — per-roof segments, pitch, area, annual sun exposure, max panel count | Free API. Competitors charge $49+/mo for the equivalent (SalesRabbit, Aurora). Edge function `solar-rooftop/`. OSM Overpass fallback active. |
| C2 | **Satellite / aerial basemap toggle** (🛰) | ESRI World Imagery, free tiles, ~30 lines. Rep shows homeowner their own roof mid-conversation. |
| C3 | **Pitch script + objection cheat sheet** (💬 panel) | Every competitor mentions it. Static markdown, editable in `apps/web/src/content/pitches.md`. |
| C4 | **Financial model** — $/yr saved, payback with ITC, 25-yr savings | All inputs already in PVWatts call. ~50 lines of math in `packages/shared/src/finance.ts`. Upgrades to "actual" when bill is captured for the parcel. |
| C5 | **Sunset countdown + daylight remaining** | Solar reps walk until dark; "3h walk left" is a real planning input. From NWS astronomy endpoint. |
| C6 | **Roof age proxy** from permit history | New roof + rate hike = best pitch. Framework exists in `triggers-scan-permits/`; fill the empty ADAPTERS array. |
| C7 | **Doors knocked today + streak** counter | "12 doors today · 47 this week". Lightest gamification. Reads `door_event` count by date. |
| C8 | **Bill capture linked to property** — scan or enter bill for a specific house; data flows back into that house's dashboard | Competitors separate CRM from field intel. Sunpath links bill data directly to the parcel. Rep shows "your actual savings" in seconds. |
| C9 | **"Build My Solar" visual preview** — aerial roof image with panel layout, exact count, system size | Phase 6-F: "coming soon" placeholder for now; full implementation with Google Solar API roof segments + satellite overlay in a future sprint. On-porch selling tool — rep shows homeowner what it will look like. |
| C10 | **NREL peak sun hours/day** prominently displayed | "4.8 hrs/day — this is one of the best solar locations in the region." Backed by same NREL_API_KEY already deployed. |
| C11 | **Property notes — voice, text, photo** — freeform notes per house, persistent across visits | Competitors log knock outcomes only. Sunpath gives a general-purpose notes layer tied to the address with 3 capture modes. Rep's institutional memory per property: "husband works nights," "interested but waiting on HOA meeting," "dog in yard." Voice-to-text via Web Speech API — works offline. |
| C12 | **Smart follow-up detection from notes** — on-device keyword scan creates trigger events from note text | "Call back in 2 weeks" → auto-schedules a `callback_due` trigger in Today dashboard. No server call, no manual entry. Competitors require explicit task creation; Sunpath detects intent from free speech. |
| C13 | **Self-coaching reports** — daily/weekly with conversion funnel, objection analysis, best-time pattern | Competitors build reports for managers watching reps. Sunpath builds reports for a solo rep watching themselves. Objection analysis: "HOA restriction: 8 encounters, 0% close — stop working those blocks." Best-time correlation from stored weather + timestamp data. |
| C14 | **AI note summarization + pattern intelligence** (Phase 7) — Claude API background summaries, weekly coaching insights | Voice note → structured "what happened / next step" summary. Objection patterns across 30 days of notes. Neighborhood momentum signals. Solo rep gets a feedback loop that a sales manager would otherwise provide. |

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
- **21 migrations applied** to remote as of 2026-05-10. Includes: `0020_knock_score_and_seed.sql`, `0021_poc_anon_parcel_read.sql` (pending commit). REST probes for `parcel`, `rep`, `door_event`, `lead`, `trigger_event`, `bill_capture`, `hoa_zone`, `audit_log` all return `200`.
- **21+ edge functions deployed** including `solar-rooftop` (OSM Overpass fallback for roof analysis) and updated `incentives-fetch` (DSIRE API wired when key is set).
- Auth switched from magic-link to one-tap POC entry (commit `f97a03a`) for field testing.
- API keys set: `NREL_API_KEY`, `CENSUS_API_KEY`, `EIA_API_KEY`. Pending: `GOOGLE_SOLAR_API_KEY`, `DSIRE_API_KEY` (see TODO.md).

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

**1.5 — Territory module UI** *(depends on 1.4)* ✅ shipped.
- `modules/territory/`: full-screen map with floating overlay controls, color-graded pins by `score`, filter panel, parcel detail sheet. ✅
- Detail sheet shows: full address (Street, City, STATE), knock score, HOA badge, property owner (owner_name_redacted, owner-occupied), home facts (year_built, assessed_value, orientation from DB), area context (Census), energy & solar, roof analysis (solar-rooftop edge fn), financial model, incentives, neighborhood proof. ✅
- All text in detail sheet is high-contrast (slate-900 values, slate-700 labels) — readability fix applied. ✅
- "Add to walk list" action → creates a saved walk list. ✅
- CSV export of walk list. ✅
- Map layout: full-screen, all controls float as overlays over the map; no fixed header. ✅
- Address search via geocoder overlay. ✅

**Phase 1 deliverable:** rep filters and exports a walk list for his next session. ✅ **SHIPPED**

**Phase 1 outstanding (Phase 6 sprint):**
- Neighborhood heat map toggle (MapLibre heatmap layer vs. dot view) — see Phase 6-E
- NREL peak sun hours/day in Energy section — see Phase 6-C
- EIA state avg kWh/mo baseline — see Phase 6-D
- Bill capture linked to property from detail sheet — see Phase 6-A/B

---

## Phase 6 — Property Dashboard & Data Integration (active sprint)

Goal: the property detail sheet becomes a complete rep briefing dashboard. Every public data source surfaced. Bill capture linked to property. Financial model upgrades from estimated to actual.

**6-A — Bill capture linked to property** *(priority 1)*
- "Capture Bill" button visible in the property detail sheet for every parcel
- Navigates to bill capture module with `?parcel_id=` and `?address=` pre-filled
- Bill capture header shows "Linked to: 142 Maple St" (no disconnection)
- After save, navigates back to the property detail sheet
- Detail sheet fetches existing `bill_capture` rows for this `parcel_id` on open
- Energy section shows captured bill prominently: "Your usage: 1,140 kWh/mo · AEP · $0.142/kWh"

**6-B — Bill data upgrades financial model** *(depends on 6-A)*
- When `bill_capture` row exists for parcel: use actual kWh × PVWatts production ratio
- Label clearly: "★ Based on your actual bill" vs. "Estimated (no bill captured)"
- Saves rep from the "I don't know how much you use" objection mid-conversation

**6-C — NREL Solar Resource: peak sun hours/day**
- Call NREL Solar Resource API (`/api/solar/solar_resource/v1.json`) — same `NREL_API_KEY` already deployed
- Show "4.8 peak sun hours/day (annual avg)" in Energy & Solar section
- Monthly breakdown if data available
- Pitch hook: "4.8 hrs/day — this is one of the best solar zones in SW Virginia"

**6-D — EIA state average kWh/mo baseline**
- Show state avg monthly kWh from EIA v2 as context in Energy section
- "VA households average 1,050 kWh/mo" → "your usage at 1,140 is above average — you're a great candidate"
- When bill captured: swap baseline for actual with clear delta label
- Pull via `weather-now` or a new `eia-state-usage/` edge function

**6-E — Neighborhood heat map layer**
- Add MapLibre heatmap layer to territory map (gradient hot zones, not just colored dots)
- Toggle button: [● Dots] ↔ [🌡 Heat map]
- Heat source: parcel `score` field; higher score = warmer zone
- Helps rep visually identify clusters worth working

**6-F — "Build My Solar" button** *(on-porch selling tool)*
- Button visible in property dashboard action row alongside "Capture Bill"
- Tapping opens a dedicated screen: "Build My Solar — Coming Soon"
- Screen explains what it will show: aerial/satellite image with panel overlay, exact count, system size, production estimate
- Includes current best estimate: "Based on your roof, we estimate ~18 panels, 7.2 kW system, ~9,840 kWh/yr"
- The vision: powered by Google Solar API roof segments + satellite imagery
- This is a SELLING TOOL — rep shows it to homeowner on the porch to make solar tangible

**6-G — Property detail sheet UI revamp**
- Restructure from card list to unified dashboard layout
- Sticky header: address, city/state, score, HOA badge
- Sections use consistent card style with clear headings
- Skeleton loaders so rep sees data arriving (not blank white screen)
- "Estimated" vs. "actual" badges on every data point that can be upgraded by bill capture
- Mobile-first: bottom sheet fills 80vh with smooth scroll; all sections visible without leaving the sheet

**6-H — Property notes ("📝 Notes" button on dashboard)**

Every property gets its own persistent notes log — separate from knock outcome logging, surviving across multiple visits. The rep builds a living record of what they know about a house before and after every interaction.

*Capture methods (all three are first-class):*

1. **Voice-to-text** (primary mobile mode) — tap mic, speak, done. Uses Web Speech API (browser-native, no key, works offline on Android; iOS Safari supported). Audio queued for async transcription when offline; note body filled when transcript arrives. Reps can dictate while walking away from a door without breaking stride.
2. **Text entry** — standard multiline text input for when the rep is seated or prefers typing.
3. **Photo note** — camera capture with auto-timestamp + GPS. Use case: photograph a large shade tree blocking the south face, an HOA sign on the door, meter placement, or a handwritten "No Solar" note left by a previous rep. Photos stored in Supabase Storage, linked to `parcel_note.id`.

*What gets auto-stamped on every note:*
- Timestamp (created_at)
- GPS coordinates at time of note — confirms on-site vs. off-site (within 100m = "on-site" badge)
- Weather snapshot (temp, conditions) pulled from the same NWS integration already in `door_event`
- Rep ID

*Note type tags (optional, one per note):*
- **Observation** — physical/property details ("Large oak shading south face", "New HVAC unit installed")
- **Conversation** — what the homeowner said ("Interested but wants to talk to spouse", "Mentioned neighbors just got solar")
- **Follow-up** — what to do next ("Try Saturday morning", "Bring financing options", "HOA meeting next Thursday")
- **Objection** — what pushed back ("Cost concern", "Lease vs. own", "HOA restriction")
- **Research** — things to investigate ("Check if historic district applies here")

*Not PII:* Notes link to `parcel_id` (the property address), never to a homeowner's name, contact info, or personal details.

*Smart tag detection (on-device, no server needed):*
- Keyword scan on note body at save time
- Detect: callback timeframes ("call back in X", "try Saturday", "2 weeks"), objection phrases ("can't afford", "renting", "HOA won't allow"), interest signals ("very interested", "wants a quote", "asked about financing")
- Auto-suggest tags without requiring manual entry; rep can confirm or dismiss in one tap
- Detect follow-up triggers: "call back in 2 weeks" → creates a `trigger_event` row with type `callback_due` at the detected date → surfaces in Today dashboard's "Top doors to revisit" list the morning of

*Where notes appear:*
- "📝 Notes" button in the property dashboard action row — badge shows count ("📝 3")
- Tapping opens the notes panel: chronological list of all past notes for this parcel + compose input at top
- Each note shows: type tag, timestamp, on-site badge, weather at time, full text, photo thumbnail if attached
- On the walk list: "3 notes" chip on any parcel with notes — visual cue to review before knocking
- In the walk list detail pane: most recent note body previewed inline

*Note templates (reduce cognitive load in the field):*
One-tap templates pre-fill structure so the rep doesn't have to think:
- **Quick knock** → "Knocked [time]. Outcome: ___. Next: ___."
- **Conversation** → "Spoke with: [homeowner role]. Interest: ___. Objection: ___. Next: ___."
- **Observation** → "Property: [what I saw]. Roof: ___. Notable: ___."
- **Follow-up** → "Follow up [date/condition]. Reason: ___. Bring: ___."
Templates are editable in `apps/web/src/content/note-templates.ts`.

*Database:*
- New `parcel_note` table: `id, parcel_id (FK), rep_id (FK), body text, note_type, tags text[], photo_url, lat, lon, on_site bool, weather_snapshot jsonb, created_at`
- RLS: each rep reads/writes only their own notes
- Postgres full-text index on `body` for server-side search
- Migration: `supabase/migrations/0022_parcel_notes.sql`
- Zod schema: `packages/shared/src/schemas/parcelNote.ts`

```
PHONE — Notes panel (slides up from property dashboard)
┌───────────────────────────────┐
│ Notes · 142 Maple St   [✕]    │
│ ─────────────────────────────│
│ [🎤 Voice] [✎ Text] [📷 Photo]│
│ Template: [Quick knock ▼]     │
│ ─────────────────────────────│
│ MAY 10 · 10:32am · 📍on-site  │
│ ☀ 72°F  [💬 Conversation]     │
│ "Homeowner interested, husband│
│  not home. Try Sat morning."  │
│ Auto-tag: 📅 Follow-up Sat    │
│ ─────────────────────────────│
│ MAY 3 · 2:15pm · 📍on-site   │
│ ☁ 61°F  [👁 Observation]      │
│ "Large oak on south side —    │
│  shading half roof. Check     │
│  fall/winter sun angle."      │
│ 📸 1 photo                    │
│ ─────────────────────────────│
│ APR 28 · 9:45am · 📍off-site  │
│ [🔍 Research]                 │
│ "County assessor shows 2019   │
│  roof permit — new shingles." │
└───────────────────────────────┘
```

---

**6-I — Reports module (daily + weekly + searchable note archive)**

The reports module turns the rep's raw activity data into actionable self-coaching. This is a solo tool — not surveillance, not for a manager. It surfaces patterns the rep can act on.

*Report types:*

**Daily report** — auto-built from today's data. Opens in under 2 seconds. Contains:
- Activity summary: doors knocked, outcome breakdown (pie or bar), bills captured, notes written
- Knock log: every door event, outcome, timestamp, weather at time
- Notes log: all notes from today grouped by address, full text, type tags
- Highlights: first sit of the day, any notes that auto-triggered follow-ups, best conversion block

**Weekly report** — rolling 7 days. Contains everything daily does plus:
- Doors/day trend bar chart (7 bars)
- Conversion funnel: 100 doors → X soft-no → Y callback → Z sit → W sale
- Stage-by-stage conversion rates vs. rep's own historical average ("Your callback→sit rate: 28% this week vs. 22% historical — keep doing whatever you changed")
- Top-performing streets/blocks by conversion rate
- Objection frequency table: which objections came up most, conversion rate per objection type

**Custom date range** — pick any start/end date. Useful for reviewing a specific neighborhood campaign or a month of work before a team check-in.

*Self-coaching metrics (the features competitors don't build for solo reps):*

- **Conversion funnel by stage** — where exactly is the rep losing doors? Is it no-answer (area problem) or soft-no (pitch problem) or callback-to-close (follow-up problem)?
- **Best time of day** — "Tuesday/Thursday 3–6 PM: 9% door-to-sit rate. Monday morning: 3%. Optimize your schedule."
- **Best weather conditions** — correlate conversion rate with stored weather snapshots from `door_event`. "Clear days: 7.2% vs. overcast: 5.1% — weather affects openings."
- **Roof orientation signal** — properties with south/southwest orientation in your route: conversion rate vs. overall. Validates whether targeting by orientation is worth the routing cost.
- **Objection analysis** — extract objection-tagged notes and group by type. "Cost concerns: 14 encounters, 3 converted (21%). HOA restriction: 8 encounters, 0 converted (0%) — stop knocking those blocks."
- **Bill capture impact** — properties where a bill was captured: did they convert at a higher rate? Validates the "real numbers close faster" hypothesis.
- **Note density vs. outcome** — properties where the rep took detailed notes vs. none. Pattern signal.

*Searchable note archive:*
- Full-text search across all notes ever written: "dog" → all addresses with dog notes; "interested" → all high-interest properties; "call back Saturday" → all Saturday follow-ups
- Filter by: date range, note type, outcome of the knock that day, has photo, on-site vs. off-site, auto-tag type
- Results link directly to the property dashboard — tap any result to open that house
- Works offline: Dexie local cache of all note rows, sync when online

*Export options:*
- **Share as text** (Web Share API) — sends to Messages, email, Notes, Slack — wherever the rep's thumbs go. Good for sending a daily summary to a partner or accountability buddy.
- **Download PDF** — formatted daily or weekly report (jsPDF, same lib as doorcard). Includes activity summary, notes log, and conversion stats.
- **Copy to clipboard** — paste into any tool: Google Docs, email body, WhatsApp.

*Where the module lives:*
- Route: `modules/reports/route.tsx`
- Entry points: Today dashboard "📊 View report" link + bottom nav or Settings → "Reports"
- Not a primary bottom-nav tab (Today/Map/Walk are primary); Reports is one level deeper

```
PHONE — Reports screen
┌───────────────────────────────┐
│ ← Reports                     │
│ [Daily ▼] May 10, 2026  [< >] │
│ ─────────────────────────────│
│ ACTIVITY SUMMARY              │
│ 14 doors  ██████              │
│ 2 callback  1 sit  0 sale     │
│ 3 notes · 1 bill captured     │
│ ─────────────────────────────│
│ CONVERSION FUNNEL             │
│ 14 knocked                    │
│ → 6 soft/hard no (43%)        │
│ → 5 no answer (36%)           │
│ → 2 callback (14%)            │
│ → 1 sit (7%)  ← best today   │
│ ─────────────────────────────│
│ SELF-COACHING                 │
│ Best time today: 2–4 PM (3/5) │
│ ↑ Callback rate: 14% vs 9%   │
│ Top objection: Cost (3×)      │
│ ─────────────────────────────│
│ 🔍 Search notes...            │
│ ─────────────────────────────│
│ NOTES TODAY (3)               │
│ 142 Maple  10:32am [💬]       │
│ "Interested, try Saturday"    │
│ 88 Oak  11:47am [👁]          │
│ "Dog in yard, HOA sign"       │
│ ─────────────────────────────│
│ KNOCK LOG                     │
│ 🟠 142 Maple   Sit  10:30am  │
│ 🔴 22 Birch    NA   10:50am  │
│ 🟡 7 Pine      CB   11:05am  │
│ ─────────────────────────────│
│ [📤 Share] [⬇ PDF] [📋 Copy] │
└───────────────────────────────┘
```

*Phase 6 acceptance:* rep can tap a house, see all data sections, capture a bill from the sheet, add a voice or text note, have the financial model update to actual numbers, and generate a searchable daily report with conversion stats in under 10 seconds.

---

## Phase 7 — Intelligence Layer (AI + pattern recognition, post-Phase 6)

Goal: the app learns from the rep's own data and tells them what to do differently. Turns activity history into a feedback loop.

This phase has no hard dependency on Phase 6 being 100% complete — individual sub-features can ship alongside Phase 6 items as infrastructure allows. All AI features degrade gracefully to no-op if offline or if the API call fails.

**7-A — AI note summarization (cloud, background sync)**
- After a note is synced, send body text to Claude API (`claude-haiku-4-5` — fast and cheap)
- Return a structured summary: "What happened / Key details / Recommended next step"
- Store as `parcel_note.ai_summary` — surfaces inline in the notes panel and in reports
- Use case: rep dictated a long rambling voice note → summary extracts the actionable sentence
- Edge function: `note-summarize/index.ts`; called on `parcel_note` INSERT via DB trigger or background job
- Offline fallback: show raw note body until sync completes; summary appears on next open

**7-B — Note-driven follow-up triggers (on-device)**
- On note save: keyword/regex scan of note body for temporal and intent signals
- Trigger patterns:
  - `call back in X weeks/days/[weekday]` → create `trigger_event` type `callback_due` at detected date
  - `try [weekday]` / `come back [date]` → same
  - `waiting for [bill|spouse|HOA meeting]` → create open `follow_up_pending` trigger with no date
  - `interested` / `wants a quote` → elevate parcel knock score modifier for 30 days
- All triggers surface in Today dashboard "Top doors to revisit" list with reason
- Rep can dismiss or snooze any trigger from the dashboard
- No server call required — all detection runs on-device at note save time

**7-C — Objection pattern coaching**
- Weekly: scan all `parcel_note` rows with type `objection` from last 30 days
- Group by detected objection type (cost / financing / HOA / roof condition / renting / timing)
- For each: show frequency + conversion rate (did a follow-up knock at this address ever result in sit/sale?)
- Surface in the weekly report's "Self-Coaching" section: "Cost objection: 14× this month, 21% close rate. HOA restriction: 8×, 0% — stop working those blocks."
- Long-term: suggest script adjustments based on which responses had higher close rates for that objection type

**7-D — Best time + territory pattern analysis**
- Correlate door event outcomes with: time of day, day of week, weather conditions, neighborhood
- Requires ~4 weeks of data before results are meaningful; show "gathering data" placeholder until then
- Output: "Your best conversion window is Tuesday–Thursday 2–6 PM in northeast Gate City. Monday morning: 3× below your average."
- Source data: `door_event.created_at` + `door_event.weather_snapshot` + parcel lat/lon for clustering
- Runs as a weekly edge function cron `analyze-rep-patterns/`; results cached in `rep.pattern_cache jsonb`
- Surfaced in: Today dashboard ("Best window today: 3–6 PM, clear"), Reports "Self-Coaching" section

**7-E — Bill capture impact analysis**
- Track: for properties where a bill was captured before the next knock, what is the sit/sale rate vs. no bill?
- Once rep has enough data (20+ paired comparisons): show in Reports — "Properties with bill captured: 34% sit rate vs. 9% without. The real-numbers conversation works."
- Reinforces the bill capture workflow as a measurable conversion lever, not just a data entry task

**7-F — Neighborhood momentum signals**
- Detect clusters of high-interest notes + recent permits + recent sales within a 0.25-mile radius
- If ≥3 of: (a) neighbor permit in 30d, (b) nearby sale in 60d, (c) rep noted "interested" at adjacent property, (d) above-average knock score — flag block as "hot"
- Show on territory map as a subtle heat pulse on top of existing score layer
- Tooltip: "Oak St cluster: 3 neighbor permits, 2 callback notes, avg score 84 — worth a second pass"

**7-G — Voice note transcript search (cloud)**
- If voice note was transcribed (7-A), include in full-text search index
- Means searching "HOA president" also finds notes where the rep mentioned this verbally but didn't type it
- Client sends search query to Supabase `notes-search` edge function → Postgres `websearch_to_tsquery` on both `body` and `ai_summary` columns

*Phase 7 acceptance:* rep receives at least one AI-generated insight per week that they act on — a follow-up they would have forgotten, a pattern they didn't know about, or a script adjustment backed by their own data.

---

## Phase 8 — Cross-Device Profile & Data Portability

### 8-A — Cross-device session state (after auth is live)

Goal: a rep logs in on their iPhone in the morning, does a full day of knocking, then opens the app on an iPad or laptop and sees everything without re-entering anything.

**What this requires:**
- All writes (door events, leads, notes, bill captures) sync to Supabase via the outbox engine (already in place).
- Auth session token stored in device keychain / SecureStorage (Supabase Auth handles this natively on iOS Safari via cookie/localStorage).
- On login from a new device: the app fetches the rep's door events, leads, notes, and bill captures from Supabase on first load — no manual import.
- Route (today's walk list) is stored in Supabase `rep_session` table (new, migration 0024) keyed to `rep_id + date`, not just localStorage, so it persists across devices.
- Territory filters (county, score threshold) saved to `rep_profile` preferences column (JSON blob).

**Rep profile screen additions:**
- Display name, avatar initial, territory home (county/state)
- Device list: "Last seen: iPhone, 2h ago" (from Supabase Auth session metadata)
- Preferred score threshold, default EIA state for rate lookups

**Implementation notes:**
- `rep_profile` table: `rep_id uuid PK, display_name text, territory_state text, territory_county text, preferences jsonb, updated_at timestamptz`
- `rep_daily_route` table: `rep_id, date date, route_json jsonb, updated_at` — replaces localStorage-only walk list
- Walk list load order: Supabase first (authoritative), localStorage as offline fallback, merge on conflict by `updated_at`
- This replaces the POC one-tap entry once real auth is live

*Acceptance: a rep can start a session on phone, add 3 doors and a note, then see all 3 doors and the note on a laptop without any manual step.*

---

### 8-B — Data export

Goal: rep can get their data out in formats usable in other tools — Excel for a manager, JSON for a CRM sync, SQL for a technical user.

**Export surfaces:**
- **Reports module (Phase 6-I)**: "Export this report" → PDF, CSV, or plain text
- **Settings → My Data**: full export of everything the rep has collected
- **Individual parcel**: export property summary card as PDF (leave-behind / proposal format)

**Export formats:**
| Format | Content | Use case |
|--------|---------|----------|
| CSV / Excel | Door events, leads, notes (one row each) | Manager review, pipeline tracking |
| JSON | All data, structured by parcel | CRM import, API integration |
| PDF | Daily/weekly report, single property proposal | Leave-behind, manager briefing |
| SQL dump | Schema + data inserts | Developer handoff, backup |

**Implementation:**
- CSV/Excel: `xlsx` package (client-side, no server needed), generates `.xlsx` directly in browser
- JSON: `JSON.stringify` + `Blob` download, structured as `{ parcels: [...], doorEvents: [...], leads: [...], notes: [...] }`
- PDF: jsPDF (already planned for 2.5 savings card) reused for report export
- SQL: server-side Supabase Edge Function `export-data` — rep sends auth token, function queries their rows and returns a `.sql` dump
- All exports scoped to `rep_id = auth.uid()` — never export another rep's data
- Privacy: no PII (customer names etc.) — only address-linked data and rep's own activity

*Acceptance: rep taps "Export my data" in Settings, selects format, downloads a file they can open in Excel/Google Sheets.*

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

**Auth & access** ⚠️ HIGH PRIORITY — required before any rep beyond the original developer uses the app
- **Replace one-tap POC entry with real OAuth** — Supabase Auth supports Google, Apple, and Microsoft as social providers. No password management. Rep taps "Sign in with Google" (or Apple / Microsoft) and is in. Code change: `apps/web/src/modules/auth/` → `supabase.auth.signInWithOAuth({ provider: 'google' })`.
  - Google OAuth: Google Cloud Console → OAuth 2.0 Client ID → redirect URI `https://sclisaylpwnffkkyepow.supabase.co/auth/v1/callback` → enable in Supabase Auth dashboard
  - Microsoft/Outlook: Azure AD → App registration → same redirect URI
  - Apple Sign In: Apple Developer account ($99/yr) → create App ID + Service ID → generate private key for JWT → set in Supabase Auth dashboard. Lower priority — Google is faster to ship.
- **Verify rep row auto-creates on first OAuth sign-in** — DB trigger should fire; test it.
- Session timeout + idle lockout on the PWA (recommended: 8-hour field day + lock on device sleep).
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
2. **Calendar integration (Deferred).** See the deferred section. Driver: Google Calendar / Outlook / CalDAV read-only OAuth. **Today dashboard shows calendar context (blocks, free windows) alongside weather.** This is part of the daily planning view — the rep needs to know how much time they have before their next commitment to plan the day's walk window.
3. **DSIRE API over scraping.** Replaces design §14's "no public API; download CSV" guidance.
4. **NWS as primary weather source over OpenWeather.** Replaces design §3 / §14 weather guidance for the US market.
5. **Marketing white paper (`docs/whitepaper.md`).** A print-ready, non-technical explainer for prospective installers/owners — positioning, the rep workflow, the data sources behind the scoring, the privacy posture, and where Sunpath sits relative to existing CRMs.
6. **Bill capture linked to property (Phase 6-A/B).** Bill capture is not a standalone tool — it's an action on the property dashboard. `bill_capture` rows link to `parcel_id`; the detail sheet fetches them and upgrades the financial model.
7. **NREL Solar Resource peak sun hours/day (Phase 6-C).** Surface the underlying sun data separately from PVWatts production estimate. "4.8 hrs/day" is a pitch-friendly number.
8. **EIA state average kWh/mo baseline (Phase 6-D).** "VA average: 1,050 kWh/mo — you're above average, great candidate." Replaced by actual when bill captured.
9. **Neighborhood heat map toggle (Phase 6-E).** MapLibre heatmap layer on territory map — gradient hot/cold zones by score, togglable vs. dot view.
10. **"Build My Solar" on-porch visual (Phase 6-F).** Button on property dashboard → coming-soon screen that previews the feature. Long-term: Google Solar API roof segments + satellite imagery showing panel layout. Selling tool for the porch.
11. **Territory context auto-detection (Phase 6 / Today dashboard).** The territory label "Scott County, VA" should auto-detect from the rep's current GPS location or allow a quick-switch. Rep shouldn't have to manually set their context when they drive to a different area.
12. **Property notes — voice/text/photo — with smart follow-up detection (Phase 6-H).** Three-mode capture (voice via Web Speech API, text, photo) linked to each parcel. Auto-stamped with GPS, timestamp, weather. Smart on-device keyword scan detects follow-up intent from note text ("call back Saturday" → auto-creates a trigger in Today dashboard). Note templates for one-tap field entry. Works fully offline.
13. **Reports module with self-coaching analytics (Phase 6-I).** Daily/weekly reports with: conversion funnel, objection frequency + close rate per objection type, best time-of-day analysis, bill-capture impact tracking. Full-text search across all notes. Export as PDF, text, or Web Share. Not for managers — for a solo rep who wants a feedback loop.
14. **AI intelligence layer (Phase 7).** Background AI note summarization via Claude API (haiku — fast and cheap). Objection pattern coaching from 30-day note history. Best-time + territory pattern analysis as weekly edge function. Neighborhood momentum signal detection. Voice transcript search via Postgres full-text. The app becomes a feedback loop, not just a data recorder.

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

## Key documents (all exist, all checked in)

- `docs/DESIGN.md` — verbatim v1.3 design spec (source of truth for original architecture)
- `plan.md` — **this file** — master execution plan, all phases, all decisions, all data sources
- `ROADMAP.md` — public-facing roadmap; linked from the app's About screen
- `CHANGELOG.md` — version history; linked from the app's About screen
- `TODO.md` — API keys, infra steps, Azure evaluation, auth setup steps
- `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` — standard repo hygiene

## Relevant files (Phase 0 — to be created)
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
- **Walking is a sub-tool.** Confirmed explicitly and repeatedly (sessions 4–6). The property dashboard and neighborhood data are the primary product. The walk list / route builder are useful logistics that support the primary work but are not the focus. Build data richness first; walk polish is always secondary.
- **Bill capture is part of the property workflow.** Bill capture is not a standalone tab — it is an action on the property dashboard, pre-linked to the current parcel. After save, financial model for that address upgrades from estimated to actual.
- **"Build My Solar" is a selling tool.** On-porch visual showing roof panel layout, count, system size. Phase 6-F ships as a "coming soon" screen with a description; full implementation (Google Solar API + satellite imagery) is a later sprint.
- **Auth switch to one-tap POC entry.** Magic-link replaced with one-tap POC entry for field testing (commit `f97a03a`). Real auth (email/password) is Phase 5+ / pre-launch.
- **solar-rooftop function uses OSM Overpass fallback.** Google Solar API key not yet set; function ships with full OSM building footprint logic as default. When `GOOGLE_SOLAR_API_KEY` is set, it switches to the Google API automatically.
- **NWS as primary weather source.** OpenWeather One Call 3.0 became a paid product in 2024. NOAA NWS API is free, official, and key-free; it is the primary US weather source for all Sunpath weather features.
- **Territory context should be location-aware.** The "Scott County, VA" label on the Today dashboard should auto-detect from GPS or allow a quick-switch. Hard-coding a county name creates friction when the rep works a different area. This is a Phase 6 / Today dashboard improvement.
- **Notes are a primary data source, not a secondary feature.** Most field sales apps treat notes as a text box attached to a knock outcome. In Sunpath, notes are a first-class table (`parcel_note`) with their own capture flow, search index, and trigger integration. They are the rep's institutional memory and the raw material for AI coaching.
- **Reports are for solo self-coaching, not team surveillance.** Every competitor builds reporting for managers watching reps. Sunpath's reports surface patterns to the rep themselves: best time of day, conversion rate per objection type, bill-capture impact. The audience is the rep, not a manager.
- **AI features (Phase 7) degrade gracefully.** All AI calls (note summarization via Claude API, pattern analysis) run in background after sync. If offline or if the call fails, the feature silently skips. The base app always works without it. AI is enhancement, not dependency.
- **Voice-to-text is the primary mobile note input.** Web Speech API is browser-native, offline-capable on Android, and produces a note 3x faster than typing in the field. Text input is secondary. Photo capture is for visual context (shade trees, HOA signs, meter placement).

## Open questions / further considerations

1. **License?** Design doc doesn't specify. Recommend **MIT** for permissiveness; **AGPL** if you want to keep forks open-source; **proprietary/UNLICENSED** if this stays a private commercial tool. *Default: MIT, change later if needed.*
2. **Husky + commitlint:** minor friction for a solo dev. *Recommendation: skip in Phase 0, add when a second contributor joins.*
3. **Org-level repos** (`.github` defaults, profile repo): design called for them, but with single-repo collapse they're optional. *Recommendation: skip until/unless a second repo exists.*
4. **First county for Phase 1 adapter** — need name + state to scope. Required input before Phase 1 starts.
5. **Apple/Google developer accounts:** not needed until Phase 5 native wrap. Defer.
