# Sunpath: field intelligence for solar door-to-door teams

*Whitepaper — May 2026*

---

## Executive summary

Door-to-door solar sales is a precision problem disguised as a volume game. Most reps walk the wrong houses, lose the thread between visits, and miss the narrow rewarm window when a once-reluctant homeowner becomes ready to sign. The tools that exist were built for desks — for proposal generation, project management, and enterprise CRM workflows. None of them were designed to answer the question a rep has at 6:30pm standing at the end of a residential street: *which door, and why, right now?*

Sunpath is the field intelligence layer between a rep's phone and the doors he knocks. It installs from a browser, works offline, and answers four questions — where to walk, what to say, what to do tomorrow, and who to come back to. It draws on ten public data sources to score every parcel in a territory 0–100, surfaces personalized savings estimates from a photo of a utility bill in under 15 seconds, and watches dormant leads for the public signals that mean the timing has changed.

This paper describes how Sunpath fits into a solar sales operation, how the knock score works, where the data comes from, and what differentiates it from the general-purpose canvassing tools the market already offers.

---

## The rep's day: how Sunpath fits the workflow

Sunpath is organized around the natural arc of a field rep's day. It does not require any workflow change beyond what the rep already does — it simply makes each step faster and better-informed.

### Before he walks

The rep opens the territory map. Every parcel in his assigned area is color-coded by a knock score from 0 to 100. Green parcels are high-probability targets. Gray parcels are filtered out — renters, properties with existing solar arrays already recorded, HOA-restricted lots where rooftop solar is prohibited. The rep can export a prioritized walk list for the day with a single tap.

The score is not a guess. It is a weighted composite of owner-occupancy, solar production potential for the specific roof geometry and orientation, recent permit activity in the neighborhood, utility rate history, and property sale date. Each factor is sourced from a named public agency — nothing is inferred from consumer data or third-party profiles.

### On the porch

One tap per door. The rep selects an outcome — No Answer, Soft No, Hard No, Callback, Sit, or Sale — and puts his phone back in his pocket. GPS coordinates, timestamp, and current weather conditions attach automatically. If no cell signal is available, the event is queued locally and replays the moment the device reconnects. There is no form to fill out, no login screen to navigate, and no dependency on network availability.

### When someone shows a bill

The rep opens the bill capture screen and photographs the homeowner's utility statement. On-device OCR extracts the monthly kWh usage, dollar amount, and utility name. Sunpath joins those numbers to a PVWatts v8 solar production estimate for that parcel's coordinates, roof area, and tilt — and presents a personalized annual savings figure and estimated payback period in under 15 seconds. The homeowner sees a number that reflects their actual usage and their actual roof, not a market average.

The bill image is not stored on the server. Only the parsed numerics — usage, rate, and date range — are retained, linked to the parcel ID. No homeowner name, no account number, no personally identifiable information of any kind.

### When no one answers

Sunpath generates a leave-behind card with a unique short URL tied to the parcel and the visit. The URL lands on a mobile callback form. When the homeowner fills it out, the lead is attributed back to the original door event. The rep sees the inbound lead in his pipeline the next time he opens the app, even if weeks have passed.

### The next morning

A push notification surfaces the top parcels to revisit and explains why each one has moved. A neighbor pulled a solar permit. The utility announced a rate increase. The house changed hands last month. A callback appointment is due today. The rep starts the day with a prioritized list and a reason for each door, not a cold map.

### HOA pre-check

Every parcel carries a red, yellow, or green HOA badge based on the recorded restriction data for that community. A red badge means the homeowner is almost certainly unable to install rooftop solar regardless of interest. Reps do not see this at the door — they see it before they park.

### Lead pipeline

Sunpath tracks the full progression from initial door event through lead, sit, and sale. Reps attach notes and files at any stage. The pipeline is scoped by row-level security to the team that created it — no rep sees another team's leads, and no data is shared across accounts.

---

## How the knock score works

The knock score is a 0–100 composite that ranks every parcel in a territory by conversion probability. It is recalculated when new public signals arrive and when the rep's own door-event history accumulates enough data to update the local prior.

