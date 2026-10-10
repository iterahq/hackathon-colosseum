-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The devnet faucet (security review, finding 7).
--
-- * One claim per learner AND per wallet: `devnet_airdrops.wallet` is the
--   primary key already; `devnet_airdrops_user_idx` adds the learner.
-- * `confirmed_at`: set when the transfer was seen confirmed. The row is the
--   lock and is no longer deleted once a signature was broadcast: a transfer
--   that timed out is asked about on chain by the next call instead of being
--   paid a second time. Rows from before this migration all carry a signature
--   of a confirmed transfer and are backfilled.
-- The daily budget (0.3 SOL in 24 hours) is a constant of `_shared/faucet.ts`.
-- Idempotent.
-- ============================================================================

alter table itera.devnet_airdrops add column if not exists confirmed_at timestamptz;

update itera.devnet_airdrops
   set confirmed_at = created_at
 where confirmed_at is null and tx_signature is not null and created_at < '2026-10-10T04:45:00Z';

create unique index if not exists devnet_airdrops_user_idx on itera.devnet_airdrops (user_id);
create index if not exists devnet_airdrops_created_idx on itera.devnet_airdrops (created_at);
