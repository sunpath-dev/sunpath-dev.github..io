-- Migration 0005 — rewarm trigger derivation.
--
-- When an area_signal lands (rate hike, weather event, new incentive, etc.)
-- we want to fan out trigger_event rows for parcels in scope so reps see
-- "come back to this lead" prompts. This migration ships the function;
-- the actual cron that calls it is an edge function (see
-- supabase/functions/rewarm-derive).

create or replace function public.derive_rewarm_triggers(area_signal_id uuid)
returns int
language plpgsql
as $$
declare
  sig record;
  inserted int := 0;
begin
  select * into sig from public.area_signal where id = area_signal_id;
  if not found then
    return 0;
  end if;

  -- For every parcel intersecting the signal scope that has at least one
  -- prior dormant lead (stage in 'lost' or last contact > 90d), emit a
  -- trigger_event. Idempotent on (parcel_id, kind, fired_at = signal observed_at).
  with target_parcels as (
    select distinct p.id as parcel_id
    from public.parcel p
    join public.lead l on l.parcel_id = p.id
    where st_intersects(p.centroid, sig.scope)
      and (
        l.stage = 'lost'
        or coalesce(l.next_action_at, l.updated_at) < now() - interval '90 days'
      )
  )
  insert into public.trigger_event (parcel_id, kind, fired_at, payload, notified_rep_id)
  select
    tp.parcel_id,
    sig.kind,
    sig.observed_at,
    jsonb_build_object('source', sig.source, 'area_signal_id', sig.id, 'payload', sig.payload),
    null
  from target_parcels tp
  on conflict do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

grant execute on function public.derive_rewarm_triggers(uuid) to service_role;