The score is built from five weighted factor groups:

**Ownership and occupancy.** Owner-occupied parcels score higher than rentals. The ownership signal comes from county assessor records; the occupancy probability is informed by Census ACS tract-level owner-occupancy rates. Properties with an identified solar installation already in place are suppressed entirely.

**Solar production potential.** NREL PVWatts v8 models the annual kWh output for the parcel's location, roof area, and estimated tilt. Higher production potential means a stronger financial case and a higher score. Utility rate data from NREL's Utility Rates API determines the dollar value of that production.

**Neighborhood permit activity.** A solar permit pulled by a neighbor within a quarter-mile radius in the last 90 days is one of the strongest predictors of near-term conversion. Neighbors talk. A permit in the block is a social proof signal, a pricing anchor, and evidence that the HOA (if any) has cleared the project. This signal triggers a rewarm flag on previously contacted parcels as well as scoring uplift on new ones.

**Rate and financial signals.** Year-over-year utility rate changes from EIA v2 affect every parcel served by that utility. When a utility raises rates materially, parcels in that service territory receive a scoring uplift — the financial case for solar has just improved without the homeowner doing anything.

**Recency and lifecycle signals.** A recent property sale is a rewarm trigger. New homeowners are statistically more likely to make capital improvements, have not yet been approached by any rep, and may be actively evaluating their energy costs. A parcel that went to a new owner in the last 60 days scores higher than an identical parcel with a ten-year ownership tenure.

All scoring logic is open and auditable in the application's source. Reps and managers can inspect the factor weights. There is no black-box model and no reliance on consumer profile data.

---

## Data sources

Every signal that feeds Sunpath comes from a named public agency or open dataset. No data brokerage, no scraping of consumer profiles, no third-party identity data of any kind.

| Source | What it provides | Notes |
|---|---|---|
| NOAA National Weather Service (`api.weather.gov`) | Current conditions, forecast, severe weather alerts | No API key required; official US government data |
| NREL PVWatts v8 | Per-address solar production estimate (kWh/yr), system-size model | Free API with key; authoritative federal source |
| NREL Utility Rates v3 | Current utility name and retail rate per kWh by location | Pairs with PVWatts for financial modeling |
| US Census ACS 5-year | Owner-occupancy rate, median household income, median home value, energy burden by census tract | Free API with key; American Community Survey public-use data |
| DSIRE (`dsireusa.org`) | State solar incentive programs, rebates, net metering rules in effect today | Free API with registration; NC Clean Energy Technology Center |
| EIA v2 | Utility rate trends, year-over-year change by utility and state | Free API with key; US Energy Information Administration |
| County permit records | Neighbor solar permits within ¼ mile | Sourced via county GIS / open permit feeds where available |
| Property sales data | Recent ownership change as a rewarm signal | County assessor or state GIS transfer records |
| ArcGIS World Geocoding | Address lookup and parcel match | Covers all US rural roads including counties without a local geocoder |
| Google Solar API *(planned)* | Per-roof segment analysis, viable panel area, maximum panel count | Free API; adds per-roof precision beyond the PVWatts point estimate |

All third-party API calls are routed through server-side edge functions. API keys never reach the device. The browser communicates only with Sunpath's own backend.

---

## Privacy commitment

Sunpath's data posture is zero PII on parcel data and strict data isolation between teams.

Bill capture is the highest-risk workflow in any solar sales tool — a utility bill contains account numbers, rate codes, and usage history. Sunpath processes the image on-device using OCR and discards it. The server stores only three derived values: monthly kWh usage, dollar amount, and billing date range. These are linked to a parcel ID, not to a homeowner name or account number. No image ever touches the server.

Knock outcomes are stored by parcel ID and rep account. The rep's own location is used only to attach weather data to a door event and to sort the walk list by proximity — it is never stored on the server or shared with any third party.

There is no homeowner name lookup, no income or credit data pull, no mortgage record access, and no data brokerage relationship of any kind. Every signal that feeds the knock score traces back to a named public agency. If a homeowner asks a rep where a number came from, the rep can give a specific, true answer.

