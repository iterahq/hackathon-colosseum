-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The gift and referral functions (service role) read two facts of a learner:
-- the nickname a wallet learner chose (shown in the gift moment and in the
-- Action title) and when the account was created (an invite is only accepted
-- from a new account). Column-level, read-only.
-- Idempotent.
-- ============================================================================

grant select (id, display_name, created_at) on itera.users to service_role;
