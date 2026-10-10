/**
 * One purchase from the learner's wallet: intent -> wallet signature -> confirmation (polled while
 * pending) -> caches refreshed. The phases live in `purchaseMachine`; this hook only runs the calls.
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
import { WalletSignError, connectWallet, signAndSendPurchase } from '@/services/walletSign';
import type { CompanionSnapshot, PurchaseConfirmation } from '@/types/shop';
import { giftLabel } from '@/utils/gift';
import { PURCHASE_IDLE, isPurchaseBusy, purchaseReducer } from '@/utils/purchaseMachine';

const POLL_MS = 1500;
const POLL_LIMIT_MS = 30_000;
const FUNDING_SETTLE_MS = 2500;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const signatureOf = (url: string | null): string | null => url?.match(/\/tx\/([^/?#]+)/)?.[1] ?? null;
const textOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function usePurchase({ onPaid }: { onPaid?: (itemKey: string) => void } = {}) {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(purchaseReducer, PURCHASE_IDLE);
  const userId = session?.user?.id ?? 'anon';
  const last = useRef<{ itemKey: string; refId?: string; recipient?: string } | null>(null);
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
    },
    [queryClient, userId]
  );

  const buy = useCallback(
    async (itemKey: string, refId?: string, recipient?: string) => {
      if (running.current) return;
      running.current = true;
      last.current = { itemKey, refId, recipient };
      dispatch({ type: 'start', itemKey });
      try {
        await connectWallet();
        const intent = await createPurchaseIntent(itemKey, refId, recipient);
        if (!alive.current) return;
        dispatch({ type: 'connected' });
        const signed = await signAndSendPurchase(intent);
        if (!alive.current) return;
        dispatch({ type: 'signed' });
        // A wallet that only signed hands the broadcast to the backend; the answer is the same either way.
        const signedTransaction = signed.kind === 'signed' ? signed.signedTransaction : '';
        let broadcast = signed.kind === 'sent' ? signed.signature : null;
        const verify = async () => {
          if (broadcast) return confirmPurchase(intent.intentId, broadcast, locale);
          try {
            return await submitPurchase(intent.intentId, signedTransaction, locale);
          } catch (e) {
            // Already broadcast: the transaction exists, so confirm it by signature instead of failing.
            if (e instanceof ShopCallError && e.signature) {
              broadcast = e.signature;
              return confirmPurchase(intent.intentId, e.signature, locale);
            }
            throw e instanceof ShopCallError ? new ShopCallError(`sign-only path -> ${e.message}`, e.status, e.code, e.retryable, e.detail) : e;
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
          settle(confirmation);
          const payment = broadcast ?? signatureOf(confirmation.explorerUrl);
          const gift = confirmation.gift ?? null;
          // A repeated confirm of a gift carries no `chain`: the stored write is in the gift block.
          const mirror = confirmation.chain?.signature ?? gift?.mirrorSignature ?? null;
          const mirrorUrl = confirmation.chain?.explorerUrl || gift?.mirrorExplorerUrl || (mirror ? txUrl(mirror) : '');
          dispatch({
            type: 'paid',
            explorerUrl: confirmation.explorerUrl ?? confirmation.chain?.explorerUrl ?? null,
            proof: {
              signature: payment,
              chain: mirror && mirror !== payment ? { signature: mirror, explorerUrl: mirrorUrl } : null,
              gift: gift ? { name: giftLabel(gift.toName, gift.toWallet), lives: gift.recipientLives, max: gift.recipientMax, companionExplorerUrl: gift.companionExplorerUrl } : null,
              imageUrl: confirmation.imageUrl ?? null,
              written: (confirmation.written ?? []).map((w) => ({ attribute: w.attribute, value: w.value })),
              lives: confirmation.lives ? { current: confirmation.lives.current, max: confirmation.lives.max } : null,
              circuitStamps: confirmation.circuit?.stampsFunded ?? null,
            },
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.circuit.all });
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
        else if (reason === 'insufficient' || code === 'insufficient_funds') {
          const required = e instanceof ShopCallError ? e.body?.required_lamports : null;
          dispatch({ type: 'insufficient', detail, neededLamports: typeof required === 'number' ? required : null });
        }
        else {
          if (code) console.warn('[purchase]', detail);
          dispatch({ type: 'failed', detail, code });
        }
      } finally {
        running.current = false;
      }
    },
    [locale, onPaid, queryClient, settle]
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
    dispatch({ type: 'reset' });
    if (again) void buy(again.itemKey, again.refId, again.recipient);
  }, [buy]);

  return { state, busy: isPurchaseBusy(state), buy, fund, retry, reset: useCallback(() => dispatch({ type: 'reset' }), []) };
}
