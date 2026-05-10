-- 0001_init.sql — Sunpath base schema
-- POC posture: RLS + magic-link auth only. Production hardening (column
-- encryption, audit logs, column-level grants) lives in plan.md.

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reps
-- ---------------------------------------------------------------------------

create table public.rep (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  -- household_view_token: kept for future spouse view (deferred). Unused for now.
  household_view_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_rep_updated before update on public.rep
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Parcels — normalized output of county adapters
-- ---------------------------------------------------------------------------

create table public.parcel (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  state_fips char(2) not null,
  county_fips char(3) not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state char(2) not null,
  postal_code text not null,
  centroid geography(Point, 4326) not null,
  footprint geography(Polygon, 4326),
  roof_area_sqft numeric,
  primary_orientation text not null default 'unknown',
  year_built int,
  owner_occupied boolean,
  owner_name_redacted text,
  assessed_value_usd numeric,
  has_existing_solar boolean not null default false,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state_fips, county_fips, external_id)
);
create index idx_parcel_centroid on public.parcel using gist (centroid);
create index idx_parcel_county on public.parcel (state_fips, county_fips);
create trigger trg_parcel_updated before update on public.parcel
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Property + area signals (drive rewarm triggers)
-- ---------------------------------------------------------------------------

create table public.property_signal (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcel(id) on delete cascade,
  kind text not null,
  observed_at timestamptz not null,
  payload jsonb,
  source text not null,
  created_at timestamptz not null default now()
);
create index idx_property_signal_parcel on public.property_signal (parcel_id, observed_at desc);

create table public.area_signal (
  id uuid primary key default gen_random_uuid(),
  -- Geographic scope for the signal (e.g. census block group, ZIP).
  scope geography(Polygon, 4326) not null,
  kind text not null,
  observed_at timestamptz not null,
  payload jsonb,
  source text not null,
  created_at timestamptz not null default now()
);
create index idx_area_signal_scope on public.area_signal using gist (scope);

-- ---------------------------------------------------------------------------
-- Door events — what happened at the door
-- ---------------------------------------------------------------------------

create table public.door_event (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcel(id) on delete cascade,
  rep_id uuid not null references public.rep(id) on delete cascade,
  occurred_at timestamptz not null,
  outcome text not null,
  notes text,
  geo_lat numeric,
  geo_lon numeric,
  client_event_id uuid not null unique, -- offline-replay dedup key
  created_at timestamptz not null default now()
);
create index idx_door_event_rep_time on public.door_event (rep_id, occurred_at desc);
create index idx_door_event_parcel on public.door_event (parcel_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table public.lead (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcel(id) on delete cascade,
  rep_id uuid not null references public.rep(id) on delete cascade,
  stage text not null default 'new',
  -- PII below — must be encrypted at rest in production hardening.
  contact_name text,
  phone text,
  email text,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parcel_id, rep_id)
);
create index idx_lead_rep_stage on public.lead (rep_id, stage);
create index idx_lead_next_action on public.lead (rep_id, next_action_at) where next_action_at is not null;
create trigger trg_lead_updated before update on public.lead
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bill captures (uploaded utility-bill images + parsed fields)
-- ---------------------------------------------------------------------------

create table public.bill_capture (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead(id) on delete cascade,
  rep_id uuid not null references public.rep(id) on delete cascade,
  image_url text not null,             -- Supabase Storage object path
  utility_name text,
  service_address text,
  billing_period_start date,
  billing_period_end date,
  total_kwh numeric,
  total_amount_usd numeric,
  rate_kwh_usd numeric,
  parsed_fields jsonb,
  created_at timestamptz not null default now()
);
create index idx_bill_capture_lead on public.bill_capture (lead_id);

-- ---------------------------------------------------------------------------
-- Quotes (PVWatts + DSIRE-derived)
-- ---------------------------------------------------------------------------

create table public.quote (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead(id) on delete cascade,
  rep_id uuid not null references public.rep(id) on delete cascade,
  system_size_kw numeric not null,
  est_annual_kwh numeric not null,
  est_annual_savings_usd numeric not null,
  est_payback_years numeric,
  inputs jsonb not null,
  created_at timestamptz not null default now()
);
create index idx_quote_lead on public.quote (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger events (rewarm history) + Incentives (DSIRE cache)
-- ---------------------------------------------------------------------------

create table public.trigger_event (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.parcel(id) on delete cascade,
  kind text not null,
  fired_at timestamptz not null,
  payload jsonb,
  notified_rep_id uuid references public.rep(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_trigger_event_parcel on public.trigger_event (parcel_id, fired_at desc);

create table public.incentive (
  id uuid primary key default gen_random_uuid(),
  dsire_program_id text not null unique,
  state char(2) not null,
  name text not null,
  category text,
  amount text,
  expires_on date,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create index idx_incentive_state on public.incentive (state);

-- ---------------------------------------------------------------------------
-- Commission events (DEFERRED — schema only, no UI/ingestion)
-- ---------------------------------------------------------------------------

create table public.commission_event (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.rep(id) on delete cascade,
  lead_id uuid not null references public.lead(id) on delete cascade,
  amount_usd numeric not null,
  status text not null default 'pending', -- pending | paid | clawed_back
  expected_pay_date date,
  paid_on date,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_commission_event_updated before update on public.commission_event
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.rep enable row level security;
alter table public.parcel enable row level security;
alter table public.property_signal enable row level security;
alter table public.area_signal enable row level security;
alter table public.door_event enable row level security;
alter table public.lead enable row level security;
alter table public.bill_capture enable row level security;
alter table public.quote enable row level security;
alter table public.trigger_event enable row level security;
alter table public.incentive enable row level security;
alter table public.commission_event enable row level security;

-- Rep: each user reads/writes only their own rep row.
create policy rep_self_select on public.rep
  for select using (auth_user_id = auth.uid());
create policy rep_self_modify on public.rep
  for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- Parcels are shared territory data (read-only to authed users; writes via service role).
create policy parcel_authed_read on public.parcel
  for select using (auth.uid() is not null);

-- Signals: shared read; writes from service role only.
create policy property_signal_authed_read on public.property_signal
  for select using (auth.uid() is not null);
create policy area_signal_authed_read on public.area_signal
  for select using (auth.uid() is not null);

-- Door events / leads / bills / quotes / triggers / commissions: rep-scoped.
create policy door_event_rep_scope on public.door_event
  for all using (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  ) with check (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );

create policy lead_rep_scope on public.lead
  for all using (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  ) with check (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );

create policy bill_capture_rep_scope on public.bill_capture
  for all using (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  ) with check (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );

create policy quote_rep_scope on public.quote
  for all using (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  ) with check (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );

create policy trigger_event_rep_read on public.trigger_event
  for select using (
    notified_rep_id is null
    or notified_rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );

-- Incentives are reference data — read by anyone authed.
create policy incentive_authed_read on public.incentive
  for select using (auth.uid() is not null);

create policy commission_event_rep_scope on public.commission_event
  for all using (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  ) with check (
    rep_id in (select id from public.rep where auth_user_id = auth.uid())
  );
