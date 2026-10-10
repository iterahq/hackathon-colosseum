/** Tera's shop: the item list and the purchase rail (intent -> wallet signature -> confirm), plus the devnet faucet. */
import { toConfirmation, toFaucet, toIntent, toShopItems } from '@/services/shopNormalize';
import { ShopCallError, callShop } from '@/services/shopTransport';
import type { FaucetResult, PurchaseConfirmation, PurchaseIntent, ShopItem } from '@/types/shop';

export async function getShopItems(lang: string): Promise<ShopItem[]> {
  const { data } = await callShop('shop-items', { method: 'GET', query: { lang } });
  return toShopItems(data);
}

/** `refId` is the trail (unit id) whose certification an ink or frame is bought for. */
export async function createPurchaseIntent(itemKey: string, refId?: string, recipient?: string): Promise<PurchaseIntent> {
  // `recipient` is the wallet a gift is for; the backend ignores it for every other item.
  const { data } = await callShop('purchase-intent', { body: { item_key: itemKey, ...(refId ? { ref_id: refId } : {}), ...(recipient ? { recipient } : {}) } });
  return toIntent(data);
}

const UNSETTLED: PurchaseConfirmation = { status: 'pending', itemKey: null, lives: null, companion: null, inventory: null, explorerUrl: null };

/** Retryable backend answers come back as `pending`; an expired intent as `expired`; anything else throws. */
async function settle(fn: 'purchase-confirm' | 'purchase-submit', body: Record<string, unknown>): Promise<PurchaseConfirmation> {
  try {
    const { data } = await callShop(fn, { body });
    return toConfirmation(data);
  } catch (e) {
    if (!(e instanceof ShopCallError)) throw e;
    if (e.retryable) return UNSETTLED;
    if (e.code === 'intent_expired') return { ...UNSETTLED, status: 'expired' };
    throw e;
  }
}

/**
 * Asks the backend to verify the payment. A retryable error (`tx_not_found` while the cluster has
 * not seen the transaction, `apply_failed`, `rpc_unavailable`) comes back as `pending`: call again.
 */
export const confirmPurchase = (intentId: string, signature: string, lang: string) => settle('purchase-confirm', { intent_id: intentId, signature, lang });

/** For a wallet that only signed: the backend broadcasts `signedTransaction` (base64), then answers like `purchase-confirm`. Idempotent. */
export const submitPurchase = (intentId: string, signedTransaction: string, lang: string) => settle('purchase-submit', { intent_id: intentId, signed_transaction: signedTransaction, lang });

export async function requestFaucet(): Promise<FaucetResult> {
  const { data } = await callShop('wallet-faucet', { body: {} });
  return toFaucet(data);
}
