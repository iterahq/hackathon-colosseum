import { sortBounties } from '@/utils/bounty';
import type { Bounty, BountyStatus } from '@/types/bounty';

export type BoardTab = 'open' | 'progress' | 'history';
export type RewardTier = 'common' | 'rare' | 'epic' | 'legendary';

export const BOARD_TABS: readonly BoardTab[] = ['open', 'progress', 'history'];

export function boardTabOf(status: BountyStatus): BoardTab {
  if (status === 'open') return 'open';
  if (status === 'claimed' || status === 'submitted' || status === 'paying') return 'progress';
  return 'history';
}

export function splitBoard(bounties: readonly Bounty[]): { featured: Bounty | null; tabs: Record<BoardTab, Bounty[]> } {
  const sorted = sortBounties(bounties);
  const featured = sorted.find((bounty) => bounty.judge !== null && bounty.status === 'open') ?? null;
  const tabs: Record<BoardTab, Bounty[]> = { open: [], progress: [], history: [] };
  for (const bounty of sorted) {
    if (bounty !== featured) tabs[boardTabOf(bounty.status)].push(bounty);
  }
  return { featured, tabs };
}

export function defaultTab(tabs: Record<BoardTab, readonly unknown[]>): BoardTab {
  return BOARD_TABS.find((tab) => tabs[tab].length > 0) ?? 'open';
}

export function rewardTier(rewardLamports: number): RewardTier {
  if (rewardLamports < 20_000_000) return 'common';
  if (rewardLamports < 60_000_000) return 'rare';
  if (rewardLamports < 100_000_000) return 'epic';
  return 'legendary';
}
