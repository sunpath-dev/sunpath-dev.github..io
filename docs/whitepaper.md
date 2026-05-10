# Sunpath
### Field intelligence for solar door-to-door teams

*A marketing white paper — May 2026*

---

## The pitch in a paragraph

Sunpath is a phone-first app for solar reps who knock doors. It tells them which house to walk up to next, what to say when the homeowner answers, and what to do tomorrow morning when last night's storm just changed half their territory. It runs offline in the cab of a truck on a rural backroad, and it costs a fraction of the legacy CRMs the big national installers built their stacks on.

We built it because the existing tools were designed for desks. Solar sales doesn't happen at desks.

---

## Who this is for

- **Independent and regional solar installers** doing 50–500 installs a year who need a sales tool that fits their economics
- **Door-to-door sales teams** working residential neighborhoods — especially in rural and small-town markets where the national CRMs don't have great data coverage
- **Sales managers** who want their reps actually walking high-probability streets instead of driving in circles
- **Owner-operators** who do their own knocking and need their territory, leads, and quotes in one place that works on a phone

If you're a 200-rep national installer with a Salesforce build-out and an in-house data team, you're not the target market. If you're three reps in a pickup, you are.

---

## The problem

Door-to-door solar sales has three structural problems that software hasn't solved well:

**1. Reps walk the wrong houses.** Without per-parcel signal, reps default to "this neighborhood looks nice" or "we already have a customer two doors down." They burn the workday on parcels that were never going to convert — a renter, an HOA-restricted roof, a household that already has solar, a foreclosure.

**2. Reps lose the thread between visits.** A "callback Tuesday" written on a paper map, or buried in a SMS thread, or typed into a CRM that requires cell service to load, is a callback that doesn't happen. Most teams' true conversion rate from "interested" → "signed" is gated on follow-up discipline they don't have time for.

**3. Reps miss the rewarm window.** Six months after a "no thanks," the homeowner's electric bill went up 18%, a tax credit got extended, or a hailstorm bent their gutters. That's the moment to come back. Nothing today tells the rep that moment has arrived.

Existing CRMs (Solo, Aurora, the Salesforce builds) solve different problems — they're great at proposal generation and at managing closed deals. They're not built to tell a rep on Maple Street, at 6:47pm on a Wednesday, *which door to walk to next*.

---

## What Sunpath does

Sunpath sits in the rep's pocket and answers four questions:

> **Where should I knock right now?**

The territory map shows every parcel in the rep's assigned area, color-tinted by a knock score. The score combines public data (parcel age, assessed value, owner-occupied status, known existing solar arrays, weather exposure) with the team's own history (recent door events, who's been called back, who's a hard no). High-score pins glow. Existing-solar pins fade. Reps walk toward what's bright.

> **What should I say at this door?**

Tap a parcel and Sunpath shows the homeowner's likely utility, an estimated annual electric bill range, the relevant federal and state incentives in effect *today* (pulled live from DSIRE, the federal incentive database), and whether anyone on the team has knocked here before — and what happened.

> **What did I do today, and what's tomorrow?**

A single tap per door records the outcome — no answer, not interested, callback, appointment. The walk log is a live ledger; nothing gets lost between the door and the truck. Tomorrow morning, the pipeline view sorts every open lead by next-action date, with weather, drive time, and walkability folded in.

> **Who do I need to come back to?**

Sunpath watches public signals after the first visit. If the homeowner's utility raises rates, if a new state incentive lands, if a windstorm pushes through the neighborhood — Sunpath surfaces the dormant lead with the reason. The rep walks back with a fresh angle, not a recycled pitch.

---

## How it works (in plain English)

Sunpath has three layers:

