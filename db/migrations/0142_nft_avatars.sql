-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera avatars: the learner's profile picture. Free icons everyone owns, and
-- collectible NFTs (Metaplex Core, transferable) sold in a rarity pyramid.
--
-- * `itera.avatar_tiers`: the rarity ladder as DATA (one row per tier: display
--   name, label, rank). A new tier is one insert.
-- * `itera.shop_items` gains the avatar columns (`rarity`, `avatar_group`,
--   `supply_cap`, `image_key`). An avatar is a row of kind `avatar`. A FREE one
--   has `price_lamports` NULL ("not for sale"): the column loses NOT NULL. NULL
--   (not 0) on purpose: the faucet reads the cheapest active price and NULL
--   sorts last. The price ceiling goes from 1 SOL to 100 SOL (a mythic avatar
--   is US$ 1,000 = 5 500 000 000 lamports; the column is bigint). No constraint
--   is put on `kind`: other features add kinds of their own.
-- * `itera.avatar_assets`: one row per (learner, avatar) holding the SERIAL of
--   that unit. `(item_key, serial)` is unique, so supply is countable and a cap
--   of 5 can never hold 6 rows. A row is born `reserved` at intent time (an
--   unpaid hold with an expiry), becomes `pending` when the payment settles and
--   `minted` when the asset exists. The serial is chosen in TypeScript
--   (`_shared/avatars.ts`, lowest free serial, never above the cap) and the
--   unique index is what makes two buyers of the last unit safe: one insert
--   wins, the other reads again and finds nothing left.
-- * `itera.companions.avatar`: the avatar the learner wears (default `tera_normal`).
-- * `itera.purchases.refund_due_at`: a paid purchase whose unit was gone
--   (`error = 'sold_out_after_payment'`), for the operator.
--
-- Clients read the catalog and their own rows; only the service role writes.
-- Idempotent.
-- ============================================================================

create table if not exists itera.avatar_tiers (
  rarity         text primary key,
  rank           int not null,
  tier_name_i18n jsonb not null,
  label_i18n     jsonb not null
);

insert into itera.avatar_tiers (rarity, rank, tier_name_i18n, label_i18n) values
  ('common',    1, '{"pt": "Tera", "en": "Tera"}',                        '{"pt": "Comum", "en": "Common"}'),
  ('rare',      2, '{"pt": "Super Tera", "en": "Super Tera"}',            '{"pt": "Raro", "en": "Rare"}'),
  ('epic',      3, '{"pt": "Mega Tera", "en": "Mega Tera"}',              '{"pt": "Muito raro", "en": "Very rare"}'),
  ('legendary', 4, '{"pt": "Tera Lendário", "en": "Legendary Tera"}',     '{"pt": "Lendário", "en": "Legendary"}'),
  ('mythic',    5, '{"pt": "Tera Mítico", "en": "Mythic Tera"}',          '{"pt": "Impossível", "en": "Impossible"}')
on conflict (rarity) do update set
  rank = excluded.rank,
  tier_name_i18n = excluded.tier_name_i18n,
  label_i18n = excluded.label_i18n;

alter table itera.shop_items
  add column if not exists rarity       text references itera.avatar_tiers(rarity),
  add column if not exists avatar_group text,
  add column if not exists supply_cap   int,
  add column if not exists image_key    text;

alter table itera.shop_items alter column price_lamports drop not null;

alter table itera.shop_items drop constraint if exists shop_items_price_lamports_check;
alter table itera.shop_items add constraint shop_items_price_lamports_check
  check (price_lamports > 0 and price_lamports <= 100000000000);
alter table itera.shop_items drop constraint if exists shop_items_avatar_check;
alter table itera.shop_items add constraint shop_items_avatar_check
  check (kind <> 'avatar' or (rarity is not null and avatar_group is not null));
alter table itera.shop_items drop constraint if exists shop_items_supply_cap_check;
alter table itera.shop_items add constraint shop_items_supply_cap_check
  check (supply_cap is null or supply_cap > 0);

create table if not exists itera.avatar_assets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references itera.users(id) on delete cascade,
  item_key         text not null references itera.shop_items(key),
  serial           int not null check (serial > 0),
  purchase_id      uuid references itera.purchases(id) on delete set null,
  mint_status      text not null default 'reserved'
                     check (mint_status in ('reserved', 'pending', 'minted', 'failed')),
  -- Only read while `mint_status = 'reserved'`: past it the unpaid hold may be dropped.
  reserved_until   timestamptz,
  wallet           text,
  asset_address    text unique,
  tx_signature     text,
  mint_claimed_at  timestamptz,
  mint_error       text,
  minted_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, item_key),
  unique (item_key, serial)
);

