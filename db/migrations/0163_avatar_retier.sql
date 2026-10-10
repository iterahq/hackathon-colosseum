-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop v3, step 1: the avatar pyramid is re-tiered (owner's brief of 2026-10-10).
--
-- * `itera.avatar_tiers`: a sixth tier, `primordial` (one of one), and the new
--   labels of `epic` and `mythic`.
-- * `itera.shop_items` (kind `avatar`): rarity, price and cap follow the tier
--   table; every avatar sold for crystals gets `price_crystals`
--   (common 150, rare 600, epic 2 500; legendary and above are money only).
-- * Ígnio (`special_vermelho_lava`) is the same picture as Ardo: inactive, never deleted.
-- * `brand_phoenix_full` (Fênix Primordial) is inserted INACTIVE: its art is not
--   published as a chip yet. Switching it on is one UPDATE.
--
-- Rows of `itera.avatar_assets` are not touched: an avatar somebody owns stays
-- owned, whatever its tier is now. Idempotent.
-- ============================================================================

insert into itera.avatar_tiers (rarity, rank, tier_name_i18n, label_i18n) values
  ('primordial', 6, '{"pt": "Tera Primordial", "en": "Primordial Tera"}', '{"pt": "Único", "en": "One of one"}')
on conflict (rarity) do update set
  rank = excluded.rank,
  tier_name_i18n = excluded.tier_name_i18n,
  label_i18n = excluded.label_i18n;

update itera.avatar_tiers set label_i18n = '{"pt": "Muito raro", "en": "Epic"}' where rarity = 'epic';
update itera.avatar_tiers set label_i18n = '{"pt": "Mítico", "en": "Mythic"}' where rarity = 'mythic';

-- The Fênix Primordial row (inactive until its art is published).
insert into itera.shop_items (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, active, sort, rarity, avatar_group, supply_cap, image_key)
values ('brand_phoenix_full', 'avatar', 27500000000, 500000, 'US$ 5,000.00 ≈ 27.5 SOL',
        '{"pt": "Fênix Primordial", "en": "Primordial Phoenix"}', '{"pt": "A única. A fênix que renasce.", "en": "The only one. The phoenix that is reborn."}',
        false, 1700, 'primordial', 'brand', 1, 'brand_phoenix_full')
on conflict (key) do nothing;

-- key -> tier. Lore names in comments.
update itera.shop_items as item
   set rarity = tier.rarity
  from (values
    ('base_iniciante', 'common'), ('base_focado', 'common'), ('base_estudioso', 'common'), ('base_determinado', 'common'),
    ('base_disciplinado', 'common'), ('base_criativo', 'common'), ('base_analitico', 'common'),
    ('acc_cyber_chip', 'common'), ('acc_oculos_tech', 'common'), ('acc_capuz_web3', 'common'), ('acc_chain_link', 'common'), ('acc_programador', 'common'),
    ('base_lider', 'rare'), ('base_natural', 'rare'), ('base_livre', 'rare'),
    ('base_focado_no_objetivo', 'epic'), ('base_mistico', 'epic'), ('special_azul_eletrico', 'epic'), ('special_roxo_estelar', 'epic'),
    ('special_dourado', 'epic'), ('special_prata', 'epic'), ('special_verde_neon', 'epic'),
    ('base_guerreiro', 'legendary'), ('base_sombrio', 'legendary'), ('base_evoluido', 'legendary'), ('special_preto_cosmico', 'legendary'),
    ('event_halloween', 'legendary'), ('event_natal', 'legendary'), ('event_verao', 'legendary'),
    ('base_sabedoria', 'mythic'), ('special_arco_iris', 'mythic'), ('event_space', 'mythic')
  ) as tier(key, rarity)
 where item.key = tier.key and item.kind = 'avatar';

-- Price and cap follow the tier (the free expressions have no price and are left alone).
update itera.shop_items as item
   set price_usd_cents = price.cents,
       price_lamports = price.cents * 55000::bigint,
       price_label = price.label,
       supply_cap = price.cap,
       price_crystals = price.crystals
  from (values
    ('common',    20,     'US$ 0.20 ≈ 0.0011 SOL',      null::int, 150),
    ('rare',      100,    'US$ 1.00 ≈ 0.0055 SOL',      500,       600),
    ('epic',      1000,   'US$ 10.00 ≈ 0.055 SOL',      100,       2500),
    ('legendary', 10000,  'US$ 100.00 ≈ 0.55 SOL',      25,        null::int),
    ('mythic',    100000, 'US$ 1,000.00 ≈ 5.5 SOL',     5,         null::int),
    ('primordial', 500000, 'US$ 5,000.00 ≈ 27.5 SOL',   1,         null::int)
  ) as price(rarity, cents, label, cap, crystals)
 where item.kind = 'avatar' and item.rarity = price.rarity and item.price_lamports is not null;

-- Ígnio is Ardo's picture: off the shelf, row kept.
update itera.shop_items set active = false where key = 'special_vermelho_lava';
