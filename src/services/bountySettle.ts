import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { lamportsToSol } from '@/utils/bounty';
import type { BountyDetail, CheckReport, MyBountyStatus } from '@/types/bounty';

export type StepKind = 'accept' | 'withdraw' | 'judge';

const holdsClaim = (mine: MyBountyStatus, bountyId: string) => mine.claim?.bountyId === bountyId && mine.claim.status === 'active';

/** True when what the page holds already shows the signed step; a read that is not on the page does not count. */
export function stepReflected(kind: StepKind, bountyId: string, detail: BountyDetail | null | undefined, mine: MyBountyStatus | undefined): boolean {
  if (kind === 'judge') return !detail || detail.status === 'paid';
  if (detail && (kind === 'accept' ? detail.status === 'open' : detail.status === 'claimed')) return false;
  if (mine && holdsClaim(mine, bountyId) !== (kind === 'accept')) return false;
  return true;
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The chain answers a signed step before every read of it agrees: the escrow account read behind the bounty
 * can still show the old state for a few seconds. Refetches what the page shows until it reflects the step.
 */
export async function settleBountyStep(
  queryClient: QueryClient,
  kind: StepKind,
  bountyId: string,
  { tries = 8, delayMs = 2000, sleep = sleepFor }: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await queryClient.refetchQueries({ queryKey: queryKeys.bounty.all, type: 'active' });
    const details = queryClient.getQueriesData<BountyDetail | null>({ queryKey: ['bounty', 'detail'], type: 'active' }).map(([, data]) => data).filter((d): d is BountyDetail => d?.id === bountyId);
    const mines = queryClient.getQueriesData<MyBountyStatus>({ queryKey: ['bounty', 'mine'], type: 'active' }).filter(([key]) => key[3] === bountyId).map(([, data]) => data);
    const reflected = [...details, ...mines].length === 0 || (details.every((d) => stepReflected(kind, bountyId, d, undefined)) && mines.every((m) => m === undefined || stepReflected(kind, bountyId, undefined, m)));
    if (reflected) return true;
    if (attempt < tries - 1) await sleep(delayMs);
  }
  return false;
}

/** What the server answered when a delivery passed the automatic check. */
export interface JudgePass {
  report: CheckReport | null;
  payout: { status: string; signature: string | null; explorerUrl: string | null; lamports: number | null };
}

/**
 * The bounty as the server's answer to a passed delivery describes it: paid (or paying) with the code and the
 * verdict, so the page never shows the delivery form beside "paid" while the next read is on its way.
 */
export function withJudgePass(detail: BountyDetail, pass: JudgePass, code: string, at: string): BountyDetail {
  const paid = pass.payout.status === 'paid' && pass.payout.signature !== null;
  const lamports = pass.payout.lamports ?? detail.rewardLamports;
  const claim = detail.claim ? { ...detail.claim, status: paid ? 'approved' : 'submitted', submittedAt: detail.claim.submittedAt ?? at, submissionCode: paid ? code : null, checkReport: paid ? pass.report : null } : null;
  if (!paid) return { ...detail, status: 'paying', claim };
  return {
    ...detail,
    status: 'paid',
    claim,
    payout: { signature: pass.payout.signature as string, lamports, sol: `${lamportsToSol(lamports)} SOL`, at, wallet: detail.claim?.wallet ?? null, explorerUrl: pass.payout.explorerUrl },
  };
}

/** The learner's own status after the same answer: the claim is no longer one to deliver. */
export function withJudgePassMine(mine: MyBountyStatus, bountyId: string, pass: JudgePass): MyBountyStatus {
  if (mine.claim?.bountyId !== bountyId) return mine;
  const paid = pass.payout.status === 'paid' && pass.payout.signature !== null;
  return { ...mine, judgedBefore: true, claim: { ...mine.claim, status: paid ? 'approved' : 'submitted', checkReport: pass.report } };
}

/** Writes a passed delivery into every read of that bounty the page holds, ahead of the next read. */
export async function showJudgePass(queryClient: QueryClient, bountyId: string, pass: JudgePass, code: string, at = new Date().toISOString()): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.bounty.all });
  queryClient.setQueriesData<BountyDetail | null>({ queryKey: ['bounty', 'detail'] }, (held) => (held && held.id === bountyId ? withJudgePass(held, pass, code, at) : held));
  queryClient.setQueriesData<MyBountyStatus>({ queryKey: ['bounty', 'mine'] }, (held) => (held ? withJudgePassMine(held, bountyId, pass) : held));
}
