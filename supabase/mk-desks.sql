-- MK VISION desks: accounts + roles, shared setup (with history) and prompter scripts (with versions).
-- Run ONCE in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.

-- ------------------------------------------------------------------ accounts and roles
create table if not exists public.mk_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'prompter' check (role in ('director', 'graphics', 'sound', 'prompter')),
  created_at timestamptz not null default now()
);

-- Every new account starts with the least access (prompter). The Director promotes people in Settings -> Crew.
create or replace function public.mk_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mk_profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists mk_on_auth_user on auth.users;
create trigger mk_on_auth_user after insert on auth.users
  for each row execute function public.mk_handle_new_user();

create or replace function public.mk_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.mk_profiles where id = auth.uid()
$$;

-- Which shared-setup keys each role may change (same rule as the app).
create or replace function public.mk_can_write_setting(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.mk_role()
    when 'director' then true
    when 'graphics' then k in ('graphics', 'graphicsScene', 'tags')
    when 'sound' then k in ('hiddenAudio', 'limiter', 'audioFollowVideo')
    else false
  end
$$;

alter table public.mk_profiles enable row level security;
drop policy if exists mk_profiles_read on public.mk_profiles;
create policy mk_profiles_read on public.mk_profiles for select to authenticated
  using (id = auth.uid() or public.mk_role() = 'director');
drop policy if exists mk_profiles_director_update on public.mk_profiles;
create policy mk_profiles_director_update on public.mk_profiles for update to authenticated
  using (public.mk_role() = 'director') with check (public.mk_role() = 'director');

-- ------------------------------------------------------------------ shared setup (+ history)
create table if not exists public.mk_settings (
  key text primary key,
  value jsonb not null,
  rev bigint not null default 1,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  value jsonb not null,
  rev bigint,
  updated_by uuid,
  saved_at timestamptz not null default now()
);
create index if not exists mk_settings_history_key on public.mk_settings_history (key, saved_at desc);

create or replace function public.mk_settings_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mk_settings_history (key, value, rev, updated_by) values (new.key, new.value, new.rev, new.updated_by);
  delete from public.mk_settings_history
   where key = new.key
     and id not in (select id from public.mk_settings_history where key = new.key order by saved_at desc, id desc limit 20);
  return new;
end $$;
drop trigger if exists mk_settings_log on public.mk_settings;
create trigger mk_settings_log after insert or update on public.mk_settings
  for each row execute function public.mk_settings_log();

alter table public.mk_settings enable row level security;
alter table public.mk_settings_history enable row level security;
drop policy if exists mk_settings_read on public.mk_settings;
create policy mk_settings_read on public.mk_settings for select to authenticated using (public.mk_role() is not null);
drop policy if exists mk_settings_insert on public.mk_settings;
create policy mk_settings_insert on public.mk_settings for insert to authenticated
  with check (public.mk_can_write_setting(key));
drop policy if exists mk_settings_update on public.mk_settings;
create policy mk_settings_update on public.mk_settings for update to authenticated
  using (public.mk_can_write_setting(key)) with check (public.mk_can_write_setting(key));
drop policy if exists mk_settings_history_read on public.mk_settings_history;
create policy mk_settings_history_read on public.mk_settings_history for select to authenticated
  using (public.mk_role() = 'director');

-- ------------------------------------------------------------------ prompter scripts (+ last 10 versions)
create table if not exists public.mk_scripts (
  id text primary key,
  name text not null,
  text text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.mk_script_versions (
  id bigint generated always as identity primary key,
  script_id text not null references public.mk_scripts (id) on delete cascade,
  text text not null,
  saved_at timestamptz not null default now(),
  saved_by uuid
);
create index if not exists mk_script_versions_script on public.mk_script_versions (script_id, saved_at desc);

create or replace function public.mk_scripts_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.text is distinct from new.text and btrim(old.text) <> '' then
    insert into public.mk_script_versions (script_id, text, saved_at, saved_by) values (old.id, old.text, old.updated_at, old.updated_by);
    delete from public.mk_script_versions
     where script_id = old.id
       and id not in (select id from public.mk_script_versions where script_id = old.id order by saved_at desc, id desc limit 10);
  end if;
  return new;
end $$;
drop trigger if exists mk_scripts_version on public.mk_scripts;
create trigger mk_scripts_version before update on public.mk_scripts
  for each row execute function public.mk_scripts_version();

alter table public.mk_scripts enable row level security;
alter table public.mk_script_versions enable row level security;
drop policy if exists mk_scripts_all on public.mk_scripts;
create policy mk_scripts_all on public.mk_scripts for all to authenticated
  using (public.mk_role() in ('director', 'prompter')) with check (public.mk_role() in ('director', 'prompter'));
drop policy if exists mk_script_versions_read on public.mk_script_versions;
create policy mk_script_versions_read on public.mk_script_versions for select to authenticated
  using (public.mk_role() in ('director', 'prompter'));

-- ------------------------------------------------------------------ first Director
-- 1) Open the app and create your account (Create account on the login page).
-- 2) Put YOUR email below and run this one line. After that you promote everyone else in Settings -> Crew.
-- update public.mk_profiles set role = 'director' where email = 'you@example.com';
