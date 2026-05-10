-- 0018 — Bill-capture storage bucket: private + signed-URL only.
--
-- Production-hardening: bill images contain account numbers and usage
-- data. They must never be publicly readable. This migration:
--
--   1. Creates the `bill_capture` Storage bucket as PRIVATE (no public
--      reads — clients must use signed URLs with short TTLs).
--   2. Restricts INSERT to authenticated reps writing into their own
--      tenant prefix (`<rep_id>/...`).
--   3. Restricts SELECT/UPDATE/DELETE to the owning rep + service_role.
--
-- Idempotent: bucket insert uses ON CONFLICT, policies are dropped and
-- recreated.

-- Create the bucket as private. Supabase allows enabling it later via
-- dashboard but doing it in SQL keeps the contract reproducible.
insert into storage.buckets (id, name, public)
values ('bill_capture', 'bill_capture', false)
on conflict (id) do update set public = false;

-- File-size cap (10 MiB) and MIME allowlist live alongside the bucket
-- in the dashboard; replicating them here so the constraint is in code.
update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'bill_capture';

drop policy if exists "bill_capture_rep_insert" on storage.objects;
drop policy if exists "bill_capture_rep_read"   on storage.objects;
drop policy if exists "bill_capture_rep_update" on storage.objects;
drop policy if exists "bill_capture_rep_delete" on storage.objects;

-- Convention: object name begins with "<auth.uid>/<lead_id>/<file>".
-- We compare the first path segment to auth.uid() so reps never see
-- each other's captures.

create policy "bill_capture_rep_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bill_capture'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "bill_capture_rep_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bill_capture'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "bill_capture_rep_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bill_capture'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'bill_capture'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "bill_capture_rep_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bill_capture'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
