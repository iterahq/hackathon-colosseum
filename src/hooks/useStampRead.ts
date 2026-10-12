import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getLearnerProfile } from '@/services/learnerProfile.service';
import type { LearnerProfile } from '@/types/learnerProfile';
import type { StampExpectation } from '@/types/loop';
import { readStampedProfile, stampReadState } from '@/utils/stampRead';

/**
 * After the ceremony confirms a stamp: one fresh chain read of the wallet's profile, repeated until it carries
 * that stamp, then shared with every surface that shows the profile. Off when there is no stamp to wait for.
 */
export function useStampRead(wallet: string | null, lang: 'pt' | 'en', stamp: StampExpectation | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.stampRead(wallet ?? '', lang, stamp?.asset ?? '', stamp?.daysDone ?? 0),
    queryFn: async () => {
      const profileKey = queryKeys.achievements.profile(wallet ?? '', lang);
      const result = await readStampedProfile(() => getLearnerProfile(wallet ?? '', lang, { fresh: true }), stamp as StampExpectation);
      if (result.caught) {
        await queryClient.cancelQueries({ queryKey: profileKey });
        queryClient.setQueryData(profileKey, result.lookup);
      }
      return result;
    },
    enabled: Boolean(wallet && stamp),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const state = stampReadState({ expected: Boolean(wallet && stamp), pending: query.isPending, fetching: query.isFetching, failed: query.isError, caught: query.data?.caught });
  const profile: LearnerProfile | null = state === 'caught' && query.data?.lookup?.status === 'ok' ? query.data.lookup.profile : null;
  return { state, profile, retry: () => void query.refetch() };
}
