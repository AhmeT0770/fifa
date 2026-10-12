create table if not exists public.game_rooms (
  room_id text primary key check (room_id ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  game_version text not null check (game_version in ('fifa14', 'fifa15')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null check (status in ('waiting_guest', 'setting_up', 'ready', 'playing', 'finished')),
  room_data jsonb not null,
  revision bigint not null default 1 check (revision > 0)
);

create index if not exists game_rooms_open_idx
  on public.game_rooms (game_version, created_at desc)
  where status = 'waiting_guest';

alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from public, anon, authenticated;
grant all on public.game_rooms to service_role;

create table if not exists public.app_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.app_rate_limits enable row level security;
revoke all on public.app_rate_limits from public, anon, authenticated;
grant all on public.app_rate_limits to service_role;

create or replace function public.check_app_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_request_count integer;
begin
  if p_bucket_key is null or char_length(p_bucket_key) > 160
    or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.app_rate_limits as current_limit (
    bucket_key, window_started_at, request_count, updated_at
  ) values (
    p_bucket_key, v_now, 1, v_now
  )
  on conflict (bucket_key) do update set
    window_started_at = case
      when current_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else current_limit.window_started_at
    end,
    request_count = case
      when current_limit.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else current_limit.request_count + 1
    end,
    updated_at = v_now
  returning app_rate_limits.window_started_at, app_rate_limits.request_count
  into v_window_start, v_request_count;

  if random() < 0.01 then
    delete from public.app_rate_limits
    where ctid in (
      select ctid from public.app_rate_limits
      where updated_at < v_now - interval '1 day'
      limit 500
    );
  end if;

  return query select
    v_request_count <= p_limit,
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
end;
$$;

revoke all on function public.check_app_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_app_rate_limit(text, integer, integer) to service_role;
