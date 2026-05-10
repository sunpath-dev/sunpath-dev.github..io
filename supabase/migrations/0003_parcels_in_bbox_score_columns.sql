-- Migration 0003 — extend parcels_in_bbox with the columns the client needs
-- to compute knock-score v1 (see packages/shared/src/scoring.ts).
--
-- Forward-only. Drops the old function signature first because the return
-- shape is changing (Postgres won't replace a function whose OUT columns
-- changed).

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
  primary_orientation text
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
    p.primary_orientation
  from public.parcel p
  where st_intersects(
    p.centroid,
    st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography
  )
  limit max_rows;
$$;

grant execute on function public.parcels_in_bbox(
  double precision, double precision, double precision, double precision, int
) to authenticated;
