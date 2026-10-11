import type { BountyDetail, MyBountyStatus } from '@/types/bounty';

export interface ActionTitle {
  key: string;
  vars: Record<string, string | number>;
  count?: number;
}

type TitleBounty = Pick<BountyDetail, 'id' | 'status' | 'claim' | 'requirement' | 'judge'>;

const YOURS: ActionTitle = { key: 'bounty.action.titleYours', vars: {} };
const YOUR_TURN: ActionTitle = { key: 'bounty.action.title', vars: {} };

/** What the action panel's heading says: "Your turn" only when this wallet can act, otherwise what is missing. */
export function actionTitle(bounty: TitleBounty, status: MyBountyStatus | null): ActionTitle {
  if (!status) return { key: 'bounty.action.titleNeutral', vars: {} };
  const claim = status.claim && status.claim.bountyId === bounty.id ? status.claim : null;
  const wonIt = bounty.status === 'paid' && Boolean(status.wallet) && bounty.claim?.wallet === status.wallet;
  if (wonIt || claim?.status === 'approved' || claim?.status === 'submitted') return YOURS;
  if (claim?.status === 'active' && bounty.status === 'claimed') return YOUR_TURN;
  if (bounty.status !== 'open') return YOURS;
  const busy = status.busyElsewhere || (status.claim !== null && status.claim.bountyId !== bounty.id && (status.claim.status === 'active' || status.claim.status === 'submitted'));
  if (bounty.judge && status.judgedBefore) return { key: 'bounty.action.titleJudged', vars: {} };
  if (busy) return { key: 'bounty.action.titleBusy', vars: {} };
  if (status.eligible) return YOUR_TURN;
  const { trail, minDays } = bounty.requirement;
  if (status.reason === 'no_wallet') return { key: 'bounty.action.titleNoWallet', vars: {} };
  if (status.reason === 'not_enough_days') {
    return status.proof ? { key: 'bounty.action.titleDaysDone', count: minDays, vars: { trail, done: status.proof.daysDone } } : { key: 'bounty.action.titleDays', count: minDays, vars: { trail } };
  }
  return { key: 'bounty.action.titleNoCert', vars: { trail } };
}
