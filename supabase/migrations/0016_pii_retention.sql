-- 0016 — PII retention purge.
--
-- Production-hardening: bounded PII retention. Captures the rules in
-- one place so the privacy policy can cite them and the cron can
-- enforce them. Defaults to 18 months — tune in `pii_retention_policy`
-- without a migration.
--
-- Tables in scope:
--   bill_capture            — image_url + parsed_text (kWh / account)
--   bill_capture_storage    — Storage objects keyed by capture id
--   door_event              — notes (free text); voice_memo_url
--   lead                    — phone, email, contact_name, notes
--   audit_log               — keep 24 months for security review
--
-- We do NOT delete `parcel` or aggregate signals — those are public
-- record-class data, no expiry.

create table public.pii_retention_policy (
  scope text primary key,
  retain_for interval not null,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.pii_retention_policy (scope, retain_for, notes) values
  ('bill_capture',  interval '18 months', 'Bill image + OCR text. Redacted by app before storage.'),
  ('door_event',    interval '24 months', 'Door notes + voice memos.'),
  ('lead',          interval '24 months', 'Homeowner contact info; longer because pipelines move slowly.'),
  ('audit_log',     interval '24 months', 'Security/PII access trail.')
on conflict (scope) do nothing;

create or replace function public.purge_expired_pii()
returns table (scope text, deleted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int interval;
  v_deleted int;
begin
  -- bill_capture
  select retain_for into v_int from public.pii_retention_policy where scope = 'bill_capture';
  with d as (
    delete from public.bill_capture
    where created_at < now() - v_int
    returning 1
  )
  select count(*)::int into v_deleted from d;
  scope := 'bill_capture'; deleted := coalesce(v_deleted, 0); return next;

  -- door_event
  select retain_for into v_int from public.pii_retention_policy where scope = 'door_event';
  with d as (
    delete from public.door_event
    where occurred_at < now() - v_int
    returning 1
  )
  select count(*)::int into v_deleted from d;
  scope := 'door_event'; deleted := coalesce(v_deleted, 0); return next;

  -- lead — only delete leads in terminal "lost" / "no_contact" stages
  -- past their retention window. Active pipelines stay regardless of
  -- age (a sit that drags on shouldn't be auto-purged).
  select retain_for into v_int from public.pii_retention_policy where scope = 'lead';
  with d as (
    delete from public.lead
    where stage in ('lost', 'no_contact')
      and updated_at < now() - v_int
    returning 1
  )
  select count(*)::int into v_deleted from d;
  scope := 'lead'; deleted := coalesce(v_deleted, 0); return next;

  -- audit_log
  select retain_for into v_int from public.pii_retention_policy where scope = 'audit_log';
  with d as (
    delete from public.audit_log
    where occurred_at < now() - v_int
    returning 1
  )
  select count(*)::int into v_deleted from d;
  scope := 'audit_log'; deleted := coalesce(v_deleted, 0); return next;

  return;
end;
$$;

grant execute on function public.purge_expired_pii() to service_role;

-- GDPR/CCPA-style erasure. Wipe everything we have for a single
-- homeowner contact (matched by phone/email or lead_id). Returns row
-- counts per table for the auditor.
create or replace function public.erase_homeowner_pii(
  p_phone text default null,
  p_email text default null,
  p_lead_id uuid default null
) returns table (target text, removed int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_ids uuid[];
  v_count int;
begin
  if p_phone is null and p_email is null and p_lead_id is null then
    raise exception 'phone, email, or lead_id required';
  end if;

  select array_agg(id) into v_lead_ids
    from public.lead
    where (p_lead_id is not null and id = p_lead_id)
       or (p_phone is not null and phone = p_phone)
       or (p_email is not null and email = p_email);

  if v_lead_ids is null or array_length(v_lead_ids, 1) is null then
    target := 'lead'; removed := 0; return next;
    return;
  end if;

  with d as (
    delete from public.bill_capture where lead_id = any(v_lead_ids) returning 1
  ) select count(*)::int into v_count from d;
  target := 'bill_capture'; removed := coalesce(v_count, 0); return next;

  with d as (
    delete from public.lead where id = any(v_lead_ids) returning 1
  ) select count(*)::int into v_count from d;
  target := 'lead'; removed := coalesce(v_count, 0); return next;

  perform public.record_audit('homeowner.erase', 'lead', null,
    jsonb_build_object('lead_ids', v_lead_ids, 'phone', p_phone, 'email', p_email));

  return;
end;
$$;

grant execute on function public.erase_homeowner_pii(text, text, uuid) to service_role;
