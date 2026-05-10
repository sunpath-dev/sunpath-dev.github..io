-- 0002_rep_autocreate_and_views.sql
-- Convenience: auto-create a `rep` row on first sign-in, plus a parcels-by-bbox
-- RPC for the territory map. POC posture — production hardening deferred.

-- ---------------------------------------------------------------------------
-- Auto-create a rep row on sign-up (Supabase auth → public.rep)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.rep (auth_user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- parcels_in_bbox(min_lon, min_lat, max_lon, max_lat) — territory map fetch
-- ---------------------------------------------------------------------------

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
  has_existing_solar boolean
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
    p.has_existing_solar
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
