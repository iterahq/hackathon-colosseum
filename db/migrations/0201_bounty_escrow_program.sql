-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties: the escrow program.
--
-- `onchain_config.bounty_escrow_program` is the address of the program that
-- holds the reward of every bounty posted from now on (`programs/bounty-escrow`,
-- devnet). With the key present, `bounty-sponsor` creates bounties with
-- `escrow_kind = 'program'`; without it, with a server-held account as before.
-- Bounties already posted keep the escrow they were created with.
--
-- Additive and idempotent. Undo: delete the key.
-- ============================================================================

insert into itera.onchain_config (key, value)
values ('bounty_escrow_program', 'ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq')
on conflict (key) do nothing;
