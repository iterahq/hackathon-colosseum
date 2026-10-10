/** Wearing an avatar from the wardrobe. componente → hook → service → edge function. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { equipAvatar } from '@/services/companion.service';
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';
import type { CompanionSnapshot } from '@/types/shop';

/** Equips a free or owned avatar: shown at once everywhere the learner's picture is drawn, rolled back if the backend refuses. */
export function useEquipAvatar() {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const key = queryKeys.companion.mine(session?.user?.id ?? 'anon');

  return useMutation({
    mutationFn: (avatar: LearnerAvatar) => equipAvatar(avatar.key, locale),
    onMutate: async (avatar) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CompanionSnapshot>(key);
      if (previous) queryClient.setQueryData<CompanionSnapshot>(key, { ...previous, avatar });
      return { previous };
    },
    onError: (_error, _avatar, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (snapshot) => {
      const previous = queryClient.getQueryData<CompanionSnapshot>(key);
      // An answer without an avatar block would fall back to the default Tera: the one the learner picked stays.
      const answered = snapshot.avatar === DEFAULT_AVATAR && previous ? { ...snapshot, avatar: previous.avatar } : snapshot;
      queryClient.setQueryData<CompanionSnapshot>(key, { ...answered, wallet: snapshot.wallet ?? previous?.wallet ?? null, chain: previous?.chain });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all }),
  });
}
