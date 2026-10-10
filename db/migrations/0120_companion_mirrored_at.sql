-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- When the companion's attributes were last written on chain. The public views
-- (`credential-verify`, `learner-profile`) show the chain's values and say how
-- old that snapshot is. Null for a row mirrored before this column existed.
-- Idempotent.
-- ============================================================================

alter table itera.companions add column if not exists mirrored_at timestamptz;
