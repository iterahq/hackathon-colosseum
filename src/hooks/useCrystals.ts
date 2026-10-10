/**
 * Phoenix Crystals and the learner's theme. componente → hook → service → edge function.
 * A failed read is not retried and not surfaced: every consumer treats "no data" as "crystals are off".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { equipTheme, getCrystals, spendCrystals } from '@/services/crystals.service';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { CrystalsSnapshot, ThemeSlot } from '@/types/crystals';

export function useCrystals({ enabled = true }: { enabled?: boolean } = {}) {
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  const userId = session?.user?.id ?? 'anon';
  const key = queryKeys.crystals.mine(userId, locale);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getCrystals(locale),
    enabled: enabled && configured && Boolean(session) && !isGuestAccessToken(session?.access_token),
    retry: false,
    staleTime: 30_000,
  });
  return { ...query, key, userId };
}

/** The theme slot a choice changes, applied to a cached snapshot (used for the optimistic step). */
export function withEquipped(snapshot: CrystalsSnapshot, slot: ThemeSlot, key: string): CrystalsSnapshot {
  const item = snapshot.themeItems.find((i) => i.slot === slot && i.key === key);
  const themeItems = snapshot.themeItems.map((i) => (i.slot === slot ? { ...i, equipped: i.key === key } : i));
  const theme = { ...snapshot.theme };
  if (slot === 'background' && item?.color) theme.background = { key, color: item.color };
  if (slot === 'icon' && item?.color) theme.icon = { key, color: item.color };
  if (slot === 'border') theme.border = item ? { key, title: item.title, border: item.border } : null;
  return { ...snapshot, theme, themeItems };
}

/** Equip an owned background, icon colour or border: shown at once, rolled back if the backend refuses. */
export function useEquipTheme() {
  const queryClient = useQueryClient();
  const { key } = useCrystals({ enabled: false });
  return useMutation({
    mutationFn: ({ slot, itemKey }: { slot: ThemeSlot; itemKey: string }) => equipTheme({ [slot]: itemKey }),
    onMutate: async ({ slot, itemKey }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CrystalsSnapshot>(key);
      if (previous) queryClient.setQueryData<CrystalsSnapshot>(key, withEquipped(previous, slot, itemKey));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (theme) => {
      queryClient.setQueryData<CrystalsSnapshot>(key, (prev) => (prev ? { ...prev, theme: { ...theme, border: theme.border ?? prev.theme.border } } : prev));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.crystals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
    },
  });
}

/** Buy with crystals. Never equips; callers equip after, so the learner sees the preview first. */
export function useSpendCrystals() {
  const queryClient = useQueryClient();
  const { locale } = useI18n();
  const { key } = useCrystals({ enabled: false });
  return useMutation({
    mutationFn: ({ itemKey, qty }: { itemKey: string; qty?: number }) => spendCrystals(itemKey, locale, { qty }),
    onSuccess: (result) => {
      queryClient.setQueryData<CrystalsSnapshot>(key, (prev) => (prev ? { ...prev, balance: result.balance, themeItems: prev.themeItems.map((i) => (i.key === result.itemKey ? { ...i, owned: true } : i)) } : prev));
      void queryClient.invalidateQueries({ queryKey: queryKeys.crystals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
      if (result.itemKey.startsWith('life')) void queryClient.invalidateQueries({ queryKey: ['companion'] });
    },
  });
}
