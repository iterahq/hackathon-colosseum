/** Tera's shop: the item list and the purchase rail (intent -> wallet signature -> confirm), plus the devnet faucet. */
import { toConfirmation, toFaucet, toIntent, toShopItems } from '@/services/shopNormalize';
import { callShop } from '@/services/shopTransport';
import type { FaucetResult, PurchaseConfirmation, PurchaseIntent, ShopItem } from '@/types/shop';

export async function getShopItems(lang: string): Promise<ShopItem[]> {
  const { data } = await callShop('shop-items', { method: 'GET', query: { lang } });
  return toShopItems(data);
}

/** `refId` is the certification page (trail_pass row id) an ink or frame is bought for. */
export async function createPurchaseIntent(itemKey: string, refId?: string): Promise<PurchaseIntent> {
  const { data } = await callShop('purchase-intent', { body: refId ? { item_key: itemKey, ref_id: refId } : { item_key: itemKey } });
  return toIntent(data);
}

export async function confirmPurchase(intentId: string, signature: string): Promise<PurchaseConfirmation> {
  const { data } = await callShop('purchase-confirm', { body: { intent_id: intentId, signature } });
  return toConfirmation(data);
}

export async function requestFaucet(): Promise<FaucetResult> {
  const { data } = await callShop('wallet-faucet', { body: {} });
  return toFaucet(data);
}
