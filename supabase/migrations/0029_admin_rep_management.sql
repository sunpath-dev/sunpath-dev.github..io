-- 0029_admin_rep_management.sql
-- Gives admins the ability to view all reps and manage their status.
-- This is needed for the AdminPanel: pending rep list + approve/suspend.

-- Admins can read all rep rows (to see pending/suspended reps).
create policy rep_admin_select on public.rep
  for select to authenticated
  using (app.is_admin());

-- Admins can update any rep row (to flip status, change role).
create policy rep_admin_update on public.rep
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- Soft-delete helper: admin can set status='suspended' to revoke access.
-- Hard delete is done via service role only (deletes auth.users which cascades).
