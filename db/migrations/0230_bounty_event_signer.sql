-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties: who signed each step.
--
-- From the escrow program's second version the learner's own wallet signs
-- `accept` and the `unclaim` of a withdrawal (the treasury only pays the fee).
-- `bounty_events.signer` is the wallet that signed the program's instruction of
-- that step, written with the transaction signature. Rows from before stay
-- null: those steps were signed by Itera's key alone and the page says so.
--
-- Additive and idempotent. Undo: alter table itera.bounty_events drop column signer.
-- ============================================================================

alter table itera.bounty_events add column if not exists signer text;
