-- Core tables for Music-Land

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  create type public.stem_type as enum ('vocals', 'guitar_synth', 'bass', 'drums');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.stem_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.asset_kind as enum ('audio', 'midi');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.stems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stem_type public.stem_type not null,
  column_index int not null default 0,
  status public.stem_status not null default 'pending',
  created_by uuid not null,
  approved_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.stem_assets (
  id uuid primary key default gen_random_uuid(),
  stem_id uuid not null references public.stems(id) on delete cascade,
  kind public.asset_kind not null,
  storage_path text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.projects enable row level security;
alter table public.stems enable row level security;
alter table public.stem_assets enable row level security;

-- Projects
drop policy if exists "projects_select_public_or_owner" on public.projects;
create policy "projects_select_public_or_owner"
on public.projects for select
to authenticated
using (is_public = true or owner_user_id = auth.uid());

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
on public.projects for insert
to authenticated
with check (owner_user_id = auth.uid());

-- Stems: anyone authenticated can read approved stems; owners can read all stems in their project.
drop policy if exists "stems_select_approved_or_owner" on public.stems;
create policy "stems_select_approved_or_owner"
on public.stems for select
to authenticated
using (
  status = 'approved'
  or exists (
    select 1 from public.projects p
    where p.id = stems.project_id and p.owner_user_id = auth.uid()
  )
);

-- Stems: any authenticated user can submit pending stems (status must be pending at insert time).
drop policy if exists "stems_insert_pending" on public.stems;
create policy "stems_insert_pending"
on public.stems for insert
to authenticated
with check (
  status = 'pending'
  and created_by = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = stems.project_id
    and (p.is_public = true or p.owner_user_id = auth.uid())
  )
);

-- Stems: only project owner can approve/reject (or update approval fields).
drop policy if exists "stems_update_owner_only" on public.stems;
create policy "stems_update_owner_only"
on public.stems for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = stems.project_id and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = stems.project_id and p.owner_user_id = auth.uid()
  )
);

-- Stem assets follow stem visibility: readable if stem readable.
drop policy if exists "stem_assets_select_via_stem" on public.stem_assets;
create policy "stem_assets_select_via_stem"
on public.stem_assets for select
to authenticated
using (
  exists (
    select 1 from public.stems s
    where s.id = stem_assets.stem_id
    and (
      s.status = 'approved'
      or exists (
        select 1 from public.projects p
        where p.id = s.project_id and p.owner_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "stem_assets_insert_creator_only" on public.stem_assets;
create policy "stem_assets_insert_creator_only"
on public.stem_assets for insert
to authenticated
with check (
  exists (
    select 1 from public.stems s
    where s.id = stem_assets.stem_id and s.created_by = auth.uid()
  )
);


