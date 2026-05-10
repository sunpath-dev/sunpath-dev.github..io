-- parcel_note: field notes attached to a parcel, written by a rep.
-- Supports voice-to-text (body stored as plain text), photo URLs (future).
create table if not exists public.parcel_note (
  id            uuid primary key default gen_random_uuid(),
  rep_id        uuid not null references auth.users(id) on delete cascade,
  parcel_id     uuid not null references public.parcel(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_parcel_note_parcel
  on public.parcel_note (parcel_id, created_at desc);

create index if not exists idx_parcel_note_rep
  on public.parcel_note (rep_id, created_at desc);

-- RLS: reps can only read/write their own notes.
alter table public.parcel_note enable row level security;

create policy "rep owns note" on public.parcel_note
  for all using (rep_id = auth.uid())
  with check (rep_id = auth.uid());
