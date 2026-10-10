import { GLOBAL_REF } from './awards.ts';
import { isThemeDefault } from './crystals.ts';
import { ITEM_HANDLERS, type ItemHandler, type ShopContext } from './shop-items.ts';

async function ownsTheme({ db, userId, item }: ShopContext): Promise<boolean> {
  const { data, error } = await db.from('user_inventory').select('qty').eq('user_id', userId).eq('item_key', item.key).eq('ref_id', GLOBAL_REF).gt('qty', 0).maybeSingle();
  if (error) throw new Error(`user_inventory: ${error.message}`);
  return data !== null;
}

/** A background, an app icon colour or a profile border: global, owned once, worn through `POST /crystals/equip`. */
const themeItem: ItemHandler = {
  async canBuy(context) {
    if (context.refId !== GLOBAL_REF) return { ok: false, error: 'invalid_ref' };
    // The default is everybody's: there is nothing to buy.
    return isThemeDefault(context.item) || (await ownsTheme(context)) ? { ok: false, error: 'already_owned' } : { ok: true };
  },
  async apply({ db, userId, item }) {
    const { error } = await db.from('user_inventory').upsert({ user_id: userId, item_key: item.key, ref_id: GLOBAL_REF, qty: 1, updated_at: new Date().toISOString() });
    if (error) throw new Error(`user_inventory grant: ${error.message}`);
    return { companion: false, passport: null, chain: null };
  },
};

/**
 * What crystals can buy: every kind a payment buys, through the same handlers,
 * plus the theme kinds. A gift is not here: crystals do not move between learners.
 */
export const CRYSTAL_HANDLERS: Record<string, ItemHandler | undefined> = {
  life: ITEM_HANDLERS.life,
  outfit: ITEM_HANDLERS.outfit,
  ink: ITEM_HANDLERS.ink,
  frame: ITEM_HANDLERS.frame,
  background: themeItem,
  app_icon: themeItem,
  border: themeItem,
  // A collectible avatar goes through the SAME apply as a paid one: the `avatar_assets` row, the serial, the mint, what it includes.
  avatar: ITEM_HANDLERS.avatar,
};
