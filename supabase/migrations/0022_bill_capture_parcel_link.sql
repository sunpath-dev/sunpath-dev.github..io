-- Migration 0022 — Add parcel_id to bill_capture.
--
-- Enables the "Capture Bill" workflow where a rep taps a house on the map,
-- opens bill capture pre-linked to that parcel, and the saved data flows back
-- into the property dashboard's financial model.
--
-- parcel_id is nullable so legacy captures without a parcel link still work.

alter table public.bill_capture
  add column if not exists parcel_id uuid references public.parcel(id) on delete set null;

create index if not exists idx_bill_capture_parcel
  on public.bill_capture (parcel_id, created_at desc);
