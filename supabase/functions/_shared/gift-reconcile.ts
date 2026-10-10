import type { IteraClient } from './db.ts';
import { GIFT_COLUMNS, deliverGift, settleActionGift, type GiftRow } from './gift-store.ts';
import { RECONCILE_MIN_AGE_MS, findPayment, isAbandoned, type SignatureInfo } from './gift.ts';
import { settlePurchase } from './purchase-settle.ts';
import { rpc } from './rpc.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GIFTS = 4;
const SIGNATURES_PER_WALLET = 25;
/** A background reconcile has no reader waiting for the chain proof. */
const MIRROR_WAIT_MS = 0;

export interface ReconcileScope {
  /** Gifts on their way to this learner. */
  toUserId?: string;
  /** Gifts this wallet opened. */
  fromWallet?: string;
}

async function settle(db: IteraClient, gift: GiftRow, signature: string): Promise<boolean> {
  if (gift.source === 'action') {
    await settleActionGift(db, gift.id, gift.from_wallet, signature, MIRROR_WAIT_MS);
    return true;
  }
  if (!gift.from_user_id) return false;
  // The in-app path settles through its purchase, exactly as `purchase-confirm` would for the payer.
  const settlement = await settlePurchase(
    db,
    { iteraUserId: gift.from_user_id, wallet: gift.from_wallet, walletSource: null },
    { intentId: gift.id, signature, lang: 'pt' },
  );
  return settlement.status === 200;
}

/**
 * The safety net for a gift whose confirm never arrived (the blink client was
 * closed, the tab died): looks the intent id up among the payer's recent
 * transactions, where the payment carries it as a memo, and settles what it
 * finds. A paid gift whose life is still due is delivered too. Idempotent on
 * the signature and on the intent; never throws. Returns how many gifts landed.
 * `minAgeMs` leaves alone a gift so young that its own confirm is probably on its way.
 */
export async function reconcileGifts(db: IteraClient, scope: ReconcileScope, minAgeMs = RECONCILE_MIN_AGE_MS): Promise<number> {
  try {
    if (!scope.toUserId && !scope.fromWallet) return 0;
    const now = new Date();
    let query = db
      .from('gifts')
      .select(GIFT_COLUMNS)
      .in('status', ['pending', 'paid'])
      .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_GIFTS);
    query = scope.toUserId ? query.eq('to_user_id', scope.toUserId) : query.eq('from_wallet', scope.fromWallet as string);
    const { data, error } = await query;
    if (error) throw new Error(`gifts reconcile: ${error.message}`);

    const recentByWallet = new Map<string, SignatureInfo[]>();
    let landed = 0;
    for (const gift of (data ?? []) as GiftRow[]) {
      try {
        if (gift.status === 'paid' && gift.tx_signature) {
          if (gift.source === 'action') await deliverGift(db, gift, gift.tx_signature, MIRROR_WAIT_MS);
          else await settle(db, gift, gift.tx_signature);
          landed += 1;
          continue;
        }
        if (now.getTime() - new Date(gift.created_at).getTime() < minAgeMs) continue;
        let recent = recentByWallet.get(gift.from_wallet);
        if (!recent) {
          recent = await rpc<SignatureInfo[]>('getSignaturesForAddress', [gift.from_wallet, { limit: SIGNATURES_PER_WALLET, commitment: 'confirmed' }]);
          recentByWallet.set(gift.from_wallet, recent);
        }
        const signature = findPayment(recent, gift.id);
        if (signature) {
          if (await settle(db, gift, signature)) landed += 1;
        } else if (isAbandoned(gift, now)) {
          await db.from('gifts').update({ status: 'expired' }).eq('id', gift.id).eq('status', 'pending');
        }
      } catch (failure) {
        console.error(`gift ${gift.id} reconcile failed`, failure);
      }
    }
    return landed;
  } catch (failure) {
    console.error('gift reconcile failed', failure);
    return 0;
  }
}

/** The reconcile with a ceiling on how long the caller waits; past it the work goes on in the background. */
export async function reconcileGiftsWithin(db: IteraClient, scope: ReconcileScope, budgetMs: number): Promise<void> {
  const work = reconcileGifts(db, scope);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(work);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]);
  clearTimeout(timer);
}
