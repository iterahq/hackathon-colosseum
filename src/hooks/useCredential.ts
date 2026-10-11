import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { verifyCredential } from '@/services/credential.service';
import { looksLikeAddress } from '@/utils/credential';
import type { CredentialLookup } from '@/types/achievements';

const NOT_AN_ADDRESS: CredentialLookup = { status: 'not_found', ms: 0 };

/** The public verification of one asset: componente → hook → service → edge function. Text that is not an address never leaves the browser. */
export function useCredential(asset: string, lang: string) {
  return useQuery({
    queryKey: queryKeys.achievements.credential(asset, lang),
    queryFn: () => (looksLikeAddress(asset) ? verifyCredential(asset, lang) : Promise.resolve(NOT_AN_ADDRESS)),
    enabled: Boolean(asset),
    retry: false,
    staleTime: 30_000,
  });
}

/** Reads the chain again, past the function's cache, and puts the fresh answer where the page reads it. */
export function useRecheckCredential(asset: string, lang: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => verifyCredential(asset, lang, { fresh: true }),
    onSuccess: (lookup) => queryClient.setQueryData(queryKeys.achievements.credential(asset, lang), lookup),
  });
}
