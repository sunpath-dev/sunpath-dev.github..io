-- Migration 0009 — utility rate observations.
--
-- Stores monthly residential electricity rates pulled from EIA v2
-- (state-level series ELEC.PRICE.<state>-RES.M). The rate-watch-eia
-- Edge Function appends rows on a monthly cron; downstream logic can
-- compare the latest period to an earlier one to emit rate_hike
-- triggers per parcel (using parcel.utility / parcel.state).

create table if not exists public.utility_rate_observation (
  id uuid primary key default gen_random_uuid(),
  -- "RES", "COM", "IND" — residential is what we care about for now.
  sector text not null default 'RES',
  -- US state two-letter code, e.g. "VA". For US-only EIA series.
  state char(2) not null,
  -- Free-form utility identifier when known (EIA utility ID); null for
  -- state-average series.
  utility_id text,
  -- Period covered by the observation, e.g. "2026-04" for April 2026.
  period text not null,
  -- Average residential rate, USD/kWh.
  rate_kwh_usd numeric(7, 4) not null,
  source text not null default 'eia.v2',
  observed_at timestamptz not null default now(),
  -- Idempotency: one observation per (sector, state, utility_id, period)
  unique (sector, state, utility_id, period)
);

create index if not exists idx_utility_rate_state_period
  on public.utility_rate_observation (state, period desc);

alter table public.utility_rate_observation enable row level security;

-- Reps can read everything (rates are public data). Writes are server-side only.
create policy utility_rate_authed_read on public.utility_rate_observation
  for select to authenticated using (true);
