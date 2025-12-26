alter table public.projects
add column if not exists column_count int not null default 1;


