-- Migration 0011 — Web Push subscriptions.
--
-- Stores rep browsers' Web Push subscriptions so we can deliver follow-up
-- reminders and the daily rewarm digest. One rep may have multiple
-- subscriptions (phone + truck tablet), so the unique key is on endpoint.

create table if not exists public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.rep(id) on delete cascade,
  endpoint text not null unique,
  -- Browser-supplied keys for AES-GCM payload encryption.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_subscription_rep on public.push_subscription (rep_id);

alter table public.push_subscription enable row level security;

-- A rep manages only their own subscriptions; service role bypasses RLS.
create policy push_sub_owner_select on public.push_subscription
  for select to authenticated using (rep_id = auth.uid());
create policy push_sub_owner_insert on public.push_subscription
  for insert to authenticated with check (rep_id = auth.uid());
create policy push_sub_owner_delete on public.push_subscription
  for delete to authenticated using (rep_id = auth.uid());
