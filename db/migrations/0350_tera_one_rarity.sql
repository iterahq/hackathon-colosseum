-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Tera NFT, step 1: ONE source of rarity.
--
-- `/world` (the owner's grouping, `TIER_OF` in src/content/teraLore.ts as of
-- PRs #212-#214) and `itera.shop_items.rarity` disagreed for 20 avatars. The
-- owner's grouping is the truth: the catalog takes it here, and the app reads
-- the catalog (`GET /credential-meta/tiers`) instead of keeping a second map.
--
-- * `itera.shop_items_rarity_backup`: the values every avatar row had before
--   this file (written once, never overwritten). RLS on, no policy: only the
--   service role reads it.
-- * `itera.avatar_tiers.earn_only`: legendary, mythic and primordial are never
--   for sale at any price; they come out of a day chest only.
-- * `itera.shop_items` (kind `avatar`, priced rows): rarity from the list below;
--   price, crystals price and cap follow the tier; `active` = the tier is for sale.
--
-- Rows of `itera.avatar_assets` are not touched: an avatar somebody owns stays
-- owned, and an asset minted earlier keeps the rarity written on it at mint.
-- Idempotent.
--
-- Undo:
--   update itera.shop_items i set rarity = b.rarity, price_lamports = b.price_lamports,
--     price_usd_cents = b.price_usd_cents, price_label = b.price_label, price_crystals = b.price_crystals,
--     supply_cap = b.supply_cap, active = b.active
--   from itera.shop_items_rarity_backup b where b.key = i.key;
-- ============================================================================

create table if not exists itera.shop_items_rarity_backup (
  key text primary key,
  rarity text,
  price_lamports bigint,
  price_usd_cents integer,
  price_label text,
  price_crystals integer,
  supply_cap integer,
  active boolean not null,
  saved_at timestamptz not null default now()
);
alter table itera.shop_items_rarity_backup enable row level security;
revoke all on itera.shop_items_rarity_backup from anon, authenticated;
grant select, insert on itera.shop_items_rarity_backup to service_role;

insert into itera.shop_items_rarity_backup (key, rarity, price_lamports, price_usd_cents, price_label, price_crystals, supply_cap, active)
select key, rarity, price_lamports, price_usd_cents, price_label, price_crystals, supply_cap, active
  from itera.shop_items
 where kind = 'avatar'
on conflict (key) do nothing;

insert into itera.avatar_tiers (rarity, rank, tier_name_i18n, label_i18n) values
  ('primordial', 6, '{"pt": "Tera Primordial", "en": "Primordial Tera"}', '{"pt": "Único", "en": "One of one"}')
on conflict (rarity) do nothing;

alter table itera.avatar_tiers add column if not exists earn_only boolean not null default false;
update itera.avatar_tiers set earn_only = rarity in ('legendary', 'mythic', 'primordial');

-- key -> tier, exactly the owner's grouping on /world.
update itera.shop_items as item
   set rarity = tier.rarity
  from (values
    ('brand_phoenix_full', 'primordial'),
    ('special_arco_iris', 'mythic'), ('event_space', 'mythic'),
    ('special_dourado', 'legendary'), ('special_prata', 'legendary'), ('special_verde_neon', 'legendary'), ('special_azul_eletrico', 'legendary'),
    ('special_roxo_estelar', 'legendary'), ('special_vermelho_lava', 'legendary'), ('special_preto_cosmico', 'legendary'), ('rarity_lendario', 'legendary'),
    ('base_guerreiro', 'epic'), ('base_sombrio', 'epic'), ('base_sabedoria', 'epic'), ('base_evoluido', 'epic'),
    ('event_halloween', 'epic'), ('event_natal', 'epic'), ('event_verao', 'epic'), ('rarity_epico', 'epic'),
    ('base_lider', 'rare'), ('base_mistico', 'rare'), ('base_natural', 'rare'), ('base_livre', 'rare'),
    ('base_focado', 'rare'), ('base_estudioso', 'rare'), ('base_determinado', 'rare'), ('base_disciplinado', 'rare'), ('base_focado_no_objetivo', 'rare'),
    ('base_criativo', 'rare'), ('base_analitico', 'rare'),
    ('color_roxo', 'rare'), ('color_dourado', 'rare'), ('acc_oculos_codificador', 'rare'), ('rarity_comum', 'rare'),
    ('lang_javascript', 'rare'), ('lang_python', 'rare'), ('lang_solidity', 'rare'), ('lang_rust', 'rare'), ('rarity_raro', 'rare'),
    ('base_iniciante', 'common'), ('acc_cyber_chip', 'common'), ('acc_oculos_tech', 'common'), ('acc_capuz_web3', 'common'), ('acc_chain_link', 'common'),
    ('acc_programador', 'common'), ('acc_fogueira', 'common'), ('color_azul', 'common'), ('acc_cibernetico', 'common'), ('acc_capuz_verde', 'common')
  ) as tier(key, rarity)
 where item.key = tier.key and item.kind = 'avatar';

-- Price, cap and shelf follow the tier (the free faces have no price and are left alone).
update itera.shop_items as item
   set price_usd_cents = price.cents,
       price_lamports = price.cents * 55000::bigint,
       price_label = price.label,
       supply_cap = price.cap,
       price_crystals = price.crystals,
       active = not tier.earn_only
  from (values
    ('common',     20,     'US$ 0.20 ≈ 0.0011 SOL',     null::int, 150),
    ('rare',       100,    'US$ 1.00 ≈ 0.0055 SOL',     500,       600),
    ('epic',       1000,   'US$ 10.00 ≈ 0.055 SOL',     100,       2500),
    ('legendary',  10000,  'US$ 100.00 ≈ 0.55 SOL',     25,        10000),
    ('mythic',     100000, 'US$ 1,000.00 ≈ 5.5 SOL',    5,         100000),
    ('primordial', 500000, 'US$ 5,000.00 ≈ 27.5 SOL',   1,         500000)
  ) as price(rarity, cents, label, cap, crystals)
  join itera.avatar_tiers tier on tier.rarity = price.rarity
 where item.rarity = price.rarity and item.kind = 'avatar' and item.price_lamports is not null;
