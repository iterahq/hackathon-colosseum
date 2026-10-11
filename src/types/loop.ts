import type { Bounty } from '@/types/bounty';

/** One open bounty seen from a wallet: how many stamped days it already has on the required trail, and how many are missing. */
export interface BountyOpening {
  bounty: Bounty;
  daysDone: number;
  missingDays: number;
}

/** What a wallet's certifications open on the public bounty board. */
export interface LoopView {
  /** Open bounties this wallet can accept right now. */
  eligible: BountyOpening[];
  /** Open bounties one or more stamped days away, nearest first. */
  almost: BountyOpening[];
}
