-- HIDUP DI INDONESIA — database schema
-- The database is the source of truth. Browsers may only READ rows they are allowed to see;
-- every change goes through the game-action server function, which calls apply_game_action().

-- ───────────────────────── tables ─────────────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 16),
  avatar      smallint not null default 0 check (avatar between 0 and 11),
  updated_at  timestamptz not null default now()
);

-- One row per room. `state` is the public game state every member sees.
create table if not exists public.game_rooms (
  code        text primary key check (code ~ '^[A-Z0-9]{5}$'),
  host_id     uuid references auth.users (id) on delete set null,
  status      text not null check (status in ('lobby', 'jobs', 'playing', 'ended', 'closed')),
  version     integer not null default 1,
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Human members of a room. Bots live only inside the game state.
create table if not exists public.game_players (
  room_code   text not null references public.game_rooms (code) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (room_code, user_id)
);
create index if not exists game_players_user_idx on public.game_players (user_id);

-- Server-only state (shuffled card decks). No policies: invisible to every browser.
create table if not exists public.game_private (
  room_code   text primary key references public.game_rooms (code) on delete cascade,
  data        jsonb not null default '{}'::jsonb
);

-- Secret personal goals. A player can read only their own row; bot rows have no user.
create table if not exists public.player_secrets (
  room_code   text not null references public.game_rooms (code) on delete cascade,
  game_id     text not null,
  player_id   text not null,
  user_id     uuid references auth.users (id) on delete cascade,
  goal_key    text not null,
  primary key (room_code, game_id, player_id)
);

-- Every accepted action. (user_id, request_id) is the idempotency key: a retried request is never applied twice.
create table if not exists public.game_actions (
  id            bigint generated always as identity primary key,
  room_code     text not null references public.game_rooms (code) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  request_id    uuid not null,
  action        text not null,
  args          jsonb not null default '[]'::jsonb,
  version_after integer,
  created_at    timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists game_actions_room_idx on public.game_actions (room_code, id);

-- Reference copies of the rules data, for browsing and admin. The engine code is authoritative.
create table if not exists public.card_definitions (
  id        text primary key,
  category  text not null,
  title     text not null,
  description text not null,
  effects   jsonb not null,
  choices   jsonb
);
create table if not exists public.job_definitions (
  id        text primary key,
  name      text not null,
  salary_m  integer not null,
  pros      text[] not null,
  cons      text[] not null,
  data      jsonb not null
);

-- ───────────────────────── access rules ─────────────────────────

-- Security-definer helper so policies can check membership without recursion.
create or replace function public.is_room_member(p_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_players where room_code = p_code and user_id = auth.uid());
$$;
revoke all on function public.is_room_member(text) from public;
grant execute on function public.is_room_member(text) to authenticated;

alter table public.profiles           enable row level security;
alter table public.game_rooms         enable row level security;
alter table public.game_players       enable row level security;
alter table public.game_private       enable row level security;
alter table public.player_secrets     enable row level security;
alter table public.game_actions       enable row level security;
alter table public.card_definitions   enable row level security;
alter table public.job_definitions    enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read room" on public.game_rooms;
create policy "members read room" on public.game_rooms for select to authenticated using (public.is_room_member(code));

drop policy if exists "members read roster" on public.game_players;
create policy "members read roster" on public.game_players for select to authenticated using (public.is_room_member(room_code));

drop policy if exists "read own secret" on public.player_secrets;
create policy "read own secret" on public.player_secrets for select to authenticated using (user_id = auth.uid());

drop policy if exists "read own actions" on public.game_actions;
create policy "read own actions" on public.game_actions for select to authenticated using (user_id = auth.uid());

drop policy if exists "anyone reads cards"   on public.card_definitions;
drop policy if exists "anyone reads jobs" on public.job_definitions;
create policy "anyone reads cards"   on public.card_definitions   for select to anon, authenticated using (true);
create policy "anyone reads jobs" on public.job_definitions for select to anon, authenticated using (true);

-- Belt and braces: browsers never write game tables directly, whatever policies exist.
revoke insert, update, delete, truncate on public.game_rooms, public.game_players, public.game_private,
  public.player_secrets, public.game_actions, public.card_definitions, public.job_definitions from anon, authenticated;
revoke all on public.game_private from anon, authenticated;
revoke all on public.profiles from anon;

-- ───────────────────────── the one write path ─────────────────────────
-- Applies a validated action atomically: records the request (duplicate → unique violation, nothing applied),
-- writes the new state only if nobody changed the room since it was read (version check),
-- and updates membership, private state and secrets in the same transaction.
create or replace function public.apply_game_action(
  p_code      text,
  p_expected  integer,          -- version read before applying; 0 = create a new room
  p_state     jsonb,
  p_private   jsonb,
  p_status    text,
  p_host      uuid,
  p_user      uuid,
  p_request   uuid,
  p_action    text,
  p_args      jsonb,
  p_add       uuid[] default '{}',
  p_remove    uuid[] default '{}',
  p_secrets   jsonb default null -- [{game_id, player_id, user_id|null, goal}] replaces the room's secrets
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new integer;
begin
  if p_expected = 0 then
    insert into public.game_rooms (code, host_id, status, version, state)
    values (p_code, p_host, p_status, 1, p_state);
    v_new := 1;
  else
    update public.game_rooms
       set state = p_state, status = p_status, host_id = p_host, version = version + 1, updated_at = now()
     where code = p_code and version = p_expected
     returning version into v_new;
    if v_new is null then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
  end if;

  insert into public.game_actions (room_code, user_id, request_id, action, args, version_after)
  values (p_code, p_user, p_request, p_action, coalesce(p_args, '[]'::jsonb), v_new);

  insert into public.game_private (room_code, data) values (p_code, coalesce(p_private, '{}'::jsonb))
  on conflict (room_code) do update set data = excluded.data;

  if coalesce(array_length(p_remove, 1), 0) > 0 then
    delete from public.game_players where room_code = p_code and user_id = any (p_remove);
  end if;
  if coalesce(array_length(p_add, 1), 0) > 0 then
    insert into public.game_players (room_code, user_id)
    select p_code, u from unnest(p_add) as u
    on conflict do nothing;
  end if;

  if p_secrets is not null then
    delete from public.player_secrets where room_code = p_code;
    insert into public.player_secrets (room_code, game_id, player_id, user_id, goal_key)
    select p_code, s ->> 'game_id', s ->> 'player_id', nullif(s ->> 'user_id', '')::uuid, s ->> 'goal'
      from jsonb_array_elements(p_secrets) as s;
  end if;

  return v_new;
end;
$$;
revoke all on function public.apply_game_action(text, integer, jsonb, jsonb, text, uuid, uuid, uuid, text, jsonb, uuid[], uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.apply_game_action(text, integer, jsonb, jsonb, text, uuid, uuid, uuid, text, jsonb, uuid[], uuid[], jsonb) to service_role;

-- ───────────────────────── realtime ─────────────────────────
-- Committed room changes are pushed to members (Realtime applies the select policy per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_rooms') then
      alter publication supabase_realtime add table public.game_rooms;
    end if;
  end if;
end $$;
