-- 0017 — GDPR/CCPA homeowner data export.
--
-- Production-hardening: companion to `erase_homeowner_pii()` shipped in
-- 0016. Returns a JSON bundle of every PII-bearing row we hold for a
-- given homeowner, identified by phone, email, or lead_id. Service-role
-- only; the matching edge function `homeowner-export/` exposes it via
-- a signed admin token.
--
-- Tables exported:
--   lead          — name / phone / email / parcel link / notes
--   bill_capture  — uploaded utility bills tied to those leads
--   door_event    — knocks recorded at the parcel(s) attached to those
--                   leads (rep-facing only; redacted of voice/photo URLs
--                   that may exceed the export contract — those are
--                   referenced by id, the auditor can request artifacts
--                   separately).
--
-- The function records its own invocation in `audit_log` so the
-- subject-access-request paper trail is visible alongside any later
-- erasure.

create or replace function public.export_homeowner_pii(
  p_phone text default null,
  p_email text default null,
  p_lead_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_ids uuid[];
  v_parcel_ids uuid[];
  v_leads jsonb;
  v_bills jsonb;
  v_doors jsonb;
begin
  if p_phone is null and p_email is null and p_lead_id is null then
    raise exception 'phone, email, or lead_id required';
  end if;

  select array_agg(id), array_agg(parcel_id)
    into v_lead_ids, v_parcel_ids
    from public.lead
    where (p_lead_id is not null and id = p_lead_id)
       or (p_phone is not null and phone = p_phone)
       or (p_email is not null and email = p_email);

  if v_lead_ids is null or array_length(v_lead_ids, 1) is null then
    return jsonb_build_object(
      'requested_at', now(),
      'match', jsonb_build_object('phone', p_phone, 'email', p_email, 'lead_id', p_lead_id),
      'lead', '[]'::jsonb,
      'bill_capture', '[]'::jsonb,
      'door_event', '[]'::jsonb
    );
  end if;

  -- Strip parcel_ids of nulls before the door_event lookup.
  v_parcel_ids := array(select unnest(v_parcel_ids) where unnest is not null);

  select coalesce(jsonb_agg(to_jsonb(l) - 'created_by'), '[]'::jsonb)
    into v_leads
    from public.lead l where l.id = any(v_lead_ids);

  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
    into v_bills
    from public.bill_capture b where b.lead_id = any(v_lead_ids);

  if v_parcel_ids is not null and array_length(v_parcel_ids, 1) > 0 then
    -- Strip rep-only fields and large blobs; leave id refs.
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'parcel_id', d.parcel_id,
        'disposition', d.disposition,
        'occurred_at', d.occurred_at,
        'lat', d.lat,
        'lng', d.lng,
        'has_photo', d.photo_url is not null,
        'has_voice', d.voice_memo_url is not null,
        'notes', d.notes
      )
    ), '[]'::jsonb)
      into v_doors
      from public.door_event d
      where d.parcel_id = any(v_parcel_ids);
  else
    v_doors := '[]'::jsonb;
  end if;

  perform public.record_audit('homeowner.export', 'lead', null,
    jsonb_build_object(
      'lead_ids', v_lead_ids,
      'phone', p_phone,
      'email', p_email
    ));

  return jsonb_build_object(
    'requested_at', now(),
    'match', jsonb_build_object('phone', p_phone, 'email', p_email, 'lead_id', p_lead_id),
    'lead', v_leads,
    'bill_capture', v_bills,
    'door_event', v_doors
  );
end;
$$;

grant execute on function public.export_homeowner_pii(text, text, uuid) to service_role;
