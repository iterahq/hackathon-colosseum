/** Tera's shop list for the signed-in learner, in the UI language. componente → hook → service → edge function. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { claimShopItem, getShopItems } from '@/services/shop.service';
import type { CompanionSnapshot } from '@/types/shop';

export function useShop(options: { enabled?: boolean } = {}) {
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  const userId = session?.user?.id ?? 'anon';

  return useQuery({
    queryKey: queryKeys.shop.items(userId, locale),
    queryFn: () => getShopItems(locale),
    enabled: configured && Boolean(session) && (options.enabled ?? true),
    // The list takes 1 to 2 s to build and every purchase, claim and equip invalidates it, so a page opens on the cached one.
    staleTime: 60_000,
    retry: 1,
  });
}

/** Claims an earned item (level unlock): the companion cache gains it at once, the shelf refetches. */
export function useClaimItem() {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const key = queryKeys.companion.mine(session?.user?.id ?? 'anon');

  return useMutation({
    mutationFn: (itemKey: string) => claimShopItem(itemKey, locale),
    onSuccess: (snapshot) => {
      const previous = queryClient.getQueryData<CompanionSnapshot>(key);
      queryClient.setQueryData<CompanionSnapshot>(key, { ...snapshot, wallet: snapshot.wallet ?? previous?.wallet ?? null, chain: previous?.chain });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all }),
  });
}
