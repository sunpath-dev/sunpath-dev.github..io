-- Migration 0008 — triggers inbox: per-rep dismissal + view.
--
-- Adds a per-rep dismissal column so the rep can clear an item from the
-- rewarm inbox without affecting other reps. Phase-4-light: triggers
-- aren't routed per-rep yet (notified_rep_id is mostly null), so we treat
-- "any rep can dismiss for everyone" for now and revisit at multi-rep.

alter table public.trigger_event
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by_rep_id uuid references public.rep(id) on delete set null;

create index if not exists idx_trigger_event_open
  on public.trigger_event (fired_at desc)
  where dismissed_at is null;

-- Convenience view: open trigger events with parcel address joined.
create or replace view public.trigger_inbox as
select
  t.id,
  t.parcel_id,
  p.address_line1,
  t.kind,
  t.fired_at,
  t.payload,
  t.notified_rep_id,
  t.created_at
from public.trigger_event t
left join public.parcel p on p.id = t.parcel_id
where t.dismissed_at is null
order by t.fired_at desc;

grant select on public.trigger_inbox to authenticated;
