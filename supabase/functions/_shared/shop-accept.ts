/** The global switch (`onchain_config.shop_accept`): which currencies the whole shop takes. */
export type ShopAccept = 'both' | 'sol' | 'crystals';
export type Currency = 'sol' | 'crystals';
export const SHOP_ACCEPT_KEY = 'shop_accept';

export interface CurrencyFlags {
  /** Per item (`shop_items.sol_enabled` / `crystals_enabled`); a missing flag reads as true. */
  sol_enabled?: boolean | null;
  crystals_enabled?: boolean | null;
}

/** The stored value; anything unknown or missing reads as `both`, so a typo never closes the shop. */
export function parseAccept(value: string | null | undefined): ShopAccept {
  return value === 'sol' || value === 'crystals' ? value : 'both';
}

/** THE rule: a currency is offered for an item only if the global value allows it AND the item flag is on. */
export function currencyOffered(accept: ShopAccept, item: CurrencyFlags, currency: Currency): boolean {
  if (accept !== 'both' && accept !== currency) return false;
  return (currency === 'sol' ? item.sol_enabled : item.crystals_enabled) !== false;
}

/** Both flags of an item, already resolved with the global value (what the lists show). */
export function resolvedCurrencies(accept: ShopAccept, item: CurrencyFlags): { sol_enabled: boolean; crystals_enabled: boolean } {
  return { sol_enabled: currencyOffered(accept, item, 'sol'), crystals_enabled: currencyOffered(accept, item, 'crystals') };
}
