-- Migration 0006 — HOA zones + bill_capture relaxation.
--
-- HOA: simple polygon table per market with a 'rule_color' (red/yellow/green)
-- so we can ASTcast a quick pre-knock badge into the parcel detail sheet.
-- Reps import polygons manually for Phase 5.1; future automation can append.
--
-- bill_capture: relax lead_id + image_url so reps can save a parsed bill
-- as a standalone capture (typed text, no image yet) and attach to a lead later.

-- HOA zones --------------------------------------------------------------
create table if not exists public.hoa_zone (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  county text,
  rule_color text not null check (rule_color in ('red', 'yellow', 'green')),
  notes text,
  geom geometry(Polygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hoa_zone_geom on public.hoa_zone using gist (geom);
create index if not exists idx_hoa_zone_state on public.hoa_zone (state);

create trigger trg_hoa_zone_updated
before update on public.hoa_zone
for each row execute function public.set_updated_at();

alter table public.hoa_zone enable row level security;

-- HOA zones are reference data — readable by any authenticated rep,
-- writable only by service role (admin imports).
create policy "hoa_zone read all auth"
  on public.hoa_zone for select
  to authenticated
  using (true);

-- Spatial-join helper: returns the matching zone (if any) for a parcel.
-- Uses parcel.centroid; treats first matching zone as authoritative.
create or replace function public.hoa_for_parcel(parcel_id uuid)
returns table (
  zone_id uuid,
  name text,
  rule_color text,
  notes text
)
language sql
stable
as $$
  select h.id, h.name, h.rule_color, h.notes
  from public.parcel p
  join public.hoa_zone h on st_intersects(h.geom, p.centroid)
  where p.id = parcel_id
  limit 1;
$$;

grant execute on function public.hoa_for_parcel(uuid) to authenticated;

-- Admin upsert helper used by scripts/import-hoa.ts. Service role only.
create or replace function public.hoa_zone_upsert(
  p_name text,
  p_state text,
  p_county text,
  p_rule_color text,
  p_notes text,
  p_wkt text
)
returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
begin
  insert into public.hoa_zone (name, state, county, rule_color, notes, geom)
  values (
    p_name,
    p_state,
    p_county,
    p_rule_color,
    p_notes,
    st_setsrid(st_geomfromtext(p_wkt), 4326)
  )
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.hoa_zone_upsert(text, text, text, text, text, text) to service_role;

-- bill_capture relaxation ------------------------------------------------
alter table public.bill_capture
  alter column lead_id drop not null,
  alter column image_url drop not null;

-- Allow reps to insert their own captures even without a lead yet.
drop policy if exists "bill_capture rep all" on public.bill_capture;
create policy "bill_capture rep insert"
  on public.bill_capture for insert
  to authenticated
  with check (rep_id = auth.uid());
create policy "bill_capture rep select"
  on public.bill_capture for select
  to authenticated
  using (rep_id = auth.uid());
create policy "bill_capture rep update"
  on public.bill_capture for update
  to authenticated
  using (rep_id = auth.uid());
