/** Tera's shop: the item list and the purchase rail (intent -> wallet signature -> confirm), plus the devnet faucet. */
import { toConfirmation, toFaucet, toIntent, toShopItems } from '@/services/shopNormalize';
import { ShopCallError, callShop } from '@/services/shopTransport';
import type { FaucetResult, PurchaseConfirmation, PurchaseIntent, ShopItem } from '@/types/shop';

export async function getShopItems(lang: string): Promise<ShopItem[]> {
  const { data } = await callShop('shop-items', { method: 'GET', query: { lang } });
  return toShopItems(data);
}

/** `refId` is the trail (unit id) whose certification an ink or frame is bought for. */
export async function createPurchaseIntent(itemKey: string, refId?: string): Promise<PurchaseIntent> {
  const { data } = await callShop('purchase-intent', { body: refId ? { item_key: itemKey, ref_id: refId } : { item_key: itemKey } });
  return toIntent(data);
}

const UNSETTLED: PurchaseConfirmation = { status: 'pending', itemKey: null, lives: null, companion: null, inventory: null, explorerUrl: null };

/**
 * Asks the backend to verify the payment. A retryable error (`tx_not_found` while the cluster has
 * not seen the transaction, `apply_failed`, `rpc_unavailable`) comes back as `pending`: call again.
 */
export async function confirmPurchase(intentId: string, signature: string, lang: string): Promise<PurchaseConfirmation> {
  try {
    const { data } = await callShop('purchase-confirm', { body: { intent_id: intentId, signature, lang } });
    return toConfirmation(data);
  } catch (e) {
    if (!(e instanceof ShopCallError)) throw e;
    if (e.retryable) return UNSETTLED;
    if (e.code === 'intent_already_paid') return { ...UNSETTLED, status: 'paid' };
    if (e.code === 'intent_expired') return { ...UNSETTLED, status: 'expired' };
    throw e;
  }
}

export async function requestFaucet(): Promise<FaucetResult> {
  const { data } = await callShop('wallet-faucet', { body: {} });
  return toFaucet(data);
}
