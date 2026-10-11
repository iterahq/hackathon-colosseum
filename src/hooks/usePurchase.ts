/**
 * One purchase from the learner's wallet: intent -> wallet signature -> confirmation (polled while
 * pending) -> caches refreshed. The phases live in `purchaseMachine`, the decisions in `purchaseFlow`;
 * this hook only runs the calls.
 *
 * Once the wallet has answered, the signature is kept: "try again" on a delivery or lookup failure
 * confirms THAT payment again instead of asking the wallet for a second one.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { confirmPurchase, createPurchaseIntent, requestFaucet, submitPurchase } from '@/services/shop.service';
import { ShopCallError } from '@/services/shopTransport';
import { txUrl } from '@/lib/explorer';
import { bumpCredentialArt } from '@/services/credential.service';
import { connectWallet, signAndSendPurchase } from '@/services/walletSign';
import type { PurchaseOrder, WalletPayment } from '@/types/purchaseFlow';
import type { CompanionSnapshot, PurchaseConfirmation } from '@/types/shop';
import { RESUMABLE_CODES, failureEvent, paidProof, timedOut, walletMismatch } from '@/utils/purchaseFlow';
import { PURCHASE_IDLE, isPurchaseBusy, purchaseReducer } from '@/utils/purchaseMachine';

const POLL_MS = 1500;
const POLL_LIMIT_MS = 30_000;
const FUNDING_SETTLE_MS = 2500;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const textOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function usePurchase({ onPaid }: { onPaid?: (itemKey: string) => void } = {}) {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(purchaseReducer, PURCHASE_IDLE);
  const userId = session?.user?.id ?? 'anon';
  const last = useRef<PurchaseOrder | null>(null);
  const payment = useRef<WalletPayment | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const settle = useCallback(
    (confirmation: PurchaseConfirmation) => {
      const key = queryKeys.companion.mine(userId);
      bumpCredentialArt();
      queryClient.setQueryData<CompanionSnapshot>(key, (prev) =>
        prev
          ? {
              ...prev,
              lives: confirmation.lives ?? prev.lives,
              companion: confirmation.companion ?? prev.companion,
              inventory: confirmation.inventory ?? prev.inventory,
            }
          : prev
      );
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.achievements.mine(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.circuit.all });
    },
    [queryClient, userId]
  );

  /** Verifies the payment with the backend until it is paid, expired or the window closes. */
  const finish = useCallback(
    async ({ itemKey, intentId, signed }: WalletPayment) => {
      const signedTransaction = signed.kind === 'signed' ? signed.signedTransaction : '';
      let broadcast = signed.kind === 'sent' ? signed.signature : null;
      const verify = async () => {
        if (broadcast) return confirmPurchase(intentId, broadcast, locale);
        try {
          return await submitPurchase(intentId, signedTransaction, locale);
        } catch (e) {
          // Already broadcast: the transaction exists, so confirm it by signature instead of failing.
          if (e instanceof ShopCallError && e.signature) {
            broadcast = e.signature;
            payment.current = { itemKey, intentId, signed: { kind: 'sent', signature: e.signature } };
            return confirmPurchase(intentId, e.signature, locale);
          }
          throw e instanceof ShopCallError ? new ShopCallError(`sign-only path -> ${e.message}`, e.status, e.code, e.retryable, e.detail, null, e.body) : e;
        }
      };
      const deadline = Date.now() + POLL_LIMIT_MS;
      let confirmation = await verify();
      while (confirmation.status === 'pending' && Date.now() < deadline && alive.current) {
        await wait(POLL_MS);
        confirmation = await verify();
      }
      if (!alive.current) return;
      if (confirmation.status === 'paid') {
        payment.current = null;
        settle(confirmation);
        dispatch({ type: 'paid', explorerUrl: confirmation.explorerUrl ?? confirmation.chain?.explorerUrl ?? null, proof: paidProof(confirmation, broadcast) });
        onPaid?.(itemKey);
      } else if (confirmation.status === 'expired') {
        // Nothing landed and nothing can: the next try starts a fresh intent.
        payment.current = null;
        dispatch({ type: 'failed', detail: 'purchase-confirm: expired', code: 'intent_expired' });
      } else {
        dispatch({ type: 'failed', ...timedOut(confirmation), explorerUrl: confirmation.explorerUrl ?? (broadcast ? txUrl(broadcast) : null) });
      }
    },
    [locale, onPaid, settle]
  );

  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      try {
        await work();
      } catch (e) {
        if (alive.current) dispatch(failureEvent(e));
      } finally {
        running.current = false;
      }
    },
    []
  );

  const buy = useCallback(
    (itemKey: string, refId?: string, recipient?: string) =>
      run(async () => {
        last.current = { itemKey, refId, recipient };
        payment.current = null;
        dispatch({ type: 'start', itemKey });
        const connected = await connectWallet();
        const intent = await createPurchaseIntent(itemKey, refId, recipient);
        if (!alive.current) return;
        const mismatch = walletMismatch(connected, intent.payer);
        if (mismatch) throw mismatch;
        dispatch({ type: 'connected' });
        const signed = await signAndSendPurchase(intent);
        if (!alive.current) return;
        payment.current = { itemKey, intentId: intent.intentId, signed };
        dispatch({ type: 'signed' });
        await finish(payment.current);
      }),
    [finish, run]
  );

  /** Confirms the payment the wallet already made, without a new wallet prompt. */
  const resume = useCallback(
    (pending: WalletPayment) =>
      run(async () => {
        dispatch({ type: 'start', itemKey: pending.itemKey });
        dispatch({ type: 'connected' });
        dispatch({ type: 'signed' });
        await finish(pending);
      }),
    [finish, run]
  );

  /** Devnet only: ask the faucet for test SOL, then run the same purchase again. */
  const fund = useCallback(async () => {
    const again = last.current;
    if (!again || running.current) return;
    dispatch({ type: 'funding' });
    try {
      const result = await requestFaucet();
      if (!alive.current) return;
      if (result.blocked !== null) return dispatch({ type: 'funding_failed', detail: `wallet-faucet: ${result.blocked}`, code: result.blocked });
      await wait(FUNDING_SETTLE_MS);
    } catch (e) {
      if (alive.current) dispatch({ type: 'funding_failed', detail: textOf(e), code: e instanceof ShopCallError ? e.code : null });
      return;
    }
    if (!alive.current) return;
    dispatch({ type: 'cancelled' });
    void buy(again.itemKey, again.refId, again.recipient);
  }, [buy]);

  const retry = useCallback(() => {
    const again = last.current;
    const pending = payment.current;
    const resumable = pending !== null && state.code !== null && RESUMABLE_CODES.has(state.code);
    dispatch({ type: 'reset' });
    if (resumable) void resume(pending);
    else if (again) void buy(again.itemKey, again.refId, again.recipient);
  }, [buy, resume, state.code]);

  return { state, busy: isPurchaseBusy(state), buy, fund, retry, reset: useCallback(() => dispatch({ type: 'reset' }), []) };
}
