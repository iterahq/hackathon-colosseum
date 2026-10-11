import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getClaimEvidence, getLearnerProfile, getWalletGraph } from '@/services/learnerProfile.service';

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

/** The stored evidence behind one proven claim; fetched only when the detail panel asks for it. */
export function useClaimEvidence(wallet: string, claimId: string | null) {
  return useQuery({
    queryKey: queryKeys.achievements.evidence(wallet, claimId ?? ''),
    queryFn: () => getClaimEvidence(wallet, claimId ?? ''),
    enabled: Boolean(wallet && claimId),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** The fast graph of a wallet (database only), shown while the full profile reads the chain. */
export function useWalletGraph(wallet: string, lang: 'pt' | 'en') {
  return useQuery({
    queryKey: queryKeys.achievements.graph(wallet, lang),
    queryFn: () => getWalletGraph(wallet, lang),
    enabled: Boolean(wallet),
    retry: false,
    staleTime: 30_000,
  });
}

/** Reads the chain again, past the function's cache, and puts the fresh profile where the page reads it. */
export function useRecheckProfile(wallet: string, lang: 'pt' | 'en') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getLearnerProfile(wallet, lang, { fresh: true }),
    onSuccess: (lookup) => queryClient.setQueryData(queryKeys.achievements.profile(wallet, lang), lookup),
  });
}
