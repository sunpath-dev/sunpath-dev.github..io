# Sunpath — Outstanding TODO

Things that need keys, signups, or manual setup before they fully activate.
Everything in the app already works in fallback/stub mode without these.

---

## API Keys to Obtain

### 1. Google Solar API Key
**What it unlocks:** Accurate per-roof panel placement — roof segment pitch,
exact viable area, precise south-facing orientation. Without it, the Roof
Analysis section still shows OSM-estimated numbers.

**Steps:**
1. Go to https://console.cloud.google.com
2. Create or select a project
3. Enable billing (required — but free tier gives 100 requests/day at no charge)
4. Go to **APIs & Services → Library** → search "Solar API" → Enable
5. Go to **APIs & Services → Credentials → Create Credentials → API Key**
6. Restrict the key to "Solar API" only
7. Copy the key, then run:

```sh
SUPABASE_ACCESS_TOKEN=<your-supabase-pat> \
npx supabase secrets set GOOGLE_SOLAR_API_KEY=AIzaSy... \
  --project-ref sclisaylpwnffkkyepow
```

---

### 2. DSIRE Incentives API Key
**What it unlocks:** Live solar incentive programs for any state from the
Database of State Incentives for Renewables & Efficiency. Without it, the
app shows a hardcoded list of VA and TN programs.

**Steps:**
1. Go to https://programs.dsireusa.org
2. Click "API Access" or contact dsire@ncsu.edu to request credentials
3. Free for non-commercial / research use
4. Once you have the key, run:

```sh
SUPABASE_ACCESS_TOKEN=<your-supabase-pat> \
npx supabase secrets set DSIRE_API_KEY=your-key-here \
  --project-ref sclisaylpwnffkkyepow
```

---

## Infrastructure / Manual Setup

### 3. Repo Rename (for sunpath.dev to work correctly)
The repo is currently `sunpath-dev.github..io` (two dots — typo).
GitHub Pages won't serve it as `<owner>.github.io` properly.

**Fix:** GitHub → Settings → General → Repository name → rename to `sunpath-dev.github.io`

Git remotes auto-redirect; local clones keep working.

---

### 4. DNS Records for sunpath.dev
At your domain registrar, add these records pointing to GitHub Pages:

```
A    @    185.199.108.153
A    @    185.199.109.153
A    @    185.199.110.153
A    @    185.199.111.153
CNAME www  sunpath-dev.github.io.
```

Then in GitHub → Settings → Pages:
- Source: GitHub Actions
- Custom domain: `sunpath.dev`
- Enforce HTTPS: ON

---

### 5. Scott County VA Permit Data
**What it unlocks:** The Neighborhood Proof section showing nearby solar
permits. The "Top Doors to Revisit" list on the Today dashboard also needs
permit trigger events.

**Problem:** Scott County publishes building permits as a PDF on their website
— no structured API or feed.

**Options:**
- (A) Manually export permit data from https://scottcountyva.com and run a
  one-time import into the `trigger_event` table.
- (B) Write a PDF parser for the periodic permit listing — the adapter stub
  is at `parcel-adapters/virginia/scott-permits.ts`.
- (C) Contact the county building department to request a data export.

---

### 6. More Parcel Data
Currently only 25 seed parcels cover Gate City, VA. Your house (302 Jesse
Farm Drive) opens as a "synthetic" geocoded parcel with no DB record.

The Scott County parcel adapter (`parcel-adapters/virginia/scott.ts`) is
built and working — it pulls from the VGIN ArcGIS REST endpoint. Run the
full ingest to populate real county parcels:

```sh
# From the repo root
pnpm ingest:parcels
```

Or trigger the edge function directly:
```sh
curl -X POST \
  "https://sclisaylpwnffkkyepow.supabase.co/functions/v1/ingest-parcels" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"state_fips":"51","county_fips":"169"}'
```

---

## Nice-to-Have (deferred per plan.md)

- **Calendar integration** — Google/iCal/CalDAV to show walk windows around
  existing commitments. Placeholder UI already on the Today dashboard.
  Requires OAuth app setup.
- **Google/Apple developer accounts** — only needed for native app store
  submission (Phase 5). Not required for PWA install.
- **Supabase Pro upgrade** ($25/mo) — adds point-in-time recovery and longer
  log retention. Required before any real user launch.
