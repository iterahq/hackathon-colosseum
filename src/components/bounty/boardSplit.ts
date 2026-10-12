import type { Bounty, BountyStatus } from '@/types/bounty';

const LIVE: readonly BountyStatus[] = ['open', 'claimed', 'submitted', 'paying'];

/** The board in two: what can be taken or is being worked on, and what is over (paid, refunded, expired) plus the team's own rehearsals. Order is kept. */
export function splitBoard<T extends Pick<Bounty, 'status' | 'rehearsal'>>(items: readonly T[]): { live: T[]; closed: T[] } {
  const live: T[] = [];
  const closed: T[] = [];
  for (const item of items) (LIVE.includes(item.status) && !item.rehearsal ? live : closed).push(item);
  return { live, closed };
}
