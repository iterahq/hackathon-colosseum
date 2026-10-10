-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- One mirror per companion in flight. `mirror_claimed_at` is the claim of the
-- invocation that is writing the asset (stale after a minute); `mirror_dirty`
-- is set by a caller that could not claim, and makes the holder write again
-- from the current row before it lets go.
-- Idempotent.
-- ============================================================================

alter table itera.companions add column if not exists mirror_claimed_at timestamptz;
alter table itera.companions add column if not exists mirror_dirty boolean not null default false;
