/** Phoenix Crystals: balance, prices, ledger, the learner's theme. `crystals` edge function; mock behind `?mockShop=1`. */
import { mockCrystalsCall } from '@/services/crystalsMock';
import { toCrystals, toSpend, toTheme } from '@/services/crystalsNormalize';
import { callShop, mockForced } from '@/services/shopTransport';
import type { CrystalsSnapshot, SpendResult, Theme } from '@/types/crystals';

async function call(fn: 'crystals' | 'crystals/spend' | 'crystals/equip', options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string> }): Promise<{ data: unknown; mocked: boolean }> {
  if (mockForced()) return { data: mockCrystalsCall(fn, options.body ?? {}), mocked: true };
  return callShop(fn, options);
}

export async function getCrystals(lang: string): Promise<CrystalsSnapshot> {
  const { data, mocked } = await call('crystals', { method: 'GET', query: { lang } });
  return toCrystals(data, mocked);
}

/** Pays with crystals: no wallet. Throws `ShopCallError` with `code` `insufficient_crystals` (body `{ balance, price }`), `already_owned`, `not_for_crystals`... */
export async function spendCrystals(itemKey: string, lang: string, { qty, refId }: { qty?: number; refId?: string } = {}): Promise<SpendResult> {
  const body: Record<string, unknown> = { item_key: itemKey, lang };
  if (qty !== undefined) body.qty = qty;
  if (refId) body.ref_id = refId;
  const { data } = await call('crystals/spend', { body });
  return toSpend(data, itemKey);
}

/** Equips an owned background, icon colour or border; answers the whole theme. */
export async function equipTheme(choice: { background?: string; icon?: string; border?: string }): Promise<Theme> {
  const { data } = await call('crystals/equip', { body: choice });
  return toTheme((data as { theme?: unknown } | null)?.theme);
}
