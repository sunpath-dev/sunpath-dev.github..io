-- 0014 — full knock-score recompute joining signals.
--
-- Migration 0004 shipped a parcel-only score (4 of 9 factors). This
-- migration adds the missing 5 — estAnnualKwh, neighborPermits,
-- rateHike, recentlySold, and bumps roof orientation when PVWatts
-- gives us a real production number — by joining property_signal,
-- area_signal, and trigger_event.
--
-- Forward-only. Trigger from 0004 stays for cheap parcel-only updates;
-- this is the heavy nightly recompute.

create or replace function public.compute_parcel_score_full(p public.parcel)
returns table (score int, excluded_reason text, factors jsonb)
language plpgsql stable
as $$
declare
  f_owner int := 0;
  f_kwh int := 0;
  f_orient int := 0;
  f_value int := 0;
  f_year int := 0;
  f_neighbor int := 0;
  f_rate int := 0;
  f_sold int := 0;
  v_kwh numeric;
  v_neighbor_count int;
  v_rate_hike boolean;
  v_recently_sold boolean;
  total int;
begin
  if p.has_existing_solar then
    return query select null::int, 'existing_solar'::text, jsonb_build_object();
    return;
  end if;

  -- 1) Owner-occupied
  f_owner := case
    when p.owner_occupied is true then 25
    when p.owner_occupied is false then 0
    else 12
  end;

  -- 2) Annual kWh production (latest pvwatts signal)
  select (payload->>'ac_annual_kwh')::numeric
    into v_kwh
    from public.property_signal
    where parcel_id = p.id and kind = 'pvwatts'
    order by observed_at desc
    limit 1;

  if v_kwh is null then
    f_kwh := 0;
  elsif v_kwh <= 4000 then
    f_kwh := 0;
  elsif v_kwh >= 14000 then
    f_kwh := 20;
  else
    f_kwh := round(((v_kwh - 4000) / 10000.0) * 20)::int;
  end if;

  -- 3) Roof orientation
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

  -- 4) Value bracket
  f_value := case
    when p.assessed_value_usd is null then 5
    when p.assessed_value_usd < 100000 or p.assessed_value_usd > 1500000 then 0
    when p.assessed_value_usd between 200000 and 700000 then 10
    else 5
  end;

  -- 5) Year built
  f_year := case
    when p.year_built is null then 2
    when p.year_built between 1985 and 2015 then 5
    else 2
  end;

  -- 6) Neighbor permits within 0.25 mi over last 24 months
  -- 0.25 mi ≈ 402.336 meters
  select count(distinct te.id)::int
    into v_neighbor_count
    from public.trigger_event te
    join public.parcel np on np.id = te.parcel_id
    where te.kind = 'neighbor_permit'
      and te.fired_at >= now() - interval '24 months'
      and st_dwithin(np.centroid, p.centroid, 402.336);

  f_neighbor := case
    when v_neighbor_count <= 0 then 0
    when v_neighbor_count = 1 then 5
    when v_neighbor_count = 2 then 10
    else 15
  end;

  -- 7) Rate hike (any rate_hike trigger in the last 12mo whose
  -- area_signal scope covers this parcel — or globally any rate_hike
  -- trigger in the last 12 months as a coarse fallback).
  select exists (
    select 1 from public.trigger_event
    where kind = 'rate_hike'
      and fired_at >= now() - interval '12 months'
  ) into v_rate_hike;
  f_rate := case when v_rate_hike then 5 else 0 end;

  -- 8) Recently sold (sale signal within 18 months)
  select exists (
    select 1 from public.property_signal
    where parcel_id = p.id
      and kind = 'sale'
      and observed_at >= now() - interval '18 months'
  ) into v_recently_sold;
  f_sold := case when v_recently_sold then 5 else 0 end;

  total := f_owner + f_kwh + f_orient + f_value + f_year
         + f_neighbor + f_rate + f_sold;
  total := greatest(0, least(100, total));

  return query select total::int, null::text, jsonb_build_object(
    'ownerOccupied', f_owner,
    'estAnnualKwh', f_kwh,
    'roofOrientation', f_orient,
    'valueBracket', f_value,
    'yearBuilt', f_year,
    'neighborPermits', f_neighbor,
    'rateHike', f_rate,
    'recentlySold', f_sold
  );
end;
$$;

-- Batch recompute. `p_limit` lets the cron stay within edge-function
-- timeouts; call repeatedly with `p_offset` until row count < limit.
create or replace function public.recompute_scores_batch(
  p_limit int default 1000,
  p_offset int default 0
) returns int
language plpgsql
as $$
declare
  v_count int := 0;
  r record;
  cs record;
begin
  for r in
    select * from public.parcel order by id offset p_offset limit p_limit
  loop
    select * into cs from public.compute_parcel_score_full(r);
    insert into public.score_snapshot (parcel_id, score, excluded_reason, factors, computed_at)
    values (r.id, cs.score, cs.excluded_reason, cs.factors, now())
    on conflict (parcel_id) do update
      set score = excluded.score,
          excluded_reason = excluded.excluded_reason,
          factors = excluded.factors,
          computed_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.recompute_scores_batch(int, int) to service_role;
