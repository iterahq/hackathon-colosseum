-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera NFT, step 4: the sponsor Tera (a branded prize on a bounty).
--
-- * `itera.bounties.prize_tera`: `{ brand, accent, base }` or null. The three
--   values a sponsor chose; never a file, never a URL.
--   `prize_fee_signature`: the funding transaction, once it was seen to pay the
--   mint cost and the issuing fee to the treasury. Without it no prize is minted.
--   `prize_issued`, `prize_asset`: how many were minted and the one of the payout.
-- * `itera.sponsor_teras`: one row per prize minted, unique per (bounty, claim):
--   a payout mints one, whatever is retried. RLS on, NO policy: service role only.
-- * `itera.onchain_config.prize_tera`: the kill switch, inserted `off`.
-- * `itera.chain_version` / `chain_version_of_asset`: the read cache of the
--   public pages now also turns over when a chest or a sponsor Tera changes.
--
-- The escrow program is not touched. Idempotent.
-- ============================================================================

alter table itera.bounties add column if not exists prize_tera jsonb;
alter table itera.bounties add column if not exists prize_fee_signature text;
alter table itera.bounties add column if not exists prize_issued integer not null default 0;
alter table itera.bounties add column if not exists prize_asset text;

create table if not exists itera.sponsor_teras (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references itera.bounties(id),
  claim_id uuid not null references itera.bounty_claims(id),
  user_id uuid not null references itera.users(id) on delete cascade,
  wallet text not null,
  brand text not null,
  accent text not null check (accent ~ '^#[0-9a-f]{6}$'),
  base text not null,
  edition integer not null check (edition > 0),
  edition_size integer not null check (edition_size > 0),
  payout_signature text not null,
  mint_status text not null default 'pending' check (mint_status in ('pending', 'minted', 'failed')),
  mint_claimed_at timestamptz,
  mint_error text,
  asset_address text unique,
  tx_signature text,
  minted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bounty_id, claim_id),
  unique (bounty_id, edition)
);
create index if not exists sponsor_teras_wallet_idx on itera.sponsor_teras (wallet) where mint_status = 'minted';
alter table itera.sponsor_teras enable row level security;
revoke all on itera.sponsor_teras from anon, authenticated;
grant select, insert, update on itera.sponsor_teras to service_role;

insert into itera.onchain_config (key, value) values ('prize_tera', 'off') on conflict (key) do nothing;

create or replace function itera.chain_version(p_wallet text)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws('|',
    (select coalesce(max(minted_at)::text, '-') || ':' || count(*) from itera.user_achievements where wallet_address = p_wallet),
    (select coalesce(max(coalesce(written_at, proven_at))::text, '-') || ':' || count(*) from itera.claim_proofs where wallet = p_wallet),
    (select coalesce(max(e.created_at)::text, '-') || ':' || count(*)
       from itera.endorsements e join itera.user_achievements ua on ua.id = e.user_achievement_id
      where ua.wallet_address = p_wallet),
    (select coalesce(string_agg(concat_ws(':', version, mirrored_at, updated_at, avatar, outfit, lives, max_lives), ','), '-')
       from itera.companions where wallet_address = p_wallet),
    (select coalesce(max(minted_at)::text, '-') || ':' || count(*) from itera.avatar_assets where wallet = p_wallet),
    (select coalesce(max(coalesce(applied_at, paid_at, created_at))::text, '-') || ':' || count(*) from itera.purchases where wallet = p_wallet),
    (select coalesce(max(coalesce(c.settled_at, c.created_at))::text, '-') || ':' || count(*) || ':' || coalesce(sum(c.commits), 0) || ':' || count(c.commit_tx)
       from itera.tera_chests c join itera.user_achievements ua on ua.id = c.certification_id
      where ua.wallet_address = p_wallet),
    (select coalesce(max(minted_at)::text, '-') || ':' || count(*) from itera.sponsor_teras where wallet = p_wallet)
  );
$$;

create or replace function itera.chain_version_of_asset(p_asset text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select itera.chain_version(s.w)
      from (
        select wallet_address as w from itera.user_achievements where asset_address = p_asset
        union select wallet_address from itera.companions where asset_address = p_asset
        union select wallet from itera.avatar_assets where asset_address = p_asset
        union select wallet from itera.sponsor_teras where asset_address = p_asset
      ) s
     where s.w is not null
     limit 1
  ), 'none');
$$;

revoke all on function itera.chain_version(text) from public, anon, authenticated;
revoke all on function itera.chain_version_of_asset(text) from public, anon, authenticated;
grant execute on function itera.chain_version(text) to service_role;
grant execute on function itera.chain_version_of_asset(text) to service_role;
