/** The learner's own privacy choices. componente -> hook -> service -> `privacy`. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBountySession } from '@/hooks/useBounties';
import { queryKeys } from '@/lib/queryKeys';
import { getPrivacy, setProfilePublic } from '@/services/privacy.service';
import type { Privacy } from '@/types/privacy';

export function usePrivacy() {
  const { signedIn, userId } = useBountySession();
  return useQuery({ queryKey: queryKeys.privacy.mine(userId), queryFn: getPrivacy, enabled: signedIn, retry: false, staleTime: 30_000 });
}

/** Shows or hides the profile page. Every read that depends on it (the profile itself, the talent state and board) is read again. */
export function useSetProfilePublic() {
  const { userId } = useBountySession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ isPublic, leaveBoard = false }: { isPublic: boolean; leaveBoard?: boolean }) => setProfilePublic(isPublic, leaveBoard),
    onSuccess: (privacy: Privacy) => {
      client.setQueryData(queryKeys.privacy.mine(userId), privacy);
      void client.invalidateQueries({ queryKey: queryKeys.talent.all });
      void client.invalidateQueries({ queryKey: ['achievements', 'profile'] });
    },
  });
}
