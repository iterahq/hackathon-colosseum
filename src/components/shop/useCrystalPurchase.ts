/**
 * Paying an item with crystals. The body is a stub until the crystals service lands: under `?mockShop=1`
 * it spends from the mock balance, anywhere else it throws "not wired". The other slice replaces `spend`.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { mockCrystalBalance, mockSpendCrystals } from '@/services/shopMock';
import { mockForced } from '@/services/shopTransport';
import type { ShopItem } from '@/types/shop';

export type CrystalFailure = { code: 'insufficient_crystals' | 'unknown_item' | 'not_wired'; itemKey: string; price: number; balance: number | null };

export interface CrystalPurchase {
  /** `onPayWithCrystals(item, refId?)`: the ink or frame goes on one certification, named by `refId`. */
  pay: (item: ShopItem, refId?: string) => void;
  busy: boolean;
  /** The crystal balance when known (the mock's today). */
  balance: number | null;
  failure: CrystalFailure | null;
  dismiss: () => void;
}

async function spend(item: ShopItem, refId: string | null): Promise<{ balance: number | null }> {
  if (mockForced()) {
    const result = mockSpendCrystals(item.key, refId);
    if (!result.ok && result.code) throw Object.assign(new Error(result.code), { failure: { code: result.code, itemKey: item.key, price: result.price, balance: result.balance } satisfies CrystalFailure });
    return { balance: result.balance };
  }
  throw Object.assign(new Error('crystal purchase is not wired'), { failure: { code: 'not_wired', itemKey: item.key, price: item.priceCrystals ?? 0, balance: null } satisfies CrystalFailure });
}

export function useCrystalPurchase(): CrystalPurchase {
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState<number | null>(() => (mockForced() ? mockCrystalBalance() : null));
  const [failure, setFailure] = useState<CrystalFailure | null>(null);
  const mutation = useMutation({
    mutationFn: ({ item, refId }: { item: ShopItem; refId: string | null }) => spend(item, refId),
    onSuccess: (result) => {
      setFailure(null);
      if (result.balance != null) setBalance(result.balance);
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
      void queryClient.invalidateQueries({ queryKey: ['companion'] });
    },
    onError: (error) => {
      const f = (error as { failure?: CrystalFailure }).failure;
      setFailure(f ?? null);
      if (f?.balance != null) setBalance(f.balance);
    },
  });
  const pay = useCallback((item: ShopItem, refId?: string) => mutation.mutate({ item, refId: refId ?? null }), [mutation]);
  return { pay, busy: mutation.isPending, balance, failure, dismiss: () => setFailure(null) };
}
