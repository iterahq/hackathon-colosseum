import { ITEM_HANDLERS, type ItemHandler } from './shop-items.ts';

/**
 * What crystals can buy: every kind a payment buys, through the same handlers,
 * plus the theme kinds. A gift is not here: crystals do not move between learners.
 */
export const CRYSTAL_HANDLERS: Record<string, ItemHandler | undefined> = {
  life: ITEM_HANDLERS.life,
  outfit: ITEM_HANDLERS.outfit,
  ink: ITEM_HANDLERS.ink,
  frame: ITEM_HANDLERS.frame,
  background: ITEM_HANDLERS.background,
  app_icon: ITEM_HANDLERS.app_icon,
  border: ITEM_HANDLERS.border,
  // A collectible avatar goes through the SAME apply as a paid one: the `avatar_assets` row, the serial, the mint, what it includes.
  avatar: ITEM_HANDLERS.avatar,
};
