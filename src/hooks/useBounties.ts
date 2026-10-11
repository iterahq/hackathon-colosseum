/** Bounties. componente → hook → service → edge function. Every write refreshes every bounty read. */
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import {
  acceptBounty,
  approveBounty,
  checkInvitee,
  bountyErrorCode,
  createBounty,
  createPostedBounty,
  deletePostedDraft,
  fundBounty,
  getBounty,
  getBountyBoard,
  getBountyRecord,
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
  requestSponsorFaucet,
  submitBounty,
  submitJudgeCode,
  withdrawBounty,
  type JudgeResult,
  type SponsorFaucetResult,
  type StepPhase,
} from '@/services/bounty.service';
import { settleBountyStep, showJudgePass, type StepKind } from '@/services/bountySettle';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { CreateBountyInput, CreatePostedInput, TxPhase, WalletTxKind } from '@/types/bounty';

export function useBountySession() {
  const { session, configured } = useAuth();
  const signedIn = configured && Boolean(session) && !isGuestAccessToken(session?.access_token);
  return { signedIn, userId: session?.user?.id ?? 'anon' };
}

export function useBountyBoard({ live = false }: { live?: boolean } = {}) {
  const { locale } = useI18n();
  // A language switch keeps the numbers on screen while the other language's labels arrive: no blank tiles.
  // "N of M free now" is only worth printing fresh: read again on every visit, and every 20 s while the board itself (`live`) is open.
  return useQuery({ queryKey: queryKeys.bounty.board(locale), queryFn: () => getBountyBoard(locale), staleTime: 5_000, refetchInterval: live ? 20_000 : false, refetchOnMount: 'always', placeholderData: keepPreviousData });
}

export function useBounty(slug: string) {
  const { locale } = useI18n();
  return useQuery({ queryKey: queryKeys.bounty.detail(slug, locale), queryFn: () => getBounty(slug, locale), enabled: slug.length > 0 });
}

/** The same bounty from Itera's tables alone: it answers before the read that waits on the chain, and is dropped once that one lands. */
export function useBountyRecord(slug: string, enabled: boolean) {
  const { locale } = useI18n();
  return useQuery({ queryKey: queryKeys.bounty.record(slug, locale), queryFn: () => getBountyRecord(slug, locale), enabled: enabled && slug.length > 0, retry: false, staleTime: 30_000 });
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

export const useSubmitBounty = () => useWrite((v: { bounty: string; url: string; note: string }) => submitBounty(v.bounty, v.url, v.note));

/** A step the learner's wallet signs. It stays pending until the page shows the new state, and it keeps the explorer link once the server answers. */
export function useSignedBountyStep(kind: StepKind) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<StepPhase | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'settled' | 'stale' | null>(null);
  const mutation = useMutation({
    mutationFn: async (bounty: string) => {
      setOutcome(null);
      setExplorerUrl(null);
      setPhase('wallet');
      const result = await (kind === 'accept' ? acceptBounty : withdrawBounty)(bounty, setPhase);
      setExplorerUrl(result.explorerUrl);
      setPhase('settling');
      setOutcome((await settleBountyStep(queryClient, kind, bounty)) ? 'settled' : 'stale');
    },
    onSettled: () => {
      setPhase(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bounty.all });
    },
  });
  return { run: mutation.mutate, pending: mutation.isPending, phase, explorerUrl, outcome, error: mutation.isError ? mutation.error : null };
}

/** The delivery of a judge bounty: the code is checked on the server, and a pass is paid in the same call. Stays pending until the page shows it paid. */
export function useJudgeSubmit() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'checking' | 'settling' | null>(null);
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [outcome, setOutcome] = useState<'settled' | 'stale' | null>(null);
  const mutation = useMutation({
    mutationFn: async (v: { bounty: string; code: string }) => {
      setOutcome(null);
      setResult(null);
      setPhase('checking');
      const answer = await submitJudgeCode(v.bounty, v.code);
      setResult(answer);
      if (!answer.submitted) return;
      await showJudgePass(queryClient, v.bounty, answer, v.code);
      setPhase('settling');
      setOutcome((await settleBountyStep(queryClient, 'judge', v.bounty)) ? 'settled' : 'stale');
    },
    onSettled: () => {
      setPhase(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bounty.all });
    },
  });
  return { run: mutation.mutate, pending: mutation.isPending, phase, result, outcome, error: mutation.isError ? mutation.error : null, reset: () => { mutation.reset(); setResult(null); } };
}

export const useSponsorFaucet = () => useWrite<void, SponsorFaucetResult>(() => requestSponsorFaucet());

export const useCreateBounty = () => useWrite((input: CreateBountyInput) => createBounty(input));
export const useFundBounty = () => useWrite((bounty: string) => fundBounty(bounty));
export const useRefreshBounty = () => useWrite((bounty: string) => refreshBounty(bounty));
export const useApproveBounty = () => useWrite((v: { bounty: string; note: string }) => approveBounty(v.bounty, v.note));
export const useRejectBounty = () => useWrite((v: { bounty: string; note: string }) => rejectBounty(v.bounty, v.note));
export const useRefundBounty = () => useWrite((bounty: string) => refundBounty(bounty));

export function useBountyPostOptions() {
  return useQuery({ queryKey: queryKeys.bounty.postOptions, queryFn: getPostOptions, staleTime: 60_000 });
}

export function useInviteeCheck(wallet: string | null, unitId: string, minDays: number | null) {
  const { signedIn, userId } = useBountySession();
  return useQuery({
    queryKey: queryKeys.bounty.inviteeCheck(userId, wallet ?? '', unitId, minDays ?? 0),
    queryFn: () => checkInvitee({ wallet: wallet ?? '', unitId, minDays: minDays ?? 1 }),
    enabled: signedIn && Boolean(wallet) && Boolean(unitId) && minDays !== null,
    retry: false,
    staleTime: 30_000,
  });
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
export const useDeleteDraft = () => useWrite((bounty: string) => deletePostedDraft(bounty));
export const useRejectPosted = () => useWrite((v: { bounty: string; note: string }) => rejectPosted(v.bounty, v.note));
export const useReportBounty = () => useWrite((v: { bounty: string; reason: string }) => reportBounty(v.bounty, v.reason));
export const useSetHidden = () => useWrite((v: { bounty: string; hidden: boolean; reason: string }) => setBountyHidden(v.bounty, v.hidden, v.reason));

export const useWalletBountyTx = (kind: WalletTxKind) =>
  useWrite((v: { bounty: string; note?: string; onPhase?: (phase: TxPhase) => void }) => runBountyWalletTx(kind, v.bounty, v.note ?? '', v.onPhase ?? (() => undefined)));
