-- supabase/cron.sql — opt-in cron schedule for Sunpath edge functions.
--
-- This is NOT a forward-only migration. Run it manually in the Supabase
-- SQL editor *after* the project is provisioned and after you've set
-- the two GUCs below to the project URL and the service-role key.
-- Re-running drops + recreates the schedule, so it is safe to edit and
-- replay.
--
-- Prereqs (one-time, in the Supabase dashboard → Database → Extensions):
--   - pg_cron
--   - pg_net
--
-- Then, in the SQL editor, set the project secrets ONCE:
--   alter database postgres set "app.supabase_url" = 'https://xxxx.supabase.co';
--   alter database postgres set "app.service_role_key" = 'eyJhbGc...';
--
-- These GUCs are readable by the cron jobs below via current_setting().

-- Helper: invoke a Supabase Edge Function by name. Returns the request
-- id (pg_net handles the response asynchronously).
create or replace function public.invoke_edge_function(fn_name text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := current_setting('app.supabase_url', true) || '/functions/v1/' || fn_name;
  v_key text := current_setting('app.service_role_key', true);
  v_request_id bigint;
begin
  if v_url is null or v_key is null then
    raise exception 'app.supabase_url / app.service_role_key not set';
  end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    ),
    body := body
  ) into v_request_id;
  return v_request_id;
end;
$$;

-- Drop + recreate every cron job so this script is idempotent.
do $$
declare
  j record;
begin
  for j in select jobname from cron.job where jobname like 'sunpath_%'
  loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- Hourly: callback-due triggers
select cron.schedule(
  'sunpath_callback_due',
  '7 * * * *',
  $$select public.invoke_edge_function('triggers-callback-due');$$
);

-- Hourly: forecast prewarm (pulls per-territory NWS forecasts)
select cron.schedule(
  'sunpath_forecast_prewarm',
  '13 * * * *',
  $$select public.invoke_edge_function('forecast-fetch');$$
);

-- Daily 02:00 UTC: incremental parcel ingest from VGIN
select cron.schedule(
  'sunpath_ingest_parcels',
  '0 2 * * *',
  $$select public.invoke_edge_function('ingest-parcels');$$
);

-- Daily 02:15 UTC: permit scan
select cron.schedule(
  'sunpath_scan_permits',
  '15 2 * * *',
  $$select public.invoke_edge_function('triggers-scan-permits');$$
);

-- Daily 02:30 UTC: property-sale diff
select cron.schedule(
  'sunpath_property_sales',
  '30 2 * * *',
  $$select public.invoke_edge_function('triggers-property-sales');$$
);

-- Daily 03:00 UTC: nightly score recompute
select cron.schedule(
  'sunpath_score_parcels',
  '0 3 * * *',
  $$select public.invoke_edge_function('score-parcels');$$
);

-- Daily 03:30 UTC: rewarm derivation (signals → triggers)
select cron.schedule(
  'sunpath_rewarm_derive',
  '30 3 * * *',
  $$select public.invoke_edge_function('rewarm-derive');$$
);

-- Daily 11:00 UTC (≈ 07:00 ET): rewarm push to reps
select cron.schedule(
  'sunpath_rewarm_push',
  '0 11 * * *',
  $$select public.invoke_edge_function('rewarm-push');$$
);

-- Weekly Mon 04:00 UTC: rate-watch (EIA monthly cadence is good enough,
-- but we poll weekly so a mid-month filing surfaces faster)
select cron.schedule(
  'sunpath_rate_watch',
  '0 4 * * 1',
  $$select public.invoke_edge_function('rate-watch-eia');$$
);

-- Monthly 05:00 UTC on the 2nd: ACS area signals
select cron.schedule(
  'sunpath_area_signals',
  '0 5 2 * *',
  $$select public.invoke_edge_function('ingest-area-signals');$$
);

-- Daily 06:00 UTC: PII retention purge (per pii_retention_policy)
select cron.schedule(
  'sunpath_pii_purge',
  '0 6 * * *',
  $$select public.purge_expired_pii();$$
);

-- Weekly Sun 06:30 UTC: rate-limit bucket GC
select cron.schedule(
  'sunpath_rate_limit_gc',
  '30 6 * * 0',
  $$select public.rate_limit_gc('7 days'::interval);$$
);

-- Inspect with: select jobname, schedule, command from cron.job where jobname like 'sunpath_%';
