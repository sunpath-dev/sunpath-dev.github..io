-- 0025_rep_status_and_role_cleanup.sql
-- Adds rep.status gate, helper functions, and tightens roles to (rep|admin).

-- ---------------------------------------------------------------------------
-- App schema helpers
-- ---------------------------------------------------------------------------

create schema if not exists app;

-- Returns the current authenticated rep's id — only when status='active'.
-- NULL for unauthenticated, pending, or suspended reps.
create or replace function app.current_rep_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select id from public.rep
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;
grant execute on function app.current_rep_id() to authenticated;

-- Returns true only when the current rep is an active admin.
create or replace function app.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.rep
    where auth_user_id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;
grant execute on function app.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- rep.status column
-- ---------------------------------------------------------------------------

alter table public.rep
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'active', 'suspended'));

-- All existing reps are pre-approved; backfill to active.
update public.rep set status = 'active' where status = 'pending';

-- ---------------------------------------------------------------------------
-- Role constraint: drop lead, keep rep|admin
-- ---------------------------------------------------------------------------

-- Promote any existing 'lead' reps to 'admin' before tightening.
update public.rep set role = 'admin' where role = 'lead';
update public.rep_invite set role = 'admin' where role = 'lead';

-- Drop auto-named role check constraints and add named ones.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.rep'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.rep drop constraint if exists %I', r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.rep_invite'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.rep_invite drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.rep
  add constraint rep_role_check check (role in ('rep', 'admin'));
alter table public.rep_invite
  add constraint rep_invite_role_check check (role in ('rep', 'admin'));