Row-level security in the database ensures that each team's lead data is fully isolated. Supabase RLS policies are enforced at the database level, not in application code, and are audited with each migration.

---

## Competitive differentiation

The general-purpose door-to-door canvassing category is well-represented: SalesRabbit, Spotio, Knockbase, Knockwise, Solo, Sunbase, Knockio, and Hero by Demand IQ are all available. The category is not empty. The question is what Sunpath provides that they do not — or charge significantly more for.

**Per-roof financial modeling from a bill photo.** Competitors that offer financial modeling present market averages or require manual system-design input. Sunpath's bill capture workflow produces a personalized savings estimate from the homeowner's actual usage and their actual roof geometry in under 15 seconds, using the same NREL dataset the industry uses for proposal generation.

**Neighborhood permit activity as a live rewarm trigger.** Most canvassing tools have no mechanism for surfacing dormant leads when external conditions change. Sunpath monitors public permit feeds and re-ranks parcels when a neighbor pulls a solar permit — one of the strongest real-world signals that a block is ready to convert.

**Open public data throughout.** Several competitors monetize data enrichment as an add-on, sourced from consumer data brokers. Sunpath uses no consumer data. This is not a cost-cutting measure — it is a deliberate architectural choice that eliminates compliance risk for the installer and aligns the product's incentives with the rep's rather than with a data business.

**Genuine offline-first PWA.** Several tools describe themselves as mobile-friendly; fewer are genuinely offline-capable. Sunpath is built as an offline-first Progressive Web App: the full territory map, all parcel data, and all queued door events are stored on-device and remain fully functional without a network connection. This matters in rural markets, in basements, and in the dead zones that show up in every territory.

**No app store dependency.** Sunpath installs from a browser URL. The rep adds it to their home screen once. There is no App Store or Google Play review cycle, no MDM requirement, and no install friction for the manager deploying to a new rep.

What Sunpath deliberately does not do is equally important. Sunpath does not perform homeowner name lookups, pull credit or mortgage data, facilitate AI follow-up calling, collect e-signatures, or generate engineering proposals. These are not oversights — they are out of scope. The product is the field intelligence layer. Post-sale workflow belongs to whatever system the installer already uses.

---

## Getting started

Sunpath is accessed at `https://sunpath.dev`. No installation is required beyond adding the site to the home screen on iOS (Safari) or Android (Chrome). The rep signs in with a one-tap authentication flow — no password to create or forget.

Initial territory setup requires the installer to identify the counties or zip codes their teams work. Parcel data for those areas is ingested from county assessor records and state GIS feeds. A new territory is typically loaded and ready for a walk within one business day of setup.

For pilot inquiries: `pilot@sunpath.dev`.

---

## Technical notes

**Architecture.** Sunpath is a React 18 Progressive Web App built with Vite and served from a static CDN. The backend is Supabase (Postgres + PostGIS + Auth + Edge Functions). All third-party API calls — NREL, NOAA, DSIRE, EIA, Census, Overpass — route through Supabase Edge Functions. No API key ever reaches the device. The browser holds only a scoped anonymous key with row-level security enforced at the database.

**Offline-first.** Map tiles are cached `CacheFirst` with a 30-day TTL. Supabase reads use a `NetworkFirst` strategy with a 4-second timeout, falling back to the local cache. Door events written offline are queued in IndexedDB and replayed in order when connectivity resumes. The sync engine is idempotent — replaying the same event twice produces the same result.

**PWA.** Sunpath is installable on iOS, Android, and desktop without an app store. The service worker handles background sync and push notifications. The app shell loads in under two seconds on a mid-range Android device on a 3G connection.

**Data isolation.** Every database table that contains rep or lead data carries Supabase RLS policies. A rep can read and write only their own records plus team-shared territory. There are no cross-account reads in any code path.

**Open data.** All public data sources used in the knock score are documented in `plan.md` with endpoint, authentication requirements, rate limits, and the date each source was verified. Parcel adapters for county assessor data are implemented per-county in the open-source `parcel-adapters/` directory. The scoring algorithm is in `packages/shared/src/scoring.ts` with a documented weight table.

---

*Sunpath — May 2026*
