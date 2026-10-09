import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getLearnerProfile } from '@/services/learnerProfile.service';

/** The public profile of one wallet: component → hook → service → edge function. */
export function useLearnerProfile(wallet: string, lang: 'pt' | 'en') {
  return useQuery({
    queryKey: queryKeys.achievements.profile(wallet, lang),
    queryFn: () => getLearnerProfile(wallet, lang),
    enabled: Boolean(wallet),
    retry: false,
    staleTime: 30_000,
  });
}
