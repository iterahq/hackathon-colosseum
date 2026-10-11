-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties a stranger can finish alone, and escrows whose terms name the days.
--
-- * `bounties.escrow_gated`: the escrow account was created with the program's
--   `create_gated`: its terms (and its address) name the trail and the stamped
--   days, and `accept` reads them from the certification account. No attester.
-- * `bounties.auto_check`: the lesson engine's static HTML asserts. A delivery
--   (pasted code, kept in `bounty_claims.submission_code`) that passes them is
--   approved with no reviewer and paid by the escrow program at once.
-- * `bounty_templates`: what a refilled bounty is made from, how many stay
--   available and how many may be created a day. The scheduled sweep
--   (`0202_bounty_refund_schedule.sql`) refills from the treasury.
-- * `devnet_sponsor_drops`: one devnet top-up per wallet and per learner for
--   trying the sponsor side of the board (the shop's faucet is `devnet_airdrops`).
--
-- Additive and idempotent. Service role only: RLS on, no policy, no grant.
-- Undo: update itera.bounty_templates set active = false;
-- ============================================================================

alter table itera.bounties add column if not exists escrow_gated boolean not null default false;
alter table itera.bounties add column if not exists auto_check jsonb;
alter table itera.bounties add column if not exists template_key text;
create index if not exists bounties_template_key on itera.bounties (template_key, status) where template_key is not null;

alter table itera.bounty_claims add column if not exists submission_code text check (submission_code is null or char_length(submission_code) <= 8000);
alter table itera.bounty_claims add column if not exists check_report jsonb;

create table if not exists itera.bounty_templates (
  key        text primary key check (key ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  active     boolean not null default true,
  keep_open  integer not null default 2 check (keep_open between 0 and 10),
  daily_cap  integer not null default 40 check (daily_cap between 0 and 500),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists itera.devnet_sponsor_drops (
  wallet       text primary key,
  user_id      uuid not null unique references itera.users(id) on delete cascade,
  lamports     bigint not null,
  tx_signature text,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table itera.bounty_templates enable row level security;
alter table itera.devnet_sponsor_drops enable row level security;
revoke all on itera.bounty_templates, itera.devnet_sponsor_drops from public, anon, authenticated;
grant all on itera.bounty_templates, itera.devnet_sponsor_drops to service_role;
