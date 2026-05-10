-- Migration 0010 — HOA polygons + parcel sale-date tracking.
--
-- HOA module (Phase 5.1): polygons let us answer "is this address in an
-- HOA?" with a single spatial join. Each market's HOA boundaries are
-- imported manually for the rep's top neighborhoods; over time we may
-- automate via county GIS feeds.
--
-- Property sale tracking (Phase 4.3 prereq): parcel.last_sale_date lets
-- the property-sale monitor diff successive imports and emit a "for_sale"
-- or "sold" trigger when a parcel changes hands.

create table if not exists public.hoa (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Tri-color badge in the territory UI:
  --   red    = restrictive (no solar, exterior approval mandatory)
  --   yellow = case-by-case approval, design rules apply
  --   green  = solar-friendly / no HOA restrictions
  rule_color text not null default 'yellow' check (rule_color in ('red', 'yellow', 'green')),
  state char(2) not null,
  county_fips char(3) not null,
  boundary geography(Polygon, 4326) not null,
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hoa_boundary on public.hoa using gist (boundary);
create index if not exists idx_hoa_county on public.hoa (state, county_fips);

create trigger trg_hoa_updated before update on public.hoa
  for each row execute function public.set_updated_at();

alter table public.hoa enable row level security;
create policy hoa_authed_read on public.hoa
  for select to authenticated using (true);

-- Add hoa_id FK to parcel (nullable — most parcels won't have one).
alter table public.parcel
  add column if not exists hoa_id uuid references public.hoa(id) on delete set null;
create index if not exists idx_parcel_hoa on public.parcel (hoa_id);

-- Spatial helper used by the parcel detail sheet to look up an HOA by
-- containment of the parcel centroid. Falls back to parcel.hoa_id if set
-- (manual override).
create or replace function public.hoa_for_parcel(parcel_id uuid)
returns table (name text, rule_color text, notes text)
language sql
stable
as $$
  with p as (
    select centroid, hoa_id from public.parcel where id = parcel_id
  )
  select h.name, h.rule_color, h.notes
  from public.hoa h, p
  where (p.hoa_id = h.id)
     or (p.hoa_id is null and st_covers(h.boundary, p.centroid))
  order by (p.hoa_id = h.id) desc nulls last
  limit 1;
$$;

grant execute on function public.hoa_for_parcel(uuid) to authenticated;

-- Sale tracking
alter table public.parcel
  add column if not exists last_sale_date date,
  add column if not exists last_sale_amount_usd numeric;
