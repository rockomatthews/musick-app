-- Storage RLS policies.
-- IMPORTANT: You must have buckets created:
-- stems, recordings, avatars, project-images
--
-- Public playback requirement:
-- - anon can SELECT objects in stems/recordings/avatars/project-images (public read)
-- Upload requirement:
-- - authenticated can INSERT into stems/recordings/avatars/project-images
-- - authenticated can UPDATE/DELETE only their own objects

alter table storage.objects enable row level security;

-- Public read (anon)
drop policy if exists "public_read_stems" on storage.objects;
create policy "public_read_stems"
on storage.objects for select
to anon
using (bucket_id = 'stems');

drop policy if exists "public_read_recordings" on storage.objects;
create policy "public_read_recordings"
on storage.objects for select
to anon
using (bucket_id = 'recordings');

drop policy if exists "public_read_avatars" on storage.objects;
create policy "public_read_avatars"
on storage.objects for select
to anon
using (bucket_id = 'avatars');

drop policy if exists "public_read_project_images" on storage.objects;
create policy "public_read_project_images"
on storage.objects for select
to anon
using (bucket_id = 'project-images');

-- Authenticated upload (insert)
drop policy if exists "auth_upload_stems" on storage.objects;
create policy "auth_upload_stems"
on storage.objects for insert
to authenticated
with check (bucket_id = 'stems');

drop policy if exists "auth_upload_recordings" on storage.objects;
create policy "auth_upload_recordings"
on storage.objects for insert
to authenticated
with check (bucket_id = 'recordings');

drop policy if exists "auth_upload_avatars" on storage.objects;
create policy "auth_upload_avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');

drop policy if exists "auth_upload_project_images" on storage.objects;
create policy "auth_upload_project_images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-images');

-- Authenticated update/delete only own objects
drop policy if exists "auth_update_own_objects" on storage.objects;
create policy "auth_update_own_objects"
on storage.objects for update
to authenticated
using (owner = auth.uid())
with check (owner = auth.uid());

drop policy if exists "auth_delete_own_objects" on storage.objects;
create policy "auth_delete_own_objects"
on storage.objects for delete
to authenticated
using (owner = auth.uid());


