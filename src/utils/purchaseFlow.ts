/** Pure decisions of the purchase hook: what a failure means, what a timed-out confirmation means, the proof of a paid one. */
import { ShopCallError } from '@/services/shopTransport';
import { WalletSignError } from '@/services/walletSign';
import { txUrl } from '@/lib/explorer';
import type { PurchaseConfirmation } from '@/types/shop';
import { giftLabel } from '@/utils/gift';
import type { PurchaseEvent, PurchaseProof } from '@/utils/purchaseMachine';

/** Failures after the wallet answered: the payment may exist, so a retry confirms it rather than paying again. */
export const RESUMABLE_CODES: ReadonlySet<string> = new Set(['apply_failed', 'tx_not_found', 'rpc_unavailable']);

export const shortAddress = (address: string): string => `${address.slice(0, 4)}…${address.slice(-4)}`;
export const signatureOfUrl = (url: string | null): string | null => url?.match(/\/tx\/([^/?#]+)/)?.[1] ?? null;
const textOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The failure a pending confirmation turned into once the polling window closed. */
export function timedOut(last: PurchaseConfirmation): { code: string; detail: string } {
  if (last.paymentSettled) return { code: 'apply_failed', detail: `purchase-confirm: ${last.pendingCode ?? 'apply_failed'}` };
  if (last.pendingCode === 'tx_not_found') return { code: 'tx_not_found', detail: 'purchase-confirm: tx_not_found' };
  return { code: last.pendingCode ?? 'rpc_unavailable', detail: `purchase-confirm: ${last.pendingCode ?? 'pending'}` };
}

/** The wallet open in the browser is not the account's wallet: it could not sign this transaction. */
export function walletMismatch(connected: string | null, payer: string | null): ShopCallError | null {
  if (!connected || !payer || connected === payer) return null;
  return new ShopCallError(`wallet_mismatch: ${shortAddress(connected)} ≠ ${shortAddress(payer)}`, null, 'wallet_mismatch', false, `${connected} ≠ ${payer}`);
}

/** Maps whatever the wallet or the backend threw to the event the purchase machine takes. */
export function failureEvent(e: unknown): PurchaseEvent {
  const code = e instanceof ShopCallError ? e.code : null;
  const body = e instanceof ShopCallError ? e.body : null;
  const reason = e instanceof WalletSignError ? e.reason : 'failed';
  const detail = e instanceof WalletSignError ? e.detail : textOf(e);
  if (reason === 'cancelled') return { type: 'cancelled' };
  if (reason === 'no_wallet') return { type: 'no_wallet' };
  if (reason === 'insufficient' || code === 'insufficient_funds') {
    const required = body?.required_lamports;
    return { type: 'insufficient', detail, neededLamports: typeof required === 'number' ? required : null };
  }
  // The wallet's blockhash died before it sent: the intent is gone, nothing was charged.
  if (reason === 'expired') return { type: 'failed', detail, code: 'intent_expired' };
  // The wallet itself gave up (wrong network is the usual cause): said apart from a backend refusal.
  if (e instanceof WalletSignError) return { type: 'failed', detail, code: 'wallet_failed' };
  // Paid, and the item is gone for good: the backend flagged a refund.
  if (body?.refund_due === true) return { type: 'failed', detail, code: 'refund_due', explorerUrl: typeof body.explorer_url === 'string' ? body.explorer_url : null };
  return { type: 'failed', detail, code };
}

/** The proof a paid confirmation shows: the payment, the mirror write when it is another transaction, the gift. */
export function paidProof(confirmation: PurchaseConfirmation, broadcast: string | null): PurchaseProof {
  const paid = broadcast ?? signatureOfUrl(confirmation.explorerUrl);
  const gift = confirmation.gift ?? null;
  // A repeated confirm of a gift carries no `chain`: the stored write is in the gift block.
  const mirror = confirmation.chain?.signature ?? gift?.mirrorSignature ?? null;
  const mirrorUrl = confirmation.chain?.explorerUrl || gift?.mirrorExplorerUrl || (mirror ? txUrl(mirror) : '');
  return {
    signature: paid,
    chain: mirror && mirror !== paid ? { signature: mirror, explorerUrl: mirrorUrl } : null,
    gift: gift ? { name: giftLabel(gift.toName, gift.toWallet), lives: gift.recipientLives, max: gift.recipientMax, companionExplorerUrl: gift.companionExplorerUrl } : null,
    imageUrl: confirmation.imageUrl ?? null,
    written: (confirmation.written ?? []).map((w) => ({ attribute: w.attribute, value: w.value })),
    lives: confirmation.lives ? { current: confirmation.lives.current, max: confirmation.lives.max } : null,
    circuitStamps: confirmation.circuit?.stampsFunded ?? null,
  };
}
