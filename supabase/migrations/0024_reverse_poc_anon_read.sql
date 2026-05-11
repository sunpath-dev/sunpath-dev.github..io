-- 0024_reverse_poc_anon_read.sql
-- Reverse the POC anon-read escape hatch from 0021.
-- Real OAuth is now in place; parcel data requires an authenticated, active rep.

drop policy if exists parcel_anon_read on public.parcel;
drop policy if exists score_snapshot_anon_read on public.score_snapshot;

-- Restore the authenticated-only policies that 0021 dropped.
create policy parcel_authed_read on public.parcel
  for select to authenticated using (true);

create policy score_snapshot_authed_read on public.score_snapshot
  for select to authenticated using (true);

-- Revoke anon execute on parcels_in_bbox.
revoke execute on function public.parcels_in_bbox(
  double precision, double precision, double precision, double precision, int
) from anon;
