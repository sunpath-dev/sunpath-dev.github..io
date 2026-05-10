-- 0013_audit_log — append-only audit trail of PII reads/writes.
--
-- Production-hardening: every read/write of PII captured with rep_id +
-- timestamp + (best-effort) IP. Filled by the application layer via
-- the `record_audit` RPC; tables that contain PII (lead, bill_capture,
-- door_event with notes) should call this on read and on write.
--
-- We intentionally keep the schema minimal. Detailed event payloads
-- live in `details jsonb` so we can add new event kinds without a
-- migration. The table is RLS-restricted to service-role-only writes
-- and rep-self reads.

create table public.audit_log (
  id bigserial primary key,
  rep_id uuid references public.rep(id) on delete set null,
  auth_user_id uuid,
  -- e.g. 'lead.read', 'bill_capture.write', 'lead.export'
  event text not null,
  -- table.row reference, when applicable
  target_table text,
  target_id uuid,
  ip_addr inet,
  user_agent text,
  details jsonb,
  occurred_at timestamptz not null default now()
);
create index idx_audit_log_rep on public.audit_log (rep_id, occurred_at desc);
create index idx_audit_log_target on public.audit_log (target_table, target_id);

alter table public.audit_log enable row level security;

-- Reps can read their own audit entries; service role bypasses.
create policy audit_log_read_own on public.audit_log
  for select using (
    exists (
      select 1 from public.rep r
      where r.auth_user_id = auth.uid() and r.id = audit_log.rep_id
    )
  );

-- No client-side inserts. The `record_audit` SECURITY DEFINER function
-- below is the only sanctioned write path.
create or replace function public.record_audit(
  p_event text,
  p_target_table text default null,
  p_target_id uuid default null,
  p_details jsonb default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep_id uuid;
  v_auth uuid := auth.uid();
  v_id bigint;
begin
  if v_auth is not null then
    select r.id into v_rep_id from public.rep r where r.auth_user_id = v_auth limit 1;
  end if;
  insert into public.audit_log (rep_id, auth_user_id, event, target_table, target_id, details)
  values (v_rep_id, v_auth, p_event, p_target_table, p_target_id, p_details)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.record_audit(text, text, uuid, jsonb) to authenticated;
