-- Migration 0010 — parcel sale tracking columns.
--
-- HOA tables already exist as `hoa_zone` from migration 0006 along with
-- the `hoa_for_parcel(uuid)` lookup function (returns zone_id, name,
-- rule_color, notes). This migration adds the sale-tracking columns the
-- property-sale monitor diffs against.
--
-- Note: an earlier draft of this migration also created a redundant
-- `public.hoa` table and tried to redefine hoa_for_parcel. Those were
-- removed before any deployment touched them.

alter table public.parcel
  add column if not exists last_sale_date date,
  add column if not exists last_sale_amount_usd numeric;
