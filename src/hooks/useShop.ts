/** Tera's shop list for the signed-in learner, in the UI language. componente → hook → service → edge function. */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getShopItems } from '@/services/shop.service';

export function useShop() {
  const { session, configured } = useAuth();
  const { locale } = useI18n();
  const userId = session?.user?.id ?? 'anon';

  return useQuery({
    queryKey: queryKeys.shop.items(userId, locale),
    queryFn: () => getShopItems(locale),
    enabled: configured && Boolean(session),
    retry: 1,
  });
}
