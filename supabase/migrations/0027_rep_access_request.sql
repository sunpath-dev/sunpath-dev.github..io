-- 0027_rep_access_request.sql
-- Stores "Request for Access" submissions from the sign-in screen.
-- Anon users can submit; admins can read and approve/reject.
-- The request-access edge function is the only write path from the public.

create table public.rep_access_request (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  display_name text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.rep(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Only one open request per email at a time.
create unique index rep_access_request_pending_email
  on public.rep_access_request (email)
  where status = 'pending';

create index rep_access_request_status_idx
  on public.rep_access_request (status, created_at desc);

alter table public.rep_access_request enable row level security;

-- Anon users cannot read their own submissions (prevents enumeration).
-- All reads and updates go through the edge function / service role.
-- Admins can read and update.
create policy rep_access_request_admin_select on public.rep_access_request
  for select to authenticated
  using (app.is_admin());

create policy rep_access_request_admin_update on public.rep_access_request
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());
