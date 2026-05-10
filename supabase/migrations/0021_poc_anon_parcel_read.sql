-- 0021_poc_anon_parcel_read.sql
-- POC: parcel data is public-record county assessor data.
-- Allow anon SELECT so the fake POC auth token works.
-- Replace with authenticated-only when real auth lands.

drop policy if exists parcel_authed_read on public.parcel;
create policy parcel_anon_read on public.parcel
  for select using (true);

-- Also allow anon to read score_snapshot (needed by parcels_in_bbox join).
drop policy if exists score_snapshot_authed_read on public.score_snapshot;
create policy score_snapshot_anon_read on public.score_snapshot
  for select using (true);

-- Grant parcels_in_bbox to anon role.
grant execute on function public.parcels_in_bbox(
  double precision, double precision, double precision, double precision, int
) to anon;
