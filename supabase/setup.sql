-- Happy Body: one-time Supabase setup. Paste into the SQL Editor and run once.
-- Safe to run again. Creates the sync table, the photo bucket, and the row-level
-- security that limits every signed-in person to their own rows and files.

-- ── Records ─────────────────────────────────────────────────────────────
-- One row per synced record (a setting, a log entry, a weigh-in, a photo file…).
-- updated_at is the client's last-write-wins stamp (ms); synced_at is server time
-- (ms), the cursor devices pull from.
create table if not exists public.hb_records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text    not null check (length(kind) <= 32),
  id         text    not null check (length(id) <= 200),
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  synced_at  bigint  not null default 0,
  primary key (user_id, kind, id)
);
create index if not exists hb_records_pull on public.hb_records (user_id, synced_at);

-- Last write wins on the server too: an older write never replaces a newer one,
-- whichever device reaches the server first.
create or replace function public.hb_records_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end $$;

drop trigger if exists hb_records_lww on public.hb_records;
create trigger hb_records_lww before insert or update on public.hb_records
  for each row execute function public.hb_records_lww();

alter table public.hb_records enable row level security;

drop policy if exists "hb_records own select" on public.hb_records;
drop policy if exists "hb_records own insert" on public.hb_records;
drop policy if exists "hb_records own update" on public.hb_records;
create policy "hb_records own select" on public.hb_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "hb_records own insert" on public.hb_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "hb_records own update" on public.hb_records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- No delete policy: devices write tombstones (deleted = true) instead.

revoke all on public.hb_records from anon;
grant select, insert, update on public.hb_records to authenticated;

-- ── Photos ──────────────────────────────────────────────────────────────
-- Private bucket; each person's files live under a folder named by their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hb-photos', 'hb-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "hb-photos own select" on storage.objects;
drop policy if exists "hb-photos own insert" on storage.objects;
drop policy if exists "hb-photos own update" on storage.objects;
drop policy if exists "hb-photos own delete" on storage.objects;
create policy "hb-photos own select" on storage.objects for select to authenticated
  using (bucket_id = 'hb-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "hb-photos own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'hb-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "hb-photos own update" on storage.objects for update to authenticated
  using (bucket_id = 'hb-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'hb-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "hb-photos own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hb-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
