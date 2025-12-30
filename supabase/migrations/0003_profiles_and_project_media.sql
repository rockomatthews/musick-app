create extension if not exists pgcrypto;

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  user_id uuid primary key,
  username text unique,
  display_name text,
  bio text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Projects: allow cover image + basic popularity score hook (optional)
alter table public.projects
add column if not exists cover_image_path text;

alter table public.projects
add column if not exists popularity_score int not null default 0;


