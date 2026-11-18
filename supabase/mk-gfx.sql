-- MK VISION graphics in the cloud: saved designs, My packages and design rows.
-- Run ONCE in the Supabase dashboard (after mk-desks.sql): SQL Editor -> New query -> paste -> Run.
-- Safe to run again. Everyone signed in can read; Director and Graphics can write.

create table if not exists public.mk_gfx (
  kind text not null check (kind in ('design', 'package', 'rows')),
  id text not null,
  data jsonb not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

alter table public.mk_gfx enable row level security;
drop policy if exists mk_gfx_read on public.mk_gfx;
create policy mk_gfx_read on public.mk_gfx for select to authenticated
  using (public.mk_role() is not null);
drop policy if exists mk_gfx_write on public.mk_gfx;
create policy mk_gfx_write on public.mk_gfx for all to authenticated
  using (public.mk_role() in ('director', 'graphics'))
  with check (public.mk_role() in ('director', 'graphics'));

-- Lets other desks see changes live.
do $$ begin
  alter publication supabase_realtime add table public.mk_gfx;
exception when duplicate_object then null;
end $$;
