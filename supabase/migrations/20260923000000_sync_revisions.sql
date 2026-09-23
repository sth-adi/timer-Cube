-- Sync revisions: makes cloud sync safe across devices.
--
-- Before this, sync was additive only: a solve deleted on one device came
-- back from any other device that still had it, and an edit (penalty,
-- comment) made on one device never reached a device that already had the
-- solve. The app now resolves every conflict with one rule — the most
-- recent change to an id wins, deletions included — and this migration
-- gives the database what it needs to take part:
--
--   * updated_at on sessions and solves (ms since epoch, set by the app on
--     every change);
--   * a deletions table recording what was deleted and when;
--   * a guard trigger so the database itself never lets an older version
--     overwrite a newer one, or revive a deleted row — even if a device
--     running an older version of the app pushes stale data.
--
-- Safe to run more than once. Run it in the Supabase SQL editor.

alter table public.sessions add column if not exists updated_at bigint;
alter table public.solves add column if not exists updated_at bigint;
alter table public.solves add column if not exists rotations jsonb;
alter table public.solves add column if not exists oriented_reconstruction text;

create table if not exists public.deletions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('solve', 'session')),
  deleted_at bigint not null,
  primary key (user_id, id)
);

alter table public.deletions enable row level security;

drop policy if exists "deletions are private to their owner" on public.deletions;
create policy "deletions are private to their owner" on public.deletions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Refuse stale writes: a row deleted at or after this version stays
-- deleted, and an older version never replaces a newer one. Returning
-- null from a BEFORE trigger silently skips that row, so a stale upsert
-- succeeds without changing anything.
create or replace function public.sync_guard() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from public.deletions d
    where d.user_id = new.user_id and d.id = new.id::text and d.deleted_at >= coalesce(new.updated_at, 0)
  ) then
    return null;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.updated_at, 0) > coalesce(new.updated_at, 0) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_sync_guard on public.sessions;
create trigger sessions_sync_guard before insert or update on public.sessions
  for each row execute function public.sync_guard();

drop trigger if exists solves_sync_guard on public.solves;
create trigger solves_sync_guard before insert or update on public.solves
  for each row execute function public.sync_guard();

-- Recording a deletion removes the row (and, for a session, its solves)
-- unless the row has been changed since.
create or replace function public.apply_deletion() returns trigger
language plpgsql as $$
begin
  if new.kind = 'solve' then
    delete from public.solves
    where user_id = new.user_id and id::text = new.id and coalesce(updated_at, 0) <= new.deleted_at;
  else
    delete from public.solves where user_id = new.user_id and session_id::text = new.id;
    delete from public.sessions
    where user_id = new.user_id and id::text = new.id and coalesce(updated_at, 0) <= new.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists deletions_apply on public.deletions;
create trigger deletions_apply after insert or update on public.deletions
  for each row execute function public.apply_deletion();
