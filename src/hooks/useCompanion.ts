/**
 * The learner's Tera companion: lives, equipped outfit, inventory, wallet.
 * componente → hook → service → edge function. A failed read is not retried and not surfaced:
 * every consumer treats "no data" as "this feature is off".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { equipOutfit, getCompanion } from '@/services/companion.service';
import type { CompanionSnapshot } from '@/types/shop';
import { walletOf } from '@/utils/headerHud';

export function useCompanion({ enabled = true }: { enabled?: boolean } = {}) {
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  const userId = session?.user?.id ?? 'anon';
  const key = queryKeys.companion.mine(userId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getCompanion(locale),
    enabled: enabled && configured && Boolean(session),
    retry: false,
    staleTime: 30_000,
    // A wallet user's Tera is minted in the background on the first call: watch until it lands.
    refetchInterval: (q) => (q.state.data?.companion.mintStatus === 'pending' ? 5000 : false),
  });
  const wallet = query.data?.wallet ?? walletOf(session?.user)?.address ?? null;

  return { ...query, key, userId, wallet, outfit: query.data?.companion.outfit ?? null };
}

/** Equip an owned outfit (or `null` to take it off): shown at once, rolled back if the backend refuses. */
export function useEquipOutfit() {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const userId = session?.user?.id ?? 'anon';
  const key = queryKeys.companion.mine(userId);

  return useMutation({
    mutationFn: (outfit: string | null) => equipOutfit(outfit, locale),
    onMutate: async (outfit) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CompanionSnapshot>(key);
      if (previous) {
        queryClient.setQueryData<CompanionSnapshot>(key, {
          ...previous,
          companion: { ...previous.companion, outfit },
          inventory: previous.inventory.map((entry) => (entry.kind === 'outfit' ? { ...entry, equipped: entry.itemKey === outfit } : entry)),
        });
      }
      return { previous };
    },
    onError: (_error, _outfit, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (snapshot) => queryClient.setQueryData(key, snapshot),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all }),
  });
}
