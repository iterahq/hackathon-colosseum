/** Talent board. componente → hook → service → edge function. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBountySession } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { getTalentBoard, getTalentStatus, listMeForTalent, unlistMeFromTalent } from '@/services/talent.service';
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
  };
  const list = useMutation({ mutationFn: (headline: string) => listMeForTalent(headline), onSuccess: settle });
  const unlist = useMutation({ mutationFn: unlistMeFromTalent, onSuccess: settle });
  return { list, unlist };
}