create index if not exists avatar_assets_wallet_idx on itera.avatar_assets (wallet) where mint_status = 'minted';

alter table itera.companions add column if not exists avatar text not null default 'tera_normal';
alter table itera.purchases add column if not exists refund_due_at timestamptz;

alter table itera.avatar_tiers enable row level security;
alter table itera.avatar_assets enable row level security;

drop policy if exists avatar_tiers_read_all on itera.avatar_tiers;
create policy avatar_tiers_read_all on itera.avatar_tiers
  for select to anon, authenticated using (true);

drop policy if exists avatar_assets_read_own on itera.avatar_assets;
create policy avatar_assets_read_own on itera.avatar_assets
  for select to authenticated using (user_id = itera.current_itera_user_id());

revoke all on itera.avatar_tiers, itera.avatar_assets from public, anon, authenticated;
grant select on itera.avatar_tiers to anon, authenticated;
grant select on itera.avatar_assets to authenticated;
grant all on itera.avatar_tiers, itera.avatar_assets to service_role;

-- Units per avatar: `minted` counts what was PAID for (the asset exists or is due),
-- `held` adds the unpaid reservations still inside their window. Service role only.
create or replace view itera.avatar_supply
with (security_invoker = true) as
select
  item_key,
  count(*) filter (where mint_status <> 'reserved')::int as minted,
  count(*) filter (where mint_status <> 'reserved' or reserved_until > now())::int as held
from itera.avatar_assets
group by item_key;

revoke all on itera.avatar_supply from public, anon, authenticated;
grant select on itera.avatar_supply to service_role;

