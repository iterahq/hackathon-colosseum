-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties: the escrow program's second version is the one deployed.
--
-- `onchain_config.bounty_escrow_version = '2'` says the program at
-- `bounty_escrow_program` is the build where the claimant signs `accept`, the
-- claimant may `unclaim`, and anyone may `refund` a bounty past its expiry to
-- its sponsor. The server only attempts the refund of a wallet-posted bounty
-- (signed by no key of its sponsor) when this key says so.
--
-- Additive and idempotent. Undo: delete the key.
-- ============================================================================

insert into itera.onchain_config (key, value)
values ('bounty_escrow_version', '2')
on conflict (key) do update set value = excluded.value;
