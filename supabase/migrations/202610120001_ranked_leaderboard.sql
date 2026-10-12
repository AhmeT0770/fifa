create table if not exists public.ranked_profiles (
  profile_id uuid not null,
  game_version text not null check (game_version in ('fifa14', 'fifa15')),
  display_name text not null check (char_length(display_name) between 1 and 32),
  rating integer not null default 1000,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  matches integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, game_version)
);

create table if not exists public.ranked_matches (
  room_id text primary key,
  game_version text not null check (game_version in ('fifa14', 'fifa15')),
  home_profile_id uuid not null,
  away_profile_id uuid not null,
  home_score integer not null,
  away_score integer not null,
  home_rating_change integer not null,
  away_rating_change integer not null,
  created_at timestamptz not null default now(),
  check (home_profile_id <> away_profile_id)
);

alter table public.ranked_profiles enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on public.ranked_profiles, public.ranked_matches from anon, authenticated;
grant all on public.ranked_profiles, public.ranked_matches to service_role;

create or replace function public.submit_ranked_result(
  p_room_id text,
  p_game_version text,
  p_home_profile_id uuid,
  p_home_name text,
  p_away_profile_id uuid,
  p_away_name text,
  p_home_score integer,
  p_away_score integer,
  p_home_outcome numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home_rating integer;
  v_away_rating integer;
  v_home_expected numeric;
  v_home_change integer;
  v_away_change integer;
  v_existing public.ranked_matches%rowtype;
begin
  if p_game_version not in ('fifa14', 'fifa15') then
    raise exception 'Invalid game version';
  end if;
  if p_home_profile_id = p_away_profile_id then
    raise exception 'Ranked players must have different profiles';
  end if;
  if p_home_outcome not in (0, 0.5, 1) then
    raise exception 'Invalid match outcome';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  perform pg_advisory_xact_lock(hashtextextended(least(p_home_profile_id::text, p_away_profile_id::text), 1));
  perform pg_advisory_xact_lock(hashtextextended(greatest(p_home_profile_id::text, p_away_profile_id::text), 1));
  select * into v_existing from public.ranked_matches where room_id = p_room_id;
  if found then
    select rating into v_home_rating from public.ranked_profiles
      where profile_id = v_existing.home_profile_id and game_version = v_existing.game_version;
    select rating into v_away_rating from public.ranked_profiles
      where profile_id = v_existing.away_profile_id and game_version = v_existing.game_version;
    return jsonb_build_object(
      'alreadyRecorded', true,
      'homeRating', v_home_rating,
      'awayRating', v_away_rating,
      'homeChange', v_existing.home_rating_change,
      'awayChange', v_existing.away_rating_change
    );
  end if;

  insert into public.ranked_profiles (profile_id, game_version, display_name)
  values (p_home_profile_id, p_game_version, left(trim(p_home_name), 32))
  on conflict (profile_id, game_version) do update
    set display_name = excluded.display_name, updated_at = now();
  insert into public.ranked_profiles (profile_id, game_version, display_name)
  values (p_away_profile_id, p_game_version, left(trim(p_away_name), 32))
  on conflict (profile_id, game_version) do update
    set display_name = excluded.display_name, updated_at = now();

  select rating into v_home_rating from public.ranked_profiles
    where profile_id = p_home_profile_id and game_version = p_game_version for update;
  select rating into v_away_rating from public.ranked_profiles
    where profile_id = p_away_profile_id and game_version = p_game_version for update;

  v_home_expected := 1 / (1 + power(10::numeric, (v_away_rating - v_home_rating)::numeric / 400));
  v_home_change := round(32 * (p_home_outcome - v_home_expected));
  v_away_change := -v_home_change;

  update public.ranked_profiles set
    rating = rating + v_home_change,
    wins = wins + case when p_home_outcome = 1 then 1 else 0 end,
    draws = draws + case when p_home_outcome = 0.5 then 1 else 0 end,
    losses = losses + case when p_home_outcome = 0 then 1 else 0 end,
    matches = matches + 1,
    updated_at = now()
  where profile_id = p_home_profile_id and game_version = p_game_version;

  update public.ranked_profiles set
    rating = rating + v_away_change,
    wins = wins + case when p_home_outcome = 0 then 1 else 0 end,
    draws = draws + case when p_home_outcome = 0.5 then 1 else 0 end,
    losses = losses + case when p_home_outcome = 1 then 1 else 0 end,
    matches = matches + 1,
    updated_at = now()
  where profile_id = p_away_profile_id and game_version = p_game_version;

  insert into public.ranked_matches (
    room_id, game_version, home_profile_id, away_profile_id, home_score, away_score,
    home_rating_change, away_rating_change
  ) values (
    p_room_id, p_game_version, p_home_profile_id, p_away_profile_id, p_home_score, p_away_score,
    v_home_change, v_away_change
  );

  return jsonb_build_object(
    'alreadyRecorded', false,
    'homeRating', v_home_rating + v_home_change,
    'awayRating', v_away_rating + v_away_change,
    'homeChange', v_home_change,
    'awayChange', v_away_change
  );
end;
$$;

revoke all on function public.submit_ranked_result(text, text, uuid, text, uuid, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.submit_ranked_result(text, text, uuid, text, uuid, text, integer, integer, numeric) to service_role;
