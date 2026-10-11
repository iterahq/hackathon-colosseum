-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The escrow program deployed on devnet since slot 510040266 has direct
-- bounties: `create_direct` (tag 6), a 260-byte account that names an invitee,
-- and `accept` refusing every other wallet (`NotInvited`, 6020).
--
-- `onchain_config.bounty_escrow_version = '4'` says so. `bounty-post` posts a
-- direct bounty only when this key is 4 or more; below it the answer is
-- `503 direct_unavailable`. Bounties without an invitee are untouched.
--
-- Apply only AFTER the program was upgraded. Idempotent.
-- Undo (the program was rolled back): set the value back to '3'.
-- ============================================================================

insert into itera.onchain_config (key, value)
values ('bounty_escrow_version', '4')
on conflict (key) do update set value = excluded.value
where itera.onchain_config.value::int < 4;
