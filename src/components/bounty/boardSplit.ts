import type { Bounty, BountyStatus } from '@/types/bounty';

const LIVE: readonly BountyStatus[] = ['open', 'claimed', 'submitted', 'paying'];

type BoardItem = Pick<Bounty, 'status' | 'rehearsal'> & Partial<Pick<Bounty, 'title' | 'rewardLamports'>> & { judge?: unknown; postedBy?: Pick<Bounty['postedBy'], 'kind'> };

/**
 * Where an open mission sits on the board: 0 a mission of the team or of a sponsor, 1 the judge's own mission, 2 a
 * "Judge test: …" card a tester's wallet posted while trying the sponsor side. The board has no field for the last
 * one, so it is told by who posted it (a wallet) and how its title starts. It only orders: the card and its labels are the same.
 */
export function boardTier(item: BoardItem): 0 | 1 | 2 {
  if (item.judge) return 1;
  return item.postedBy?.kind === 'wallet' && /^\s*judge test\b/i.test(item.title ?? '') ? 2 : 0;
}

/**
 * The board in two: what can be taken or is being worked on, and what is over (paid, refunded, expired) plus the
 * team's own rehearsals. Among the live ones, open comes before held, real missions lead with the highest reward
 * first, then the judge's mission, then the testers' cards; the order given is kept inside a tie.
 */
export function splitBoard<T extends BoardItem>(items: readonly T[]): { live: T[]; closed: T[] } {
  const live: T[] = [];
  const closed: T[] = [];
  for (const item of items) (LIVE.includes(item.status) && !item.rehearsal ? live : closed).push(item);
  const held = (item: T) => (item.status === 'open' ? 0 : 1);
  const ordered = live
    .map((item, index) => ({ item, index, tier: boardTier(item) }))
    .sort((a, b) => held(a.item) - held(b.item) || a.tier - b.tier || (a.tier === 0 ? (b.item.rewardLamports ?? 0) - (a.item.rewardLamports ?? 0) : 0) || a.index - b.index)
    .map((entry) => entry.item);
  return { live: ordered, closed };
}
