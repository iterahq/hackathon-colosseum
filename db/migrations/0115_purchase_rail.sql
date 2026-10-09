-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Purchase rail: items paid from the learner's Solana wallet (devnet SOL).
--
-- * `itera.shop_items`: the catalog. `active` is the flag an owner flips; every
--   seeded item starts inactive. Prices are pinned here (lamports, US cents and
--   a fixed display label), never read from a price feed.
-- * `itera.purchases`: one row per intent. `tx_signature` is unique, so one
--   payment can settle exactly one purchase.
-- * `itera.user_inventory`: what a learner owns, scoped by `ref_id` (the trail
--   for a passport cosmetic, the zero uuid for a global item).
-- * `itera.devnet_airdrops`: one devnet top-up per wallet.
-- * `itera.onchain_config.treasury`: the public key that receives payments.
--
-- Verification and item effects live in TypeScript (edge functions, service
-- role). Clients read, nobody but the service role writes.
-- Idempotent.
-- ============================================================================

create table if not exists itera.shop_items (
  key              text primary key,
  kind             text not null,
  price_lamports   bigint not null check (price_lamports > 0 and price_lamports <= 1000000000),
  price_usd_cents  int not null check (price_usd_cents >= 0),
  price_label      text not null,
  title_i18n       jsonb not null default '{}'::jsonb,
  description_i18n jsonb not null default '{}'::jsonb,
  -- What the kind's handler applies, e.g. {"value": "emerald"} for a passport ink.
  effect           jsonb not null default '{}'::jsonb,
  active           boolean not null default false,
  sort             int not null default 0
);

create table if not exists itera.purchases (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references itera.users(id) on delete cascade,
  item_key                text not null references itera.shop_items(key),
  ref_id                  uuid not null default '00000000-0000-0000-0000-000000000000',
  lamports                bigint not null check (lamports > 0),
  price_usd_cents         int not null default 0,
  status                  text not null default 'pending'
                            check (status in ('pending', 'paid', 'refunded', 'failed', 'expired')),
  wallet                  text not null,
  tx_signature            text unique,
  refund_signature        text,
  memo                    text not null,
  last_valid_block_height bigint,
  expires_at              timestamptz not null,
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  refunded_at             timestamptz,
  -- When the item effect was last applied in full; null while it is still due.
  applied_at              timestamptz,
  error                   text
);

create index if not exists purchases_user_idx on itera.purchases (user_id, item_key, ref_id);
-- At most one open intent per (learner, item, ref): a repeated request reuses it.
create unique index if not exists purchases_one_pending_idx
  on itera.purchases (user_id, item_key, ref_id) where status = 'pending';

create table if not exists itera.user_inventory (
  user_id     uuid not null references itera.users(id) on delete cascade,
  item_key    text not null references itera.shop_items(key),
  ref_id      uuid not null default '00000000-0000-0000-0000-000000000000',
  qty         int not null default 1 check (qty >= 0),
  consumed_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_key, ref_id)
);

create table if not exists itera.devnet_airdrops (
  wallet       text primary key,
  user_id      uuid not null references itera.users(id) on delete cascade,
  lamports     bigint not null,
  tx_signature text,
  created_at   timestamptz not null default now()
);

alter table itera.shop_items enable row level security;
alter table itera.purchases enable row level security;
alter table itera.user_inventory enable row level security;
alter table itera.devnet_airdrops enable row level security;

drop policy if exists shop_items_read_all on itera.shop_items;
create policy shop_items_read_all on itera.shop_items
  for select to anon, authenticated using (true);

drop policy if exists purchases_read_own on itera.purchases;
create policy purchases_read_own on itera.purchases
  for select to authenticated using (user_id = itera.current_itera_user_id());

drop policy if exists user_inventory_read_own on itera.user_inventory;
create policy user_inventory_read_own on itera.user_inventory
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.shop_items, itera.purchases, itera.user_inventory, itera.devnet_airdrops from anon, authenticated;
grant select on itera.shop_items to anon, authenticated;
grant select on itera.purchases, itera.user_inventory to authenticated;
grant all on itera.shop_items, itera.purchases, itera.user_inventory, itera.devnet_airdrops to service_role;

-- `active` is left out of the update on purpose: re-running this file never
-- switches an item the owner turned on back off.
insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, effect, active, sort) values
  ('ink_emerald', 'passport_ink', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Tinta esmeralda", "en": "Emerald ink"}',
   '{"pt": "Os carimbos e a página deste passaporte passam a ser em tinta esmeralda, gravada on-chain.", "en": "This passport page and its stamps switch to emerald ink, written on-chain."}',
   '{"value": "emerald"}', false, 10),
  ('ink_violet', 'passport_ink', 1100000, 20, 'US$ 0.20 ≈ 0.0011 SOL',
   '{"pt": "Tinta violeta", "en": "Violet ink"}',
   '{"pt": "Os carimbos e a página deste passaporte passam a ser em tinta violeta, gravada on-chain.", "en": "This passport page and its stamps switch to violet ink, written on-chain."}',
   '{"value": "violet"}', false, 20),
  ('frame_gold_leaf', 'passport_frame', 2750000, 50, 'US$ 0.50 ≈ 0.00275 SOL',
   '{"pt": "Moldura folha de ouro", "en": "Gold-leaf frame"}',
   '{"pt": "Uma moldura em folha de ouro na página deste passaporte, gravada on-chain.", "en": "A gold-leaf frame around this passport page, written on-chain."}',
   '{"value": "gold-leaf"}', false, 30)
on conflict (key) do update set
  kind = excluded.kind,
  price_lamports = excluded.price_lamports,
  price_usd_cents = excluded.price_usd_cents,
  price_label = excluded.price_label,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  effect = excluded.effect,
  sort = excluded.sort;

insert into itera.onchain_config (key, value) values
  ('treasury', 'AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA')
on conflict (key) do update set value = excluded.value, updated_at = now();
