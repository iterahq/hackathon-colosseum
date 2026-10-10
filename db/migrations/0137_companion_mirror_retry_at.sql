-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- `companions.mirror_retry_at`: when the one invocation that waits out a mirror
-- cooldown will write again (see 0136 and `syncMirror`). Taken by
-- compare-and-set, so a burst of held mirrors leaves ONE waiter, not one per
-- request; a waiter that died is replaced once its time has passed.
-- Idempotent.
-- ============================================================================

alter table itera.companions add column if not exists mirror_retry_at timestamptz;
