import type { BountyRow } from './bounty.ts';

export type DraftVerdict = 'ok' | 'not_found' | 'not_a_draft';

/** Whether a wallet may delete a bounty: only its own, wallet-posted, never funded and still waiting for funding. */
export function draftVerdict(bounty: Pick<BountyRow, 'origin' | 'sponsor_wallet' | 'status' | 'funded_at'>, wallet: string): DraftVerdict {
  if (bounty.origin !== 'wallet' || bounty.sponsor_wallet !== wallet) return 'not_found';
  return bounty.status === 'awaiting_funding' && bounty.funded_at === null ? 'ok' : 'not_a_draft';
}
