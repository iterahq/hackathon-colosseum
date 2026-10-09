/**
 * One purchase from the learner's wallet: intent -> wallet signature -> confirmation (polled while
 * pending) -> caches refreshed. The phases live in `purchaseMachine`; this hook only runs the calls.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { confirmPurchase, createPurchaseIntent, requestFaucet } from '@/services/shop.service';
import { ShopCallError } from '@/services/shopTransport';
import { WalletSignError, connectWallet, signAndSendPurchase } from '@/services/walletSign';
import type { CompanionSnapshot, PurchaseConfirmation } from '@/types/shop';
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
  const last = useRef<{ itemKey: string; refId?: string } | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const settle = useCallback(
    (confirmation: PurchaseConfirmation) => {
      const key = queryKeys.companion.mine(userId);
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
    },
    [queryClient, userId]
  );

  const buy = useCallback(
    async (itemKey: string, refId?: string) => {
      if (running.current) return;
      running.current = true;
      last.current = { itemKey, refId };
      dispatch({ type: 'start', itemKey });
      try {
        await connectWallet();
        const intent = await createPurchaseIntent(itemKey, refId);
        if (!alive.current) return;
        dispatch({ type: 'connected' });
        const signature = await signAndSendPurchase(intent);
        if (!alive.current) return;
        dispatch({ type: 'signed' });
        const deadline = Date.now() + POLL_LIMIT_MS;
        let confirmation = await confirmPurchase(intent.intentId, signature, locale);
        while (confirmation.status === 'pending' && Date.now() < deadline && alive.current) {
          await wait(POLL_MS);
          confirmation = await confirmPurchase(intent.intentId, signature, locale);
        }
        if (!alive.current) return;
        if (confirmation.status === 'paid') {
          settle(confirmation);
          dispatch({
            type: 'paid',
            explorerUrl: confirmation.explorerUrl ?? confirmation.chain?.explorerUrl ?? null,
            proof: {
              signature: confirmation.chain?.signature ?? signature,
              imageUrl: confirmation.imageUrl ?? null,
              written: (confirmation.written ?? []).map((w) => ({ attribute: w.attribute, value: w.value })),
              lives: confirmation.lives ? { current: confirmation.lives.current, max: confirmation.lives.max } : null,
            },
          });
          onPaid?.(itemKey);
        } else {
          dispatch({ type: 'failed', detail: `purchase-confirm: ${confirmation.status}`, code: confirmation.status === 'expired' ? 'intent_expired' : null });
        }
      } catch (e) {
        if (!alive.current) return;
        const code = e instanceof ShopCallError ? e.code : null;
        const reason = e instanceof WalletSignError ? e.reason : 'failed';
        const detail = e instanceof WalletSignError ? e.detail : textOf(e);
        if (reason === 'cancelled') dispatch({ type: 'cancelled' });
        else if (reason === 'no_wallet') dispatch({ type: 'no_wallet' });
        else if (reason === 'insufficient' || code === 'insufficient_funds') dispatch({ type: 'insufficient', detail });
        else {
          if (code) console.warn('[purchase]', detail);
          dispatch({ type: 'failed', detail, code });
        }
      } finally {
        running.current = false;
      }
    },
    [locale, onPaid, settle]
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
    void buy(again.itemKey, again.refId);
  }, [buy]);

  const retry = useCallback(() => {
    const again = last.current;
    dispatch({ type: 'reset' });
    if (again) void buy(again.itemKey, again.refId);
  }, [buy]);

  return { state, busy: isPurchaseBusy(state), buy, fund, retry, reset: useCallback(() => dispatch({ type: 'reset' }), []) };
}
