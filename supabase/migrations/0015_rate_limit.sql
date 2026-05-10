-- 0015 — rate-limit primitives for public-facing edge functions.
--
-- Used by `callback-submit` (public form behind doorcard short URLs)
-- and other endpoints reachable without auth. Rolling sliding-window
-- bucket per (key, scope), implemented as a counter + first-seen
-- timestamp. Sufficient for "no more than N hits per window from this
-- key" without pulling in Redis.
--
-- Window resets implicitly when window_started_at is older than the
-- window length passed to `rate_limit_check()`.

create table public.rate_limit_bucket (
  scope text not null,
  bucket_key text not null,
  count int not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (scope, bucket_key)
);
create index idx_rate_limit_window on public.rate_limit_bucket (window_started_at);

-- Returns true if the request is allowed (under limit), false if
-- rate-limited. Increments the counter on success.
--
-- Usage from an edge fn:
--   select public.rate_limit_check('callback_submit', '203.0.113.42', 10, '1 hour');
create or replace function public.rate_limit_check(
  p_scope text,
  p_key text,
  p_limit int,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_started timestamptz;
  v_now timestamptz := now();
begin
  insert into public.rate_limit_bucket (scope, bucket_key, count, window_started_at)
  values (p_scope, p_key, 0, v_now)
  on conflict (scope, bucket_key) do nothing;

  select count, window_started_at
    into v_count, v_started
    from public.rate_limit_bucket
    where scope = p_scope and bucket_key = p_key
    for update;

  if v_now - v_started > p_window then
    -- Window expired — reset.
    update public.rate_limit_bucket
      set count = 1, window_started_at = v_now
      where scope = p_scope and bucket_key = p_key;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update public.rate_limit_bucket
    set count = count + 1
    where scope = p_scope and bucket_key = p_key;
  return true;
end;
$$;

grant execute on function public.rate_limit_check(text, text, int, interval) to service_role;

-- Periodic GC for expired buckets — call from cron monthly.
create or replace function public.rate_limit_gc(p_max_age interval default '7 days')
returns int
language sql
as $$
  with deleted as (
    delete from public.rate_limit_bucket
    where window_started_at < now() - p_max_age
    returning 1
  )
  select count(*)::int from deleted;
$$;
grant execute on function public.rate_limit_gc(interval) to service_role;

alter table public.rate_limit_bucket enable row level security;
-- No client policies — service role only.
