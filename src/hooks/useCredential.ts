import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { verifyCredential } from '@/services/credential.service';

/** The public verification of one asset: componente → hook → service → edge function. */
export function useCredential(asset: string) {
  return useQuery({
    queryKey: queryKeys.achievements.credential(asset),
    queryFn: () => verifyCredential(asset),
    enabled: Boolean(asset),
    retry: false,
    staleTime: 30_000,
  });
}
