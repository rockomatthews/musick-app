-- Per-track settings + popularity tracking for clips

create extension if not exists pgcrypto;

do $$
begin
  create type public.track_input_mode as enum ('audio', 'midi', 'virtual_synth', 'virtual_drums');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.track_record_mode as enum ('dry', 'wet');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.stem_tracks (
  project_id uuid not null references public.projects(id) on delete cascade,
  stem_type public.stem_type not null,
  input_mode public.track_input_mode not null default 'audio',
  record_mode public.track_record_mode not null default 'dry',
  fx_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, stem_type)
);

alter table public.stem_tracks enable row level security;

drop policy if exists "stem_tracks_select_authenticated" on public.stem_tracks;
create policy "stem_tracks_select_authenticated"
on public.stem_tracks for select
to authenticated
using (true);

drop policy if exists "stem_tracks_insert_owner_only" on public.stem_tracks;
create policy "stem_tracks_insert_owner_only"
on public.stem_tracks for insert
to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = stem_tracks.project_id and p.owner_user_id = auth.uid()
  )
);

drop policy if exists "stem_tracks_update_owner_only" on public.stem_tracks;
create policy "stem_tracks_update_owner_only"
on public.stem_tracks for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = stem_tracks.project_id and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = stem_tracks.project_id and p.owner_user_id = auth.uid()
  )
);

-- Popularity: default selection when not locked uses most-played
alter table public.stems
add column if not exists play_count bigint not null default 0;

-- Safe increment via RPC (clients shouldn't need UPDATE on stems)
create or replace function public.increment_stem_play_count(stem_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.stems
  set play_count = play_count + 1
  where id = stem_id;
$$;

revoke all on function public.increment_stem_play_count(uuid) from public;
grant execute on function public.increment_stem_play_count(uuid) to authenticated;


