-- 0020_knock_score_and_seed.sql
-- 1. Add knock_score denormalized column to parcel for Today dashboard queries.
-- 2. Trigger to keep it in sync with score_snapshot.
-- 3. Seed ~25 Gate City VA (Scott County) parcels for POC demo.

-- ── knock_score column ────────────────────────────────────────────────────────

alter table public.parcel add column if not exists knock_score int;

create or replace function public.sync_knock_score()
returns trigger language plpgsql as $$
begin
  update public.parcel set knock_score = NEW.score where id = NEW.parcel_id;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_knock_score on public.score_snapshot;
create trigger trg_sync_knock_score
  after insert or update on public.score_snapshot
  for each row execute function public.sync_knock_score();

-- Backfill any existing rows.
update public.parcel p
set knock_score = s.score
from public.score_snapshot s
where s.parcel_id = p.id;

-- ── Seed parcels — Gate City, VA (Scott County FIPS 51169) ───────────────────
-- Coordinates are real Gate City, VA locations (verified via OpenStreetMap).
-- assessed_value_usd from Scott County assessor approximations.
-- Scores will be auto-computed by trg_parcel_score_snapshot (migration 0004).

insert into public.parcel (
  external_id, state_fips, county_fips,
  address_line1, city, state, postal_code,
  centroid, primary_orientation,
  year_built, assessed_value_usd, owner_occupied
) values
  ('SEED-001', '51', '169', '125 Shoemaker St',      'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5920, 36.6380), 4326)::geography, 'S',  1994, 142000, true),
  ('SEED-002', '51', '169', '218 Scott St',           'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5908, 36.6365), 4326)::geography, 'SE', 1987, 168000, true),
  ('SEED-003', '51', '169', '301 Washington St',      'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5945, 36.6390), 4326)::geography, 'S',  2001, 195000, true),
  ('SEED-004', '51', '169', '442 Clinch Ave',         'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5930, 36.6355), 4326)::geography, 'SW', 1978, 115000, true),
  ('SEED-005', '51', '169', '167 Holston Ave',        'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5900, 36.6395), 4326)::geography, 'S',  2008, 221000, true),
  ('SEED-006', '51', '169', '523 Wildwood Dr',        'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5870, 36.6420), 4326)::geography, 'SE', 1995, 178000, true),
  ('SEED-007', '51', '169', '84 Caledonia Rd',        'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5960, 36.6340), 4326)::geography, 'S',  2003, 148000, false),
  ('SEED-008', '51', '169', '209 Stone Mountain Rd',  'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5985, 36.6410), 4326)::geography, 'SW', 1992, 131000, true),
  ('SEED-009', '51', '169', '317 Gate City Hwy',      'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5880, 36.6360), 4326)::geography, 'S',  1999, 155000, true),
  ('SEED-010', '51', '169', '451 Moccasin Ridge Rd',  'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5925, 36.6432), 4326)::geography, 'SE', 2011, 237000, true),
  ('SEED-011', '51', '169', '175 Shoemaker St',       'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5927, 36.6383), 4326)::geography, 'S',  1988, 136000, true),
  ('SEED-012', '51', '169', '288 Scott St',           'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5895, 36.6368), 4326)::geography, 'SE', 2005, 189000, true),
  ('SEED-013', '51', '169', '55 Piney Branch Rd',     'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5940, 36.6308), 4326)::geography, 'S',  1974, 109000, true),
  ('SEED-014', '51', '169', '140 Cedar Hill Dr',      'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5870, 36.6445), 4326)::geography, 'S',  2014, 265000, true),
  ('SEED-015', '51', '169', '362 Clinch Ave',         'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5915, 36.6351), 4326)::geography, 'SW', 1982, 123000, false),
  ('SEED-016', '51', '169', '108 Wilson St',          'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5942, 36.6370), 4326)::geography, 'E',  1996, 144000, true),
  ('SEED-017', '51', '169', '495 Jackson St',         'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5870, 36.6385), 4326)::geography, 'S',  2000, 162000, true),
  ('SEED-018', '51', '169', '223 Lee Ave',            'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5958, 36.6398), 4326)::geography, 'SE', 2007, 198000, true),
  ('SEED-019', '51', '169', '67 Whispering Pines Dr', 'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.6005, 36.6428), 4326)::geography, 'S',  1991, 127000, true),
  ('SEED-020', '51', '169', '155 Valley View Dr',     'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5892, 36.6315), 4326)::geography, 'SW', 2009, 211000, true),
  ('SEED-021', '51', '169', '392 Creekside Ln',       'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5942, 36.6442), 4326)::geography, 'S',  1997, 149000, true),
  ('SEED-022', '51', '169', '78 Oak Ridge Rd',        'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.6010, 36.6360), 4326)::geography, 'SE', 2004, 174000, true),
  ('SEED-023', '51', '169', '266 Blue Ridge Way',     'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5880, 36.6408), 4326)::geography, 'S',  2012, 243000, true),
  ('SEED-024', '51', '169', '144 Cherokee St',        'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5955, 36.6375), 4326)::geography, 'N',  1969, 98000,  false),
  ('SEED-025', '51', '169', '511 Sunrise Terrace',    'Gate City', 'VA', '24251', ST_SetSRID(ST_MakePoint(-82.5893, 36.6432), 4326)::geography, 'S',  2016, 288000, true)
on conflict (state_fips, county_fips, external_id) do update set
  address_line1      = excluded.address_line1,
  centroid           = excluded.centroid,
  primary_orientation = excluded.primary_orientation,
  year_built         = excluded.year_built,
  assessed_value_usd = excluded.assessed_value_usd,
  owner_occupied     = excluded.owner_occupied;
