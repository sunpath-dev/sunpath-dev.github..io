# Sunpath — Troubleshooting Runbook

For operator use. All Supabase links target `sclisaylpwnffkkyepow`.

---

## Map shows white or blank

**Symptom:** The `/territory` map tab loads but shows a white or slate-gray rectangle with no tiles.

**Causes and fixes:**

1. **Flex container 0-height (most common on iOS Safari)** — the map canvas gets created before the flex layout is painted, giving it 0×0 dimensions. Fix: ensure the map wrapper has `min-h-0` class (see `route.tsx` line ~538). The `requestAnimationFrame` + 200ms timeout resize should recover this.

2. **MapLibre CSS not loaded** — the CSS must be in the main bundle, not a lazy chunk. `apps/web/src/main.tsx` must have `import 'maplibre-gl/dist/maplibre-gl.css'`. If it's not there, add it.

3. **OSM tiles blocked** — open browser DevTools → Network. Filter by `tile.openstreetmap.org`. If requests are failing (CORS, 429, timeout), OSM may be temporarily rate-limited. Wait and try again.

4. **JavaScript error during map init** — check browser console for errors. Common: `containerRef.current is null` (component unmounted before effect ran), or a MapLibre version mismatch.

---

## Parcel pins not showing

**Symptom:** Map tiles load but no colored dots appear for properties.

**Diagnosis:**
1. Open browser DevTools → Network. Look for calls to `sclisaylpwnffkkyepow.supabase.co/rest/v1/rpc/parcels_in_bbox`.
2. If the call returns 401: RLS is blocking anon reads. Check that the user is authenticated (`rep.status = 'active'`).
3. If the call returns 200 but with `[]`: zoom in to at least zoom 12. Pins are hidden below zoom 12. Also confirm there are seeded parcels: `select count(*) from parcel`.
4. If the call returns 200 with data but pins still don't appear: check the `pinsToGeoJSON` function and the `parcels-circle` MapLibre layer is added in `map.on("load")`.

**Supabase link:** [Table editor → parcel](https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/editor) | [Logs → API](https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/logs/api-edge-logs)

---

## Weather unavailable on Home dashboard

**Symptom:** Home dashboard shows "Weather unavailable" or weather card is empty.

**Diagnosis:**
1. The `weather-now` and `weather-forecast` edge functions call NOAA NWS.
2. NWS requires a `User-Agent` header — check the edge function includes it.
3. NWS `/points/{lat},{lon}` sometimes returns 500 for locations slightly offshore or in territories. Test at a known-good coordinate (e.g., Gate City VA: `36.6376,-82.5915`).
4. Check edge function logs: [Supabase → Functions → weather-now](https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/functions)

**Fallback:** None currently. Card hides gracefully.

---

## Auth / OAuth not working

**Symptom:** Clicking "Continue with Google" or "Continue with Microsoft" does nothing, errors, or redirects to a blank page.

**Checklist:**
- [ ] Google OAuth: Google Cloud Console → OAuth 2.0 client → Authorized redirect URIs includes `https://sclisaylpwnffkkyepow.supabase.co/auth/v1/callback`
- [ ] Microsoft OAuth: Azure Portal → App registration → Redirect URI is `https://sclisaylpwnffkkyepow.supabase.co/auth/v1/callback`; Tenant = `https://login.microsoftonline.com/common/v2.0`
- [ ] Supabase → Auth → Providers → Google is enabled and client ID/secret are set
- [ ] Supabase → Auth → Providers → Azure (Microsoft) is enabled and client ID/secret/tenant are set
- [ ] Supabase → Auth → URL Configuration → Site URL = `https://sunpath.dev`; Additional redirect URLs includes `http://localhost:5173`
- [ ] "Link accounts with same email" is ON in Supabase Auth settings

**Local dev note:** When testing locally, `window.location.origin` = `http://localhost:5173`. The OAuth redirect goes to Supabase then back to `http://localhost:5173/`. Make sure that URL is in Supabase additional redirect URLs.

---

## New user stuck on "Waiting for approval"

**Symptom:** User signed in with OAuth but sees PendingApprovalScreen indefinitely.

**Fix:**
1. Go to Admin Portal → Accounts (or Settings → Admin Panel if not yet built).
2. Find the user in "Pending accounts" and click Approve.
3. If the user doesn't appear in pending: check `select * from rep where status = 'pending'` in Supabase SQL editor.
4. To manually approve: `update rep set status = 'active' where auth_user_id = '<uuid>'`

**Supabase link:** [SQL Editor](https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/sql/new)

---

## Push notifications not firing

**Symptom:** Daily rewarm notifications aren't arriving.

**Checklist:**
- [ ] Browser push permission was granted (check `Notification.permission === 'granted'`)
- [ ] `push_subscription` table has a row for this rep: `select * from push_subscription where rep_id = '<id>'`
- [ ] `push-send` edge function is deployed
- [ ] VAPID keys are set as Supabase secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- [ ] The daily cron job is scheduled (check `pg_cron` or Supabase cron config)

---

## Bill OCR returns wrong numbers

**Symptom:** Camera capture or PDF upload shows incorrect kWh or dollar amounts.

**Diagnosis:**
1. Check browser console for Tesseract.js errors.
2. Image quality: blurry photos, glare, or angled shots reduce accuracy. Ask rep to take photo flat-on with good lighting.
3. Manual entry mode is always available as fallback — tap "Enter manually" in Bill Capture.
4. The extracted numbers are shown for review before save — the rep can correct them before confirming.

---

## Edge function errors

**General steps:**
1. Open [Supabase → Functions](https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/functions)
2. Select the failing function
3. Check logs for the last error message and stack trace
4. Common causes: missing secret (set with `supabase secrets set KEY=value`), upstream API rate limit, invalid JSON body from client

**Redeploy a function:**
```bash
supabase functions deploy <function-name>
```

**Deploy all functions:**
```bash
supabase functions deploy
```

---

## Database migration needed

If the app behaves incorrectly after a code deploy (missing columns, RLS errors, 42P01 table-not-found), a migration may not have been applied.

**Check applied migrations:**
```sql
select * from supabase_migrations.schema_migrations order by version;
```

**Apply pending migrations:**
```bash
supabase db push --include-all
```

After DDL changes, invalidate the PostgREST schema cache:
```sql
notify pgrst, 'reload schema';
```
Or via the management API: `POST /v1/projects/sclisaylpwnffkkyepow/database/query` with body `{ "query": "notify pgrst, 'reload schema';" }`.

---

## Useful Supabase dashboard links

| What | URL |
|---|---|
| Table editor | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/editor` |
| SQL editor | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/sql/new` |
| Auth users | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/auth/users` |
| Edge functions | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/functions` |
| API logs | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/logs/api-edge-logs` |
| Storage | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/storage/buckets` |
| Secrets | `https://supabase.com/dashboard/project/sclisaylpwnffkkyepow/settings/vault` |
