-- 0012_rep_invite — multi-rep invite flow (Phase 5.4)
--
-- A rep with an existing account creates an invite (token, email, role).
-- The invitee clicks the magic-link in the email, signs in, and on first
-- load the app POSTs to /functions/v1/invite-accept which consumes the
-- token and creates their `public.rep` row.
--
-- Invites expire after 7 days. RLS limits visibility to the inviter and
-- service-role; the accept path runs in the edge function with the
-- service role key.

create extension if not exists "citext";

create table public.rep_invite (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email citext not null,
  role text not null default 'rep' check (role in ('rep', 'lead', 'admin')),
  display_name text,
  created_by uuid not null references public.rep(id) on delete cascade,
  accepted_by uuid references public.rep(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index rep_invite_email_idx on public.rep_invite(lower(email));
create index rep_invite_pending_idx on public.rep_invite(expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.rep add column if not exists role text not null default 'rep'
  check (role in ('rep', 'lead', 'admin'));
alter table public.rep add column if not exists invited_by uuid
  references public.rep(id) on delete set null;

alter table public.rep_invite enable row level security;

-- Inviter can see/revoke their own invites; service role bypasses.
create policy rep_invite_select_own on public.rep_invite
  for select using (
    exists (
      select 1 from public.rep r
      where r.auth_user_id = auth.uid() and r.id = rep_invite.created_by
    )
  );
create policy rep_invite_insert_own on public.rep_invite
  for insert with check (
    exists (
      select 1 from public.rep r
      where r.auth_user_id = auth.uid() and r.id = rep_invite.created_by
    )
  );
create policy rep_invite_update_own on public.rep_invite
  for update using (
    exists (
      select 1 from public.rep r
      where r.auth_user_id = auth.uid() and r.id = rep_invite.created_by
    )
  );
