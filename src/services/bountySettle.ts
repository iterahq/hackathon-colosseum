import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';

export type StepKind = 'accept' | 'withdraw';

const holdsClaim = (mine: MyBountyStatus, bountyId: string) => mine.claim?.bountyId === bountyId && mine.claim.status === 'active';

/** True when what the page holds already shows the signed step; a read that is not on the page does not count. */
export function stepReflected(kind: StepKind, bountyId: string, detail: BountyDetail | null | undefined, mine: MyBountyStatus | undefined): boolean {
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
