/** The pictures a learner may wear (free icons + owned NFT avatars) and the switch. componente → hook → service. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useShop } from '@/hooks/useShop';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { equipAvatar } from '@/services/companion.service';
import { DEFAULT_AVATAR, type LearnerAvatar } from '@/types/avatar';

export function useProfileAvatars() {
  const { session } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const current = useLearnerAvatar();
  const shop = useShop();
  const key = queryKeys.companion.mine(session?.user?.id ?? 'anon');

  const options: LearnerAvatar[] = (shop.data ?? [])
    .filter((item) => item.kind === 'avatar' && item.avatar && (item.avatar.free || item.owned))
    .map((item) => ({
      key: item.key,
      title: item.title,
      rarity: item.avatar!.rarity,
      tierName: item.avatar!.tierName,
      imageUrl: item.avatar!.imageUrl,
      thumbUrl: item.avatar!.thumbUrl,
      assetAddress: item.avatar!.assetAddress,
    }));
  const list = options.some((o) => o.key === current.key) ? options : [current.key === DEFAULT_AVATAR.key ? DEFAULT_AVATAR : current, ...options];

  const equip = useMutation({
    mutationFn: (avatarKey: string) => equipAvatar(avatarKey, locale),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(key, snapshot);
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
    },
  });
  return { options: list, current, equip };
}
