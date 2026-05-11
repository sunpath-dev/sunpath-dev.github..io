-- 0026_rls_standardize.sql
-- Standardize all RLS policies to use app.current_rep_id() so that:
--   (a) rep.id vs auth.uid() confusion is fixed
--   (b) pending/suspended reps are automatically denied data access
--
-- Policies on public.rep itself are intentionally left using
-- auth_user_id = auth.uid() so pending reps can read their own status.

-- ---------------------------------------------------------------------------
-- Shared read tables: require active rep, not just any authenticated user
-- ---------------------------------------------------------------------------

drop policy if exists parcel_authed_read on public.parcel;
create policy parcel_authed_read on public.parcel
  for select to authenticated using (app.current_rep_id() is not null);

drop policy if exists property_signal_authed_read on public.property_signal;
create policy property_signal_authed_read on public.property_signal
  for select to authenticated using (app.current_rep_id() is not null);

drop policy if exists area_signal_authed_read on public.area_signal;
create policy area_signal_authed_read on public.area_signal
  for select to authenticated using (app.current_rep_id() is not null);

drop policy if exists incentive_authed_read on public.incentive;
create policy incentive_authed_read on public.incentive
  for select to authenticated using (app.current_rep_id() is not null);

-- score_snapshot was re-created in 0024; update it here too.
drop policy if exists score_snapshot_authed_read on public.score_snapshot;
create policy score_snapshot_authed_read on public.score_snapshot
  for select to authenticated using (app.current_rep_id() is not null);

-- ---------------------------------------------------------------------------
-- Rep-owned tables: use app.current_rep_id() instead of raw subquery
-- ---------------------------------------------------------------------------

-- door_event
drop policy if exists door_event_rep_scope on public.door_event;
create policy door_event_rep_scope on public.door_event
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- lead
drop policy if exists lead_rep_scope on public.lead;
create policy lead_rep_scope on public.lead
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- bill_capture (0001 correct policy + 0006 wrong policies → replace all)
drop policy if exists bill_capture_rep_scope on public.bill_capture;
drop policy if exists "bill_capture rep insert" on public.bill_capture;
drop policy if exists "bill_capture rep select" on public.bill_capture;
drop policy if exists "bill_capture rep update" on public.bill_capture;
create policy bill_capture_rep_all on public.bill_capture
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- quote
drop policy if exists quote_rep_scope on public.quote;
create policy quote_rep_scope on public.quote
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- trigger_event (notified_rep_id may be null for broadcast events)
drop policy if exists trigger_event_rep_read on public.trigger_event;
create policy trigger_event_rep_read on public.trigger_event
  for select to authenticated
  using (
    notified_rep_id is null
    or notified_rep_id = app.current_rep_id()
  );

-- commission_event
drop policy if exists commission_event_rep_scope on public.commission_event;
create policy commission_event_rep_scope on public.commission_event
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- push_subscription (0011 wrong policies → replace)
drop policy if exists push_sub_owner_select on public.push_subscription;
drop policy if exists push_sub_owner_insert on public.push_subscription;
drop policy if exists push_sub_owner_delete on public.push_subscription;
create policy push_sub_owner_all on public.push_subscription
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- parcel_note (0023 wrong policy → replace)
drop policy if exists parcel_note_rep_all on public.parcel_note;
create policy parcel_note_rep_all on public.parcel_note
  for all to authenticated
  using (rep_id = app.current_rep_id())
  with check (rep_id = app.current_rep_id());

-- rep_invite: inviter must be active admin
drop policy if exists rep_invite_select_own on public.rep_invite;
drop policy if exists rep_invite_insert_own on public.rep_invite;
drop policy if exists rep_invite_update_own on public.rep_invite;

create policy rep_invite_select_own on public.rep_invite
  for select to authenticated
  using (created_by = app.current_rep_id());

create policy rep_invite_insert_own on public.rep_invite
  for insert to authenticated
  with check (created_by = app.current_rep_id() and app.is_admin());

create policy rep_invite_update_own on public.rep_invite
  for update to authenticated
  using (created_by = app.current_rep_id() and app.is_admin());
