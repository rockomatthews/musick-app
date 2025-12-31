-- BPM + per-column duration + stem locking

create extension if not exists pgcrypto;

alter table public.projects
add column if not exists bpm int not null default 120;

create table if not exists public.project_columns (
  project_id uuid not null references public.projects(id) on delete cascade,
  column_index int not null,
  duration_sec int not null default 8,
  created_at timestamptz not null default now(),
  primary key (project_id, column_index)
);

alter table public.project_columns enable row level security;

drop policy if exists "project_columns_select_authenticated" on public.project_columns;
create policy "project_columns_select_authenticated"
on public.project_columns for select
to authenticated
using (true);

drop policy if exists "project_columns_insert_owner_only" on public.project_columns;
create policy "project_columns_insert_owner_only"
on public.project_columns for insert
to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_columns.project_id and p.owner_user_id = auth.uid()
  )
);

drop policy if exists "project_columns_update_owner_only" on public.project_columns;
create policy "project_columns_update_owner_only"
on public.project_columns for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_columns.project_id and p.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_columns.project_id and p.owner_user_id = auth.uid()
  )
);

-- Locking: owner can mark exactly one stem per (project_id, stem_type, column_index) as locked.
alter table public.stems
add column if not exists locked boolean not null default false;

create unique index if not exists stems_one_locked_per_cell
on public.stems(project_id, stem_type, column_index)
where locked = true;

-- RLS: allow authenticated users to read all stems (so everyone can listen to all submissions).
drop policy if exists "stems_select_pending_or_approved" on public.stems;
drop policy if exists "stems_select_approved_or_owner" on public.stems;
create policy "stems_select_all_authenticated"
on public.stems for select
to authenticated
using (true);

drop policy if exists "stem_assets_select_via_stem_pending_or_approved" on public.stem_assets;
drop policy if exists "stem_assets_select_via_stem" on public.stem_assets;
create policy "stem_assets_select_via_stem_all_authenticated"
on public.stem_assets for select
to authenticated
using (
  exists (
    select 1 from public.stems s
    where s.id = stem_assets.stem_id
  )
);


