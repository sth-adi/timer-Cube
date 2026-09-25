-- Adds the continuous gyro stream column: every orientation sample a gyro
-- cube reported during a solve (thinned to ~20Hz, baked into body-frame
-- quaternions at save time), not just the named regrips already synced in
-- `rotations`. Optional — a device without this migration applied still
-- syncs everything else fine; solves just sync without their stream until
-- it's run.
--
-- Safe to run more than once.

alter table public.solves add column if not exists gyro_stream jsonb;