-- ---------------------------------------------------------------------------
-- Catalog. Adding an avatar later is ONE insert like these plus one uploaded image
-- (`tera-avatars/<key>.webp`, `<key>_128.webp`). `active` is left out of the update:
-- re-running this file never switches an avatar the owner turned off back on.
-- ---------------------------------------------------------------------------
with seed (key, title_pt, title_en, avatar_group, rarity, cents, supply_cap, sort) as (
  values
    ('tera_normal',             'Normal',             'Normal',         'expression', 'common',    0,    null::int, 1000),
    ('tera_feliz',              'Feliz',              'Happy',          'expression', 'common',    0,    null, 1010),
    ('tera_determinado',        'Determinado',        'Determined',     'expression', 'common',    0,    null, 1020),
    ('tera_piscada',            'Piscada',            'Wink',           'expression', 'common',    0,    null, 1030),
    ('tera_surpreso',           'Surpreso',           'Surprised',      'expression', 'common',    0,    null, 1040),
    ('tera_focado',             'Focado',             'Focused',        'expression', 'common',    0,    null, 1050),
    ('tera_triste',             'Triste',             'Sad',            'expression', 'common',    0,    null, 1060),
    ('tera_sorriso',            'Sorriso ligeiro',    'Slight smile',   'expression', 'common',    0,    null, 1070),
    ('tera_sob_pressao',        'Sob pressão',        'Under pressure', 'expression', 'common',    0,    null, 1080),
    ('tera_curioso',            'Curioso',            'Curious',        'expression', 'common',    0,    null, 1090),
    ('base_iniciante',          'Iniciante',          'Beginner',       'base',       'common',    20,   null, 1100),
    ('base_focado',             'Focado',             'Focused',        'base',       'common',    20,   null, 1110),
    ('base_estudioso',          'Estudioso',          'Studious',       'base',       'common',    20,   null, 1120),
    ('base_determinado',        'Determinado',        'Determined',     'base',       'common',    20,   null, 1130),
    ('base_disciplinado',       'Disciplinado',       'Disciplined',    'base',       'common',    20,   null, 1140),
    ('base_focado_no_objetivo', 'Focado no objetivo', 'Goal-driven',    'base',       'common',    20,   null, 1150),
    ('base_criativo',           'Criativo',           'Creative',       'base',       'common',    20,   null, 1160),
    ('base_analitico',          'Analítico',          'Analytical',     'base',       'common',    20,   null, 1170),
    ('acc_cyber_chip',          'Cyber-chip',         'Cyber-chip',     'accessory',  'rare',      50,   null, 1200),
    ('acc_oculos_tech',         'Óculos tech',        'Tech glasses',   'accessory',  'rare',      50,   null, 1210),
    ('acc_capuz_web3',          'Capuz Web3',         'Web3 hoodie',    'accessory',  'rare',      50,   null, 1220),
    ('acc_chain_link',          'Chain-link',         'Chain-link',     'accessory',  'rare',      50,   null, 1230),
    ('acc_programador',         'Programador',        'Coder',          'accessory',  'rare',      50,   null, 1240),
    ('base_lider',              'Líder',              'Leader',         'base',       'rare',      100,   500,  1300),
    ('base_mistico',            'Místico',            'Mystic',         'base',       'rare',      100,   500,  1310),
    ('base_natural',            'Natural',            'Natural',        'base',       'rare',      100,   500,  1320),
    ('base_livre',              'Livre',              'Free spirit',    'base',       'rare',      100,   500,  1330),
    ('base_guerreiro',          'Guerreiro',          'Warrior',        'base',       'epic',      1000,  100,  1400),
    ('base_sombrio',            'Sombrio',            'Shadow',         'base',       'epic',      1000,  100,  1410),
    ('base_sabedoria',          'Sabedoria',          'Wisdom',         'base',       'epic',      1000,  100,  1420),
    ('base_evoluido',           'Evoluído',           'Evolved',        'base',       'epic',      1000,  100,  1430),
    ('event_halloween',         'Halloween',          'Halloween',      'event',      'epic',      1000,  100,  1440),
    ('event_natal',             'Natal',              'Holiday',        'event',      'epic',      1000,  100,  1450),
    ('event_verao',             'Verão',              'Summer',         'event',      'epic',      1000,  100,  1460),
    ('special_dourado',         'Dourado',            'Golden',         'special',    'legendary', 10000,  25,   1500),
    ('special_prata',           'Prata',              'Silver',         'special',    'legendary', 10000,  25,   1510),
    ('special_verde_neon',      'Verde neon',         'Neon green',     'special',    'legendary', 10000,  25,   1520),
    ('special_azul_eletrico',   'Azul elétrico',      'Electric blue',  'special',    'legendary', 10000,  25,   1530),
    ('special_roxo_estelar',    'Roxo estelar',       'Stellar purple', 'special',    'legendary', 10000,  25,   1540),
    ('special_vermelho_lava',   'Vermelho lava',      'Lava red',       'special',    'legendary', 10000,  25,   1550),
    ('special_preto_cosmico',   'Preto cósmico',      'Cosmic black',   'special',    'legendary', 10000,  25,   1560),
    ('special_arco_iris',       'Arco-íris',          'Rainbow',        'special',    'mythic',    100000, 5,    1600),
    ('event_space',             'Space',              'Space',          'event',      'mythic',    100000, 5,    1610)
)
insert into itera.shop_items
  (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, effect, art, active, sort, rarity, avatar_group, supply_cap, image_key)
select
  key,
  'avatar',
  case when cents > 0 then cents::bigint * 55000 end,
  cents,
  case when cents > 0 then
    'US$ ' || to_char(cents / 100.0, 'FM9,999,990.00') || ' ≈ '
      || trim(trailing '.' from trim(trailing '0' from to_char(cents::bigint * 55000 / 1e9, 'FM9999990.000000000'))) || ' SOL'
  else 'Free' end,
  jsonb_build_object('pt', title_pt, 'en', title_en),
  case when cents > 0 then
    jsonb_build_object(
      'pt', 'Avatar colecionável do Tera: um NFT na Solana, seu para usar, guardar ou transferir.',
      'en', 'A collectible Tera avatar: an NFT on Solana, yours to wear, keep or transfer.')
  else
    jsonb_build_object(
      'pt', 'Um rosto do Tera para o seu perfil. Grátis para todo mundo.',
      'en', 'A Tera face for your profile. Free for everyone.')
  end,
  '{}'::jsonb,
  '{}'::jsonb,
  true,
  sort,
  rarity,
  avatar_group,
  supply_cap,
  key
from seed
on conflict (key) do update set
  kind = excluded.kind,
  price_lamports = excluded.price_lamports,
  price_usd_cents = excluded.price_usd_cents,
  price_label = excluded.price_label,
  title_i18n = excluded.title_i18n,
  description_i18n = excluded.description_i18n,
  sort = excluded.sort,
  rarity = excluded.rarity,
  avatar_group = excluded.avatar_group,
  supply_cap = excluded.supply_cap,
  image_key = excluded.image_key;
