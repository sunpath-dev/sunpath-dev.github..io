-- 0028_handle_new_auth_user_v2.sql
-- Replaces the 0002 auto-create trigger with one that:
--   1. Checks rep_invite for a matching unrevoked, unexpired email → status='active', role from invite
--   2. Checks rep_access_request for an approved email → status='active', role='rep'
--   3. Otherwise inserts with status='pending', role='rep'
--
-- This means invite-holders and pre-approved requesters get immediate access;
-- all others land on the PendingApprovalScreen until an admin promotes them.

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_status       text := 'pending';
  v_role         text := 'rep';
  v_invited_by   uuid;
  v_invite_id    uuid;
  v_email        text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  v_email := lower(trim(new.email));

  -- Check for a valid, unaccepted invite matching this email.
  select i.id, i.role, i.created_by
    into v_invite_id, v_role, v_invited_by
    from public.rep_invite i
   where lower(i.email) = v_email
     and i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if v_invite_id is not null then
    v_status := 'active';
    -- Mark the invite consumed.
    update public.rep_invite
       set accepted_at = now()
     where id = v_invite_id;
  else
    -- Check for an approved access request.
    if exists (
      select 1 from public.rep_access_request
       where lower(email) = v_email
         and status = 'approved'
    ) then
      v_status := 'active';
      v_role   := 'rep';
    end if;
  end if;

  insert into public.rep (auth_user_id, display_name, status, role, invited_by)
  values (new.id, v_display_name, v_status, v_role, v_invited_by)
  on conflict (auth_user_id) do update
    set status     = case
                       when excluded.status = 'active' then 'active'
                       else public.rep.status
                     end,
        role       = case
                       when excluded.status = 'active' then excluded.role
                       else public.rep.role
                     end,
        invited_by = coalesce(excluded.invited_by, public.rep.invited_by);

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
