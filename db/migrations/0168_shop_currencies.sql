-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Shop v3, owner decision of 2026-10-10: every item is sold for SOL AND for
-- crystals; which currency prevails is decided later, as data.
--
-- * `itera.shop_items.sol_enabled` / `crystals_enabled` (default true): per item.
-- * `itera.onchain_config` key `shop_accept` = `both` | `sol` | `crystals`
--   (default `both`): global. A currency is offered for an item only when the
--   global value allows it AND the item's flag is true (`_shared/shop-accept.ts`).
-- * Crystal prices of the dearest avatars: legendary 10 000, mythic 100 000,
--   primordial 500 000 (1 crystal = 1 US cent of list price, like the others).
-- * Not for sale in a currency: `life_gift` (crystals), the free things (the
--   default background / icon / border, the free avatars) and the signature
--   borders (both: they only come with their avatar).
--
-- Flip the whole shop to one currency:
--   update itera.onchain_config set value = 'sol'      where key = 'shop_accept';
--   update itera.onchain_config set value = 'crystals' where key = 'shop_accept';
--   (and back: ... set value = 'both' ...)
-- Idempotent.
-- ============================================================================

alter table itera.shop_items add column if not exists sol_enabled boolean not null default true;
alter table itera.shop_items add column if not exists crystals_enabled boolean not null default true;

insert into itera.onchain_config (key, value) values ('shop_accept', 'both') on conflict (key) do nothing;

update itera.shop_items set price_crystals = 10000  where kind = 'avatar' and rarity = 'legendary' and price_lamports is not null;
update itera.shop_items set price_crystals = 100000 where kind = 'avatar' and rarity = 'mythic' and price_lamports is not null;
update itera.shop_items set price_crystals = 500000 where kind = 'avatar' and rarity = 'primordial' and price_lamports is not null;

update itera.shop_items set crystals_enabled = false where key = 'life_gift';

-- Nothing to buy: free avatars, default theme items, signature borders (no price at all).
update itera.shop_items
   set sol_enabled = false, crystals_enabled = false
 where (kind in ('avatar', 'border') and price_lamports is null)
    or (kind in ('background', 'app_icon', 'border') and coalesce(effect->>'default', 'false') = 'true');
