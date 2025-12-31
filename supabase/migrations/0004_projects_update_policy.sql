-- Allow project owners to update their projects (cover image, title, column count, etc.)

alter table public.projects enable row level security;

drop policy if exists "projects_update_owner_only" on public.projects;
create policy "projects_update_owner_only"
on public.projects for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());


