-- itera:no-transaction
-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Adds the `solana` identity provider for Sign in with Solana (Supabase Web3
-- auth). Not part of the itera-player series.
--
-- A value added by `ALTER TYPE … ADD VALUE` cannot be USED in the transaction
-- that added it, so it lives alone here; 0111 is the first to use it.
-- ============================================================================

ALTER TYPE itera.identity_provider ADD VALUE IF NOT EXISTS 'solana';
