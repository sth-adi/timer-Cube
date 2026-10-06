-- Lets a shared solve carry the cube's recorded orientation (the same
-- continuous gyro stream a synced solve has), so the shared page can show the
-- Gyro Twin tilting through the replay. Optional: shares made without it, and
-- hosts without this migration, keep working exactly as before.
--
-- Safe to run more than once.

alter table public.shared_solves add column if not exists gyro_stream jsonb;
