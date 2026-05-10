-- Migration 0004 — score_snapshot table + computed-on-insert trigger.
--
-- Goal: stop computing knock-score in the browser on every map render.
-- A trigger on `parcel` insert/update writes a row to `score_snapshot`
-- with the breakdown so the territory map can read it back via the RPC.
--
-- This mirrors packages/shared/src/scoring.ts. The browser still uses the
-- pure scoring lib for previews, but the canonical score is server-side.

create table if not exists public.score_snapshot (
  parcel_id uuid primary key references public.parcel(id) on delete cascade,
  score int,
  excluded_reason text,
  factors jsonb not null,
  computed_at timestamptz not null default now()
);

-- Translates the parcel row into a score 0..100 (or null when excluded).
-- Mirrors scoring.ts; intentionally simple/pure so it stays in lockstep.
create or replace function public.compute_parcel_score(p public.parcel)
returns table (score int, excluded_reason text, factors jsonb)
language plpgsql immutable
as $$
declare
  f_owner int;
  f_orient int;
  f_value int;
  f_year int;
  total int;
begin
  if p.has_existing_solar then
    return query select null::int, 'existing_solar'::text,
      jsonb_build_object();
    return;
  end if;

  f_owner := case
    when p.owner_occupied is true then 25
    when p.owner_occupied is false then 0
    else 12
  end;

  f_orient := case upper(coalesce(p.primary_orientation, 'unknown'))
    when 'S' then 15
    when 'SE' then 10
    when 'SW' then 10
    when 'E' then 5
    when 'W' then 5
    when 'N' then 0
    when 'NE' then 2
    when 'NW' then 2
    else 5
  end;

  f_value := case
    when p.assessed_value_usd is null then 5
    when p.assessed_value_usd < 100000 or p.assessed_value_usd > 1500000 then 0
    when p.assessed_value_usd between 200000 and 700000 then 10
    else 5
  end;

  f_year := case
    when p.year_built is null then 2
    when p.year_built between 1985 and 2015 then 5
    else 2
  end;

  total := f_owner + f_orient + f_value + f_year;
  total := greatest(0, least(100, total));

  return query select total::int, null::text,
    jsonb_build_object(
      'ownerOccupied', f_owner,
      'roofOrientation', f_orient,
      'valueBracket', f_value,
      'yearBuilt', f_year
    );
end;
$$;

create or replace function public.refresh_score_snapshot()
returns trigger
language plpgsql
as $$
declare
  s int;
  ex text;
  fc jsonb;
begin
  select score, excluded_reason, factors
    into s, ex, fc
    from public.compute_parcel_score(new);

  insert into public.score_snapshot (parcel_id, score, excluded_reason, factors, computed_at)
  values (new.id, s, ex, fc, now())
  on conflict (parcel_id) do update
    set score = excluded.score,
        excluded_reason = excluded.excluded_reason,
        factors = excluded.factors,
        computed_at = now();
  return new;
end;
$$;

drop trigger if exists trg_parcel_score_snapshot on public.parcel;
create trigger trg_parcel_score_snapshot
  after insert or update of
    has_existing_solar, owner_occupied, primary_orientation,
    assessed_value_usd, year_built
  on public.parcel
  for each row execute function public.refresh_score_snapshot();

-- Backfill existing rows.
insert into public.score_snapshot (parcel_id, score, excluded_reason, factors, computed_at)
select
  p.id,
  cs.score,
  cs.excluded_reason,
  cs.factors,
  now()
from public.parcel p
cross join lateral public.compute_parcel_score(p) cs
on conflict (parcel_id) do nothing;

-- Extend parcels_in_bbox to return the precomputed score for the layer.
drop function if exists public.parcels_in_bbox(
  double precision, double precision, double precision, double precision, int
);

create or replace function public.parcels_in_bbox(
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  max_rows int default 2000
)
returns table (
  id uuid,
  external_id text,
  address_line1 text,
  city text,
  state char(2),
  postal_code text,
  lon double precision,
  lat double precision,
  has_existing_solar boolean,
  owner_occupied boolean,
  assessed_value_usd numeric,
  year_built int,
  primary_orientation text,
  score int,
  excluded_reason text
)
language sql stable
as $$
  select
    p.id,
    p.external_id,
    p.address_line1,
    p.city,
    p.state,
    p.postal_code,
    st_x(p.centroid::geometry) as lon,
    st_y(p.centroid::geometry) as lat,
    p.has_existing_solar,
    p.owner_occupied,
    p.assessed_value_usd,
    p.year_built,
    p.primary_orientation,
    s.score,
    s.excluded_reason
  from public.parcel p
  left join public.score_snapshot s on s.parcel_id = p.id
  where st_intersects(
    p.centroid,
    st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography
  )
  limit max_rows;
$$;

grant execute on function public.parcels_in_bbox(
  double precision, double precision, double precision, double precision, int
) to authenticated;
