-- Allow all authenticated users to read pending + approved stems (playback),
-- while owner remains the only one who can approve/reject/update stems.

alter table public.stems enable row level security;
alter table public.stem_assets enable row level security;

-- Replace stems select policy
drop policy if exists "stems_select_approved_or_owner" on public.stems;
create policy "stems_select_pending_or_approved"
on public.stems for select
to authenticated
using (
  status in ('approved', 'pending')
  or exists (
    select 1 from public.projects p
    where p.id = stems.project_id and p.owner_user_id = auth.uid()
  )
);

-- Replace stem_assets select policy
drop policy if exists "stem_assets_select_via_stem" on public.stem_assets;
create policy "stem_assets_select_via_stem_pending_or_approved"
on public.stem_assets for select
to authenticated
using (
  exists (
    select 1 from public.stems s
    where s.id = stem_assets.stem_id
    and (
      s.status in ('approved', 'pending')
      or exists (
        select 1 from public.projects p
        where p.id = s.project_id and p.owner_user_id = auth.uid()
      )
    )
  )
);


