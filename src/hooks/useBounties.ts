/** Bounties. componente → hook → service → edge function. Every write refreshes every bounty read. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import {
  acceptBounty,
  approveBounty,
  bountyErrorCode,
  createBounty,
  createPostedBounty,
  fundBounty,
  getBounty,
  getBountyBoard,
  getModeration,
  getMyBountyStatus,
  getPostedList,
  getPostOptions,
  getSponsorList,
  refreshBounty,
  refundBounty,
  rejectBounty,
  rejectPosted,
  reportBounty,
  runBountyWalletTx,
  setBountyHidden,
  submitBounty,
  withdrawBounty,
} from '@/services/bounty.service';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { CreateBountyInput, CreatePostedInput, TxPhase, WalletTxKind } from '@/types/bounty';

export function useBountySession() {
  const { session, configured } = useAuth();
  const signedIn = configured && Boolean(session) && !isGuestAccessToken(session?.access_token);
  return { signedIn, userId: session?.user?.id ?? 'anon' };
}

export function useBountyBoard() {
  const { locale } = useI18n();
  return useQuery({ queryKey: queryKeys.bounty.board(locale), queryFn: () => getBountyBoard(locale), staleTime: 15_000 });
}

export function useBounty(slug: string) {
  const { locale } = useI18n();
  return useQuery({ queryKey: queryKeys.bounty.detail(slug, locale), queryFn: () => getBounty(slug, locale), enabled: slug.length > 0 });
}

export function useMyBountyStatus(bountyId: string | null) {
  const { signedIn, userId } = useBountySession();
  return useQuery({
    queryKey: queryKeys.bounty.mine(userId, bountyId ?? ''),
    queryFn: () => getMyBountyStatus(bountyId ?? ''),
    enabled: signedIn && Boolean(bountyId),
    retry: false,
  });
}

export function useSponsorBounties(enabled = true) {
  const { signedIn, userId } = useBountySession();
  return useQuery({
    queryKey: queryKeys.bounty.sponsor(userId),
    queryFn: getSponsorList,
    enabled: enabled && signedIn,
    retry: (count, error) => bountyErrorCode(error) !== 'forbidden' && count < 1,
  });
}

function useWrite<V, R = void>(fn: (v: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.bounty.all }) });
}

export const useAcceptBounty = () => useWrite((bounty: string) => acceptBounty(bounty));
export const useSubmitBounty = () => useWrite((v: { bounty: string; url: string; note: string }) => submitBounty(v.bounty, v.url, v.note));
export const useWithdrawBounty = () => useWrite((bounty: string) => withdrawBounty(bounty));

export const useCreateBounty = () => useWrite((input: CreateBountyInput) => createBounty(input));
export const useFundBounty = () => useWrite((bounty: string) => fundBounty(bounty));
export const useRefreshBounty = () => useWrite((bounty: string) => refreshBounty(bounty));
export const useApproveBounty = () => useWrite((v: { bounty: string; note: string }) => approveBounty(v.bounty, v.note));
export const useRejectBounty = () => useWrite((v: { bounty: string; note: string }) => rejectBounty(v.bounty, v.note));
export const useRefundBounty = () => useWrite((bounty: string) => refundBounty(bounty));

export function useBountyPostOptions() {
  return useQuery({ queryKey: queryKeys.bounty.postOptions, queryFn: getPostOptions, staleTime: 60_000 });
}

export function useMyPostedBounties() {
  const { signedIn, userId } = useBountySession();
  return useQuery({
    queryKey: queryKeys.bounty.posted(userId),
    queryFn: getPostedList,
    enabled: signedIn,
    retry: (count, error) => bountyErrorCode(error) !== 'no_wallet' && count < 1,
  });
}

export function useModeration() {
  const { signedIn, userId } = useBountySession();
  return useQuery({
    queryKey: queryKeys.bounty.moderation(userId),
    queryFn: getModeration,
    enabled: signedIn,
    retry: (count, error) => bountyErrorCode(error) !== 'forbidden' && count < 1,
  });
}

export const useCreatePostedBounty = () => useWrite((input: CreatePostedInput) => createPostedBounty(input));
export const useRejectPosted = () => useWrite((v: { bounty: string; note: string }) => rejectPosted(v.bounty, v.note));
export const useReportBounty = () => useWrite((v: { bounty: string; reason: string }) => reportBounty(v.bounty, v.reason));
export const useSetHidden = () => useWrite((v: { bounty: string; hidden: boolean; reason: string }) => setBountyHidden(v.bounty, v.hidden, v.reason));

export const useWalletBountyTx = (kind: WalletTxKind) =>
  useWrite((v: { bounty: string; note?: string; onPhase?: (phase: TxPhase) => void }) => runBountyWalletTx(kind, v.bounty, v.note ?? '', v.onPhase ?? (() => undefined)));
