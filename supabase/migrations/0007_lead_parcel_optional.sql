-- Migration 0007 — public callback support.
--
-- Allow leads to exist without a parcel (homeowner submits the doorcard
-- callback form but the slug doesn't match a parcel in our DB yet, e.g.
-- mailers, pre-ingest counties). Rep can attach a parcel later from the
-- pipeline view.

alter table public.lead alter column parcel_id drop not null;

-- Drop the (parcel_id, rep_id) unique constraint and recreate it as a
-- partial unique index so multiple null-parcel leads can coexist.
alter table public.lead drop constraint if exists lead_parcel_id_rep_id_key;
create unique index if not exists lead_parcel_rep_uq
  on public.lead (parcel_id, rep_id)
  where parcel_id is not null;
