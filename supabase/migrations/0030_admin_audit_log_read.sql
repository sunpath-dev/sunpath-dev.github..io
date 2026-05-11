-- 0030_admin_audit_log_read.sql
-- Let admins read all audit_log entries (not just their own).
-- Also adds a county-level parcel aggregate view for the admin territory dashboard.

-- Admin can read entire audit log
create policy audit_log_admin_read on public.audit_log
  for select using (app.is_admin());

-- County summary view: aggregate parcel stats per county.
-- Readable by any authenticated user (parcel already has parcel_authed_read).
-- The subquery on score_snapshot is expensive at scale; safe for admin-only use.
create or replace view public.admin_county_summary
with (security_invoker = true)
as
  select
    state_fips,
    county_fips,
    state,
    count(*)::int                                                           as parcel_count,
    sum(case when owner_occupied then 1 else 0 end)::int                   as owner_occupied_count,
    sum(case when has_existing_solar then 1 else 0 end)::int               as solar_count,
    max(source_updated_at)                                                  as last_source_update,
    max(created_at)                                                         as last_ingested_at
  from public.parcel
  group by state_fips, county_fips, state
  order by state, county_fips;

grant select on public.admin_county_summary to authenticated;
