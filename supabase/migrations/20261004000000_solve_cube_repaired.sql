-- Adds the two solve fields that used to stay on the device they were
-- recorded on: `cube` (which smart cube the solve was made on) and
-- `repaired` (a turn the cube missed or doubled that the app put back),
-- plus a server-side `synced_at` stamp that makes cloud pulls incremental
-- (second half of this file). Without the first two columns a solve pulled
-- onto another device, or restored after clearing site data, loses its cube
-- identity. Both are jsonb, the same shape the app keeps locally, and
-- nullable: solves without a cube (keyboard solves, older solves) simply
-- have nothing here.
--
-- Safe to run more than once.

alter table public.solves add column if not exists cube jsonb;
alter table public.solves add column if not exists repaired jsonb;

-- Server-side change stamp, so a device can ask for "what changed since I
-- last looked" without trusting anyone's clock. A row's `updated_at` is the
-- revision the recording device gave it; a solve recorded offline on a trip
-- and uploaded hours later carries an old one, which another device pulling
-- "newer than the newest revision I've seen" would never notice. `synced_at`
-- is when the database itself last wrote the row. Existing rows get the time
-- this runs, which only costs each device one full re-pull.
alter table public.solves add column if not exists synced_at timestamptz not null default now();
alter table public.sessions add column if not exists synced_at timestamptz not null default now();
alter table public.deletions add column if not exists synced_at timestamptz not null default now();

-- Named to fire before the sync_guard triggers (BEFORE triggers run in name
-- order). It doesn't matter either way: when the guard returns null the row
-- is skipped and nothing is written, so there is no stamp to keep or lose.
create or replace function public.set_synced_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

create or replace trigger solves_set_synced_at before insert or update on public.solves
  for each row execute function public.set_synced_at();

create or replace trigger sessions_set_synced_at before insert or update on public.sessions
  for each row execute function public.set_synced_at();

create or replace trigger deletions_set_synced_at before insert or update on public.deletions
  for each row execute function public.set_synced_at();

create index if not exists solves_user_synced_at_idx on public.solves (user_id, synced_at);
create index if not exists sessions_user_synced_at_idx on public.sessions (user_id, synced_at);
create index if not exists deletions_user_synced_at_idx on public.deletions (user_id, synced_at);
