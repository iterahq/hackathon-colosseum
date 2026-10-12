/** Talent board. componente → hook → service → edge function. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBountySession } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getCompanyAccess, getTalentBoard, getTalentStatus, listMeForTalent, unlistMeFromTalent } from '@/services/talent.service';
import type { ContactField } from '@/types/privacy';
import type { TalentFilters, TalentStatus } from '@/types/talent';

export function useTalentBoard(filters: TalentFilters) {
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.talent.board(locale, filters.capability, filters.minDays),
    queryFn: () => getTalentBoard(locale, filters),
    staleTime: 10_000,
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
  });
}

export function useTalentStatus() {
  const { signedIn, userId } = useBountySession();
  return useQuery({ queryKey: queryKeys.talent.mine(userId), queryFn: getTalentStatus, enabled: signedIn, retry: false });
}

export function useTalentListing() {
  const { userId } = useBountySession();
  const client = useQueryClient();
  const settle = (status: TalentStatus) => {
    client.setQueryData(queryKeys.talent.mine(userId), status);
    void client.invalidateQueries({ queryKey: queryKeys.talent.all });
    void client.invalidateQueries({ queryKey: queryKeys.privacy.all });
  };
  // The contact travels as the mutation's variables for the length of the request; `gcTime: 0` drops it as soon as it settles.
  const list = useMutation({ mutationFn: ({ headline, contact }: { headline: string; contact?: Partial<Record<ContactField, string>> }) => listMeForTalent(headline, contact), onSuccess: settle, gcTime: 0 });
  const unlist = useMutation({ mutationFn: unlistMeFromTalent, onSuccess: settle });
  return { list, unlist };
}

/** Whether the signed-in account is a company here (it funded a bounty, or is staff of a sponsor) and how many contacts it may still ask for today. */
export function useCompanyAccess() {
  const { signedIn, userId } = useBountySession();
  return useQuery({ queryKey: queryKeys.talent.company(userId), queryFn: getCompanyAccess, enabled: signedIn, retry: false, staleTime: 30_000 });
}
