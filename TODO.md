# Sunpath — Outstanding TODO

Things that need keys, signups, or manual setup before they fully activate.
Everything in the app already works in fallback/stub mode without these.

---

## CRITICAL — Authentication (required before any live users)

**Current state:** One-tap POC entry — no real authentication. Fine for solo
developer testing. Must be replaced before any external rep uses the app.

### OAuth Setup (pick one or more providers)

**Option A — Google Sign-In (recommended first)**
1. Go to https://console.cloud.google.com
2. Create or select a project
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `https://sclisaylpwnffkkyepow.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase Dashboard → Authentication → Providers → Google → Enable → paste credentials
6. In `apps/web/src/modules/auth/`: replace one-tap POC button with
   `supabase.auth.signInWithOAuth({ provider: 'google' })`

**Option B — Microsoft / Outlook Sign-In**
1. Go to https://portal.azure.com → Azure Active Directory → App registrations → New
2. Redirect URI: `https://sclisaylpwnffkkyepow.supabase.co/auth/v1/callback`
3. Certificates & secrets → New client secret
4. Copy Application (client) ID + secret
5. In Supabase Dashboard → Authentication → Providers → Azure → Enable → paste credentials
6. Same code change as Google option

**Option C — Apple Sign-In**
1. Requires Apple Developer account ($99/yr) at https://developer.apple.com
2. Certificates, Identifiers & Profiles → Identifiers → App ID → enable Sign In with Apple
3. Create a Service ID and register the Supabase callback URL
4. Generate a private key for client secret JWT signing
5. In Supabase Dashboard → Authentication → Providers → Apple → Enable → paste credentials

**After enabling OAuth:**
- Verify `rep` DB row is auto-created on first OAuth sign-in (DB trigger should fire — test it)
- Set session timeout in Supabase Auth settings (recommended: 8 hours for a field day)
- Add idle-lockout behavior in the PWA (`supabase.auth.onAuthStateChange`)

### Support contact
- Set up `support@sunpath.dev` email forwarder (your domain registrar → forward to your inbox)
- Or use a free help desk: Freshdesk / HelpScout free tier for ticket tracking

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

- **Calendar integration** — Google Calendar / Outlook (CalDAV) read-only
  OAuth. Shows calendar blocks so the app can surface free walk windows on
  the Today dashboard ("2h 45m before pickup at 5:45 — here's a 14-door
  cluster"). Requires OAuth app setup at Google Cloud Console / Azure AD.
- **Google/Apple developer accounts** — only needed for native app store
  submission (Phase 5). Not required for PWA install.
- **Supabase Pro upgrade** ($25/mo) — adds point-in-time recovery and longer
  log retention. Required before any real user launch.

---

## Infrastructure Evaluation — Azure vs. Supabase + GitHub Pages

**Evaluated 2026-05-10. Decision: stay on current stack for now.**

### Why we chose Supabase + GitHub Pages (current)

The current stack is the right choice for a solo-rep POC through ~100-rep
scale. Key reasons the Azure free tier doesn't win here:

1. **PostGIS spatial queries** — Sunpath uses PostGIS heavily (parcels in
   bounding box, HOA polygon intersections, distance calculations). Azure
   Cosmos DB free tier does NOT support PostGIS-equivalent geospatial
   queries. Azure Database for PostgreSQL supports PostGIS but has no
   perpetual free compute tier (12-month free then ~$12/mo).

2. **No realtime equivalent** — Supabase Realtime (PostgreSQL
   LISTEN/NOTIFY) has no equivalent in Azure's free tier. Azure SignalR
   adds cost and complexity.

3. **Auth complexity** — Supabase Auth (magic link, passwordless, social
   providers) ships configured. Azure AD B2C requires significant OAuth
   plumbing.

4. **Cost parity** — At 100 reps + 1M calls/month: Supabase Pro ≈ $25/mo,
   equivalent Azure stack ≈ $27–30/mo. No cost advantage until well beyond
   POC scale.

5. **Integrated SDK** — `supabase-js` covers auth + database + storage +
   edge functions. Azure requires separate SDKs per service.

### When to reconsider Azure

Revisit migration if any of these become true:
- **Storage limit hit** — Supabase free tier is 1 GB storage. If bill
  capture photos accumulate, this hits before other limits. Upgrade to
  Supabase Pro ($25/mo) first; consider Azure Blob Storage later.
- **Edge function limit hit** — Supabase free: 500k invocations/month.
  Azure Functions free: 1M/month. If heavy function usage, Azure wins here.
- **Enterprise compliance required** — Azure has FedRAMP, HIPAA, SOC 2
  profiles; Supabase does not at free/pro tier.
- **Azure AI Language free tier** — 5,000 text summarization records/month
  free. Useful for Phase 7 note summarization if you don't want to pay
  Anthropic API costs. Worth adding as a secondary option even on the
  current stack (call Azure AI Language from a Supabase edge function).

### Azure services worth adding WITHOUT migrating

These can be wired into the current Supabase stack as supplements:

- **Azure AI Language** (free F0 tier: 5,000 records/month)
  → Extractive note summarization for Phase 7-A
  → Call from `note-summarize/` edge function alongside or instead of
    Claude API; fall back to Claude haiku if Azure quota exhausted
  → Endpoint: `https://<resource>.cognitiveservices.azure.com/language/:analyze-text/jobs`

- **Azure Static Web Apps** (free tier)
  → Potential future hosting alternative to GitHub Pages
  → Supports custom domains, HTTPS, GitHub CI/CD, 100 GB bandwidth
  → Migration is low-risk (just a deploy target change, no code changes)
  → Worth noting for if/when GitHub Pages has limitations

### Migration path (if you ever decide to move fully)

1. **Week 1-2:** Provision Azure DB for PostgreSQL Flexible Server (B1ms),
   restore schema with `pg_dump`, test PostGIS queries.
2. **Week 2-3:** Migrate file storage to Azure Blob Storage, rebuild auth
   with Azure AD B2C or Auth0.
3. **Week 3-4:** Port Supabase Edge Functions to Azure Functions (Node.js).
   Note: lose cron triggers unless you bring a separate Functions app.
4. **Week 4+:** Decide realtime strategy (lose it, or rebuild with
   Azure SignalR / WebSocket server).
5. DNS flip + monitoring + rollback plan.

**Estimated effort: 3–4 weeks solo engineering. Not worth it at current
scale.**
