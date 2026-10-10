/**
 * Paying an item with crystals (`POST /crystals/spend`). Under `?mockShop=1` the foundation's crystals mock answers
 * for theme items; the shop mock covers the rest of its catalogue (outfits, avatars, life packs, inks).
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCrystals } from '@/hooks/useCrystals';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { spendCrystals } from '@/services/crystals.service';
import { mockSpendCrystals } from '@/services/shopMock';
import { ShopCallError, mockForced } from '@/services/shopTransport';
import type { ShopItem } from '@/types/shop';
import type { PurchaseState } from '@/utils/purchaseMachine';

/** A 402: the learner is short of crystals. Drives the notice with the real numbers. */
export interface CrystalFailure {
  code: 'insufficient_crystals';
  itemKey: string;
  price: number;
  balance: number;
}

export interface CrystalPurchase {
  /** `onPayWithCrystals(item, refId?)`: the ink or frame goes on one certification, named by `refId`. */
  pay: (item: ShopItem, refId?: string) => void;
  busy: boolean;
  /** The crystal balance when known. */
  balance: number | null;
  /** Success or failure moment, in the same shape the wallet purchase dialog takes. */
  state: PurchaseState;
  failure: CrystalFailure | null;
  /** Repeats the last payment (a retryable `apply_failed` completes for free). */
  retry: () => void;
  reset: () => void;
}

const IDLE: PurchaseState = { phase: 'idle', itemKey: null, detail: null, code: null, explorerUrl: null, proof: null };
/** Theme kinds the foundation mock sells; everything else the shop mock answers. */
const THEME_KINDS: ReadonlySet<string> = new Set(['background', 'app_icon', 'border']);
const PAID_PROOF = { signature: null, imageUrl: null, written: [], lives: null } as const;

async function spend(item: ShopItem, refId: string | null, locale: string): Promise<void> {
  if (mockForced() && !THEME_KINDS.has(item.kind)) {
    const result = mockSpendCrystals(item.key, refId);
    if (!result.ok) throw new ShopCallError(`crystals: ${result.code}`, result.code === 'insufficient_crystals' ? 402 : 400, result.code, false, null, null, { error: result.code, balance: result.balance, price: result.price });
    return;
  }
  await spendCrystals(item.key, locale, { refId: refId ?? undefined });
}

export function useCrystalPurchase(): CrystalPurchase {
  const queryClient = useQueryClient();
  const { locale } = useI18n();
  const crystals = useCrystals();
  const [state, setState] = useState<PurchaseState>(IDLE);
  const [failure, setFailure] = useState<CrystalFailure | null>(null);
  const [last, setLast] = useState<{ item: ShopItem; refId: string | null } | null>(null);

  const mutation = useMutation({
    mutationFn: ({ item, refId }: { item: ShopItem; refId: string | null }) => spend(item, refId, locale),
    onSuccess: (_result, { item }) => {
      setFailure(null);
      setState({ phase: 'paid', itemKey: item.key, detail: null, code: null, explorerUrl: null, proof: { ...PAID_PROOF, written: [] } });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.crystals.all });
      void queryClient.invalidateQueries({ queryKey: ['companion'] });
    },
    onError: (error, { item }) => {
      const e = error instanceof ShopCallError ? error : null;
      if (e?.code === 'insufficient_crystals') {
        const balance = Number(e.body?.balance);
        const price = Number(e.body?.price);
        setFailure({ code: 'insufficient_crystals', itemKey: item.key, price: Number.isFinite(price) ? price : (item.priceCrystals ?? 0), balance: Number.isFinite(balance) ? balance : (crystals.data?.balance ?? 0) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.crystals.all });
        return;
      }
      // `apply_failed` is already debited and retryable: the same request completes it for free.
      setState({ phase: 'failed', itemKey: item.key, detail: e?.message ?? String(error), code: e?.code ?? null, explorerUrl: null, proof: null });
      void queryClient.invalidateQueries({ queryKey: queryKeys.crystals.all });
    },
  });

  const pay = useCallback(
    (item: ShopItem, refId?: string) => {
      setLast({ item, refId: refId ?? null });
      setFailure(null);
      mutation.mutate({ item, refId: refId ?? null });
    },
    [mutation]
  );

  return {
    pay,
    busy: mutation.isPending,
    balance: crystals.data?.balance ?? null,
    state,
    failure,
    retry: () => {
      setState(IDLE);
      if (last) mutation.mutate(last);
    },
    reset: () => {
      setState(IDLE);
      setFailure(null);
    },
  };
}
