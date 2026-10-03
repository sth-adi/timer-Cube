-- A session's deletion no longer destroys solves recorded after it.
--
-- Before: recording a session deletion (public.deletions, kind = 'session') deleted EVERY solve
-- still filed under that session, including ones another device recorded offline AFTER the
-- deletion (on a trip, in a session deleted at home). Those solves were lost for good.
--
-- Now the deletion only removes what existed when it happened — the same newest-wins rule the
-- rest of sync uses (sync_guard above, and the app's lib/db/merge.ts): a solve whose revision
-- (updated_at, else its date — the app's `updatedAt ?? date`) is newer than the deletion's
-- deleted_at stays. A solve exactly at the deletion's instant still goes (a deletion beats a
-- same-instant edit).
--
-- What stays is not left orphaned by the app. A device that pulls the deletion (always before it
-- pushes) files each such solve into a "Recovered" session whose id is derived from the deleted
-- session's id, bumping the solve's updated_at by one, and pushes in the order sessions -> solves
-- -> deletions, so the solve is already under its new session when the deletion is recorded.
--
-- The session row itself is only deleted once no solve is filed under it any more. That keeps
-- every solve's session_id pointing at a session that exists (whatever foreign key the solves
-- table has to sessions — it is not defined in these migrations), so recording a deletion can
-- never fail on one. If the session row is left behind because a solve is still filed under it, it
-- is harmless: the deletion record outranks it on every device (its updated_at is not newer than
-- deleted_at), and sync_guard refuses any write to it.
--
-- Only this function changes; the deletions_apply trigger from 20260923000000_sync_revisions.sql
-- keeps calling it by name. Safe to run more than once.

create or replace function public.apply_deletion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'solve' then
    delete from public.solves
    where user_id = new.user_id and id::text = new.id and coalesce(updated_at, 0) <= new.deleted_at;
  else
    delete from public.solves s
    where s.user_id = new.user_id
      and s.session_id::text = new.id
      and coalesce(s.updated_at, s.date::bigint, 0) <= new.deleted_at;
    delete from public.sessions
    where user_id = new.user_id
      and id::text = new.id
      and coalesce(updated_at, 0) <= new.deleted_at
      and not exists (
        select 1 from public.solves s
        where s.user_id = new.user_id and s.session_id::text = new.id
      );
  end if;
  return new;
end;
$$;
