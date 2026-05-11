-- 0031: parcel_by_id RPC + handle_new_auth_user trigger fix
--
-- parcel_by_id: single-parcel lookup that extracts lat/lon from the centroid
-- geography column (the parcel table has no latitude/longitude columns) and
-- aliases roof_area_sqft → sqft, last_sale_amount_usd → last_sale_price_usd
-- so the client types match. Granted to anon for POC mode.

create or replace function public.parcel_by_id(p_id uuid)
returns table (
  id                  uuid,
  external_id         text,
  address_line1       text,
  city                text,
  state               char(2),
  postal_code         text,
  lon                 double precision,
  lat                 double precision,
  has_existing_solar  boolean,
  owner_occupied      boolean,
  assessed_value_usd  numeric,
  year_built          int,
  sqft                numeric,
  primary_orientation text,
  last_sale_date      date,
  last_sale_price_usd numeric,
  score               int,
  excluded_reason     text
)
language sql stable security invoker
as $$
  select
    p.id,
    p.external_id,
    p.address_line1,
    p.city,
    p.state,
    p.postal_code,
    st_x(p.centroid::geometry)      as lon,
    st_y(p.centroid::geometry)      as lat,
    p.has_existing_solar,
    p.owner_occupied,
    p.assessed_value_usd,
    p.year_built,
    p.roof_area_sqft                as sqft,
    p.primary_orientation,
    p.last_sale_date,
    p.last_sale_amount_usd          as last_sale_price_usd,
    s.score,
    s.excluded_reason
  from public.parcel p
  left join public.score_snapshot s on s.parcel_id = p.id
  where p.id = p_id
$$;

grant execute on function public.parcel_by_id(uuid) to authenticated, anon;

-- Trigger fix: handle_new_auth_user was using SELECT INTO which overwrote
-- v_role to NULL when no invite matched. Fixed by using a separate variable
-- for the invite role. This was already applied live via management API;
-- this migration locks it into the tracked history.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name  text;
  v_status        text := 'pending';
  v_role          text := 'rep';
  v_invited_by    uuid;
  v_invite_id     uuid;
  v_invite_role   text;
  v_email         text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  v_email := lower(trim(new.email));

  select i.id, i.role, i.created_by
    into v_invite_id, v_invite_role, v_invited_by
  from public.rep_invite i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.revoked_at  is null
    and i.expires_at  > now()
  order by i.created_at desc
  limit 1;

  if v_invite_id is not null then
    v_status := 'active';
    v_role   := coalesce(v_invite_role, 'rep');
    update public.rep_invite set accepted_at = now() where id = v_invite_id;
  else
    if exists (
      select 1 from public.rep_access_request
      where lower(email) = v_email and status = 'approved'
    ) then
      v_status := 'active';
      v_role   := 'rep';
    end if;
  end if;

  insert into public.rep (auth_user_id, display_name, status, role, invited_by)
  values (new.id, v_display_name, v_status, v_role, v_invited_by)
  on conflict (auth_user_id) do update set
    status     = case when excluded.status = 'active' then 'active' else public.rep.status end,
    role       = case when excluded.status = 'active' then excluded.role else public.rep.role end,
    invited_by = coalesce(excluded.invited_by, public.rep.invited_by);

  return new;
end;
$$;
