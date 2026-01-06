-- Sound FX library support

create table if not exists public.sound_effects (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('freesound','elevenlabs','hooksounds','local')),
  source_id text,
  title text not null,
  license text,
  attribution text,
  source_url text,
  duration_sec double precision,
  tags text[] not null default '{}',
  storage_bucket text not null default 'sound-effects',
  storage_path text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists sound_effects_created_by_idx on public.sound_effects(created_by);
create index if not exists sound_effects_created_at_idx on public.sound_effects(created_at desc);

alter table public.sound_effects enable row level security;

-- Readable by authenticated users (site is auth-gated; adjust to anon if you want public browsing)
drop policy if exists sound_effects_select_authenticated on public.sound_effects;
create policy sound_effects_select_authenticated
on public.sound_effects
for select
to authenticated
using (true);

-- Creators can insert their own rows
drop policy if exists sound_effects_insert_own on public.sound_effects;
create policy sound_effects_insert_own
on public.sound_effects
for insert
to authenticated
with check (created_by = auth.uid());

-- Creators can delete their own rows
drop policy if exists sound_effects_delete_own on public.sound_effects;
create policy sound_effects_delete_own
on public.sound_effects
for delete
to authenticated
using (created_by = auth.uid());

-- Optional: attach SFX to projects
create table if not exists public.project_sound_effects (
  project_id uuid not null references public.projects(id) on delete cascade,
  sound_effect_id uuid not null references public.sound_effects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, sound_effect_id)
);

alter table public.project_sound_effects enable row level security;

drop policy if exists project_sound_effects_select_authenticated on public.project_sound_effects;
create policy project_sound_effects_select_authenticated
on public.project_sound_effects
for select
to authenticated
using (true);

-- Only project owner can attach/detach
drop policy if exists project_sound_effects_insert_owner_only on public.project_sound_effects;
create policy project_sound_effects_insert_owner_only
on public.project_sound_effects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_user_id = auth.uid()
  )
);

drop policy if exists project_sound_effects_delete_owner_only on public.project_sound_effects;
create policy project_sound_effects_delete_owner_only
on public.project_sound_effects
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.owner_user_id = auth.uid()
  )
);