**The territory layer.** We pull public parcel data (county assessor records and the state-level GIS feeds, like Virginia's VGIN), normalize it into one shape, and cache it locally on the rep's phone. The map you see is the same map whether you're in town or twenty minutes past the last cell tower.

**The signal layer.** A handful of public APIs feed Sunpath continuously: NOAA's National Weather Service for forecast and alerts; the federal DSIRE database for incentives; NREL's PVWatts for system-size estimates; the U.S. Energy Information Administration for utility rate trends; the U.S. Census American Community Survey for owner-occupancy and income context. None of this requires the rep to know it exists. It just shapes the score and the talking points.

**The rep layer.** The walk-log, the lead pipeline, the bill captures, the quotes — anything the rep generates in the field. This is the part that's private to the team. It sits in a Postgres database with row-level security: a rep can only see their own work and team-shared territory; nothing leaks between accounts.

The whole app is a Progressive Web App. A rep installs it once from `sunpath.dev` (no app store), it caches itself, and it works the next time they open it whether they have a signal or not. Door events written offline replay automatically the moment the truck rolls back into coverage.

---

## What Sunpath is *not*

We're disciplined about scope. Sunpath does not try to be:

- **A proposal generator.** When the rep needs a 30-page system design with shading models, they hand off to Aurora or whatever the installer already uses.
- **A finance/lender platform.** We surface incentives; we don't underwrite loans.
- **An installation project manager.** Once the contract's signed, the deal hands off to whatever the installer already runs.
- **A commission tracker.** The schema has a place for it, but the workflow stays in QuickBooks or whatever payroll tool already exists.
- **A national-installer enterprise platform.** If you need SAML SSO, audit logs that satisfy SOC 2 Type II, and a 99.99% SLA, we are not your tool yet.

This is a deliberate choice. The smaller the surface, the faster the workflow.

---

## Privacy and data posture

A few things we want to be explicit about, because solar customers ask:

- **Homeowner data we collect from the public record stays at the parcel level** — address, year built, assessed value, ownership status. We don't buy or scrape consumer credit data, social profiles, or anything outside the public record.
- **Personal contact information** (name, phone, email) is stored *only when the homeowner gives it to the rep*. It's encrypted at rest, scoped to the team that captured it, and never shared across teams.
- **We don't sell data.** Sunpath is sold as software to installers. There is no data-broker side business, and the architecture deliberately makes one impossible — the team's leads are isolated by row-level security in their own database tenant.
- **Utility-bill images are stored encrypted**, accessible only to the rep who captured them and their direct manager. Reps can purge a capture at any time.
- **Public data sources are cited everywhere they appear** — homeowners, regulators, and reps can always trace a number back to the agency that published it.

Production deployment includes a `SECURITY.md` with a vulnerability disclosure path and a documented data-retention policy.

---

## Where Sunpath fits

| Tool | Strength | Sunpath relationship |
|---|---|---|
| Salesforce / HubSpot | Enterprise CRM, broad integrations | Sunpath replaces the door-to-door portion; deals can hand off to either if the installer uses one |
| Solo / Aurora | Proposal & system design | Complementary — Sunpath sends qualified leads to Solo/Aurora for the proposal stage |
| Spotio / SalesRabbit | General-purpose D2D | Direct alternative — Sunpath specializes for solar instead of being industry-agnostic |
| Pen-and-paper / Google Sheets | Free, simple | Honest comparison — most small teams really do still use this; Sunpath is the upgrade path |

We assume the installer already has *something* on the proposal/finance side. We don't ask them to rip it out.

---

## What it costs

We charge per active rep per month. There is no per-deal commission, no data-volume tier, no minimum seat count. A two-rep team pays for two reps. A team that benches a rep for the winter pauses that seat. Pricing is on the website; this paper isn't where we negotiate.

There is no free tier with a vendor watermark on the rep's phone. There is a 30-day pilot with full access, no credit card.

---

## What we ship next

The current build covers Scott County, Virginia (FIPS 51169) — Gate City and the surrounding area. The roadmap, in order, is:

1. **Russell County, Virginia** and the rest of southwest Virginia — same parcel-data plumbing, just new adapters
2. **Cross-state expansion to neighboring Tennessee** — adds the same adapter pattern against TN's parcel feed
3. **Bill OCR** — drop a photo of a utility bill on the screen, get the kWh, the rate, and a system-size estimate populated automatically (existing reps already do this in their head; we're saving the typing)
4. **Rewarm triggers** — the part where Sunpath watches your dead leads for you and pings the rep when the public signal changes
5. **HOA awareness** — flagging parcels in HOAs that restrict roof-mount solar, so the rep doesn't burn the visit

Items 1 and 2 require nothing of the customer. Items 3–5 are the work that makes Sunpath different from a sales-tracker.

---

## How to try it

Open `https://sunpath.dev` on your phone. Use Chrome on Android or Safari on iOS. Tap "add to home screen" when the browser offers. Sign in with a magic link, and you're done — no app store, no install, no setup call required.

For pilot inquiries: `pilot@sunpath.dev`.

---

*Sunpath is built by a small independent team. The source is closed but the design is documented in the open at `sunpath.dev/docs`. We answer technical questions on the record because we'd rather have informed customers than impressed ones.*

— *Sunpath, May 2026*
