-- Allow deleting stems:
-- - creators can delete their own stems if not locked
-- - project owners can delete any stems in their projects (needed for deleting sections)

alter table public.stems enable row level security;

drop policy if exists "stems_delete_creator_unlocked" on public.stems;
create policy "stems_delete_creator_unlocked"
on public.stems
for delete
to authenticated
using (
  created_by = auth.uid()
  and locked = false
);

drop policy if exists "stems_delete_owner" on public.stems;
create policy "stems_delete_owner"
on public.stems
for delete
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = stems.project_id
      and p.owner_user_id = auth.uid()
  )
);


