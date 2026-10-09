-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- 1. Shop prices at ONE pinned rate: 1 US cent = 55 000 lamports
--    (US$ 0.20 = 1 100 000 lamports = 0.0011 SOL). `price_lamports` and
--    `price_label` are derived from `price_usd_cents`; the label shows the
--    exact SOL amount, never rounded. Only `life_refill` moves
--    ("≈ 0.0006 SOL" becomes "≈ 0.00055 SOL"); its lamports were already right.
-- 2. Lookups by wallet for the public `learner-profile` function.
--
-- Idempotent: every statement is a fixpoint.
-- ============================================================================

update itera.shop_items set
  price_lamports = price_usd_cents * 55000,
  price_label = 'US$ ' || to_char(price_usd_cents / 100.0, 'FM990.00')
    || ' ≈ ' || trim(trailing '.' from trim(trailing '0' from to_char(price_usd_cents * 55000 / 1e9, 'FM0.000000000')))
    || ' SOL'
where price_lamports is distinct from price_usd_cents * 55000
   or price_label is distinct from 'US$ ' || to_char(price_usd_cents / 100.0, 'FM990.00')
    || ' ≈ ' || trim(trailing '.' from trim(trailing '0' from to_char(price_usd_cents * 55000 / 1e9, 'FM0.000000000')))
    || ' SOL';

create index if not exists user_achievements_wallet_idx
  on itera.user_achievements (wallet_address) where mint_status = 'minted';
create index if not exists companions_wallet_idx
  on itera.companions (wallet_address) where mint_status = 'minted';
