import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { settleBountyStep, showJudgePass, stepReflected, withJudgePass, withJudgePassMine } from './bountySettle';
import type { BountyDetail, MyBountyStatus } from '@/types/bounty';

const detail = (status: BountyDetail['status']) => ({ id: 'b1', status }) as BountyDetail;
const mine = (active: boolean) => ({ wallet: 'W', eligible: true, reason: null, proof: null, busyElsewhere: false, claim: active ? { bountyId: 'b1', status: 'active' } : null }) as MyBountyStatus;

describe('stepReflected', () => {
  it('needs the bounty off "open" and the claim active after accept', () => {
    expect(stepReflected('accept', 'b1', detail('open'), mine(true))).toBe(false);
    expect(stepReflected('accept', 'b1', detail('claimed'), mine(false))).toBe(false);
    expect(stepReflected('accept', 'b1', detail('claimed'), mine(true))).toBe(true);
  });
  it('needs the bounty off "claimed" and no active claim after give up', () => {
    expect(stepReflected('withdraw', 'b1', detail('claimed'), mine(false))).toBe(false);
    expect(stepReflected('withdraw', 'b1', detail('open'), mine(true))).toBe(false);
    expect(stepReflected('withdraw', 'b1', detail('open'), mine(false))).toBe(true);
  });
});

describe('settleBountyStep', () => {
  function watch(client: QueryClient, reads: { detail: () => BountyDetail; mine: () => MyBountyStatus }) {
    new QueryObserver(client, { queryKey: queryKeys.bounty.detail('faq', 'en'), queryFn: async () => reads.detail() }).subscribe(() => undefined);
    new QueryObserver(client, { queryKey: queryKeys.bounty.mine('u1', 'b1'), queryFn: async () => reads.mine() }).subscribe(() => undefined);
  }

  it('keeps reading until the page shows the accepted state, instead of stopping at the first stale read', async () => {
    const client = new QueryClient();
    let reads = 0;
    watch(client, { detail: () => detail(reads >= 3 ? 'claimed' : 'open'), mine: () => (reads++, mine(reads >= 3)) });
    await client.refetchQueries();
    reads = 0;
    const sleep = vi.fn(async () => undefined);
    await expect(settleBountyStep(client, 'accept', 'b1', { sleep })).resolves.toBe(true);
    expect(sleep).toHaveBeenCalled();
    expect(client.getQueryData<BountyDetail>(queryKeys.bounty.detail('faq', 'en'))?.status).toBe('claimed');
  });

  it('gives up after the tries and says it did not settle', async () => {
    const client = new QueryClient();
    watch(client, { detail: () => detail('open'), mine: () => mine(false) });
    await client.refetchQueries();
    await expect(settleBountyStep(client, 'accept', 'b1', { tries: 3, sleep: async () => undefined })).resolves.toBe(false);
  });
});

describe('a delivery the automatic check passed', () => {
  const held = { id: 'b1', status: 'claimed', rewardLamports: 10_000_000, payout: null, claim: { wallet: 'W', walletShort: 'W…W', status: 'active', submittedAt: null, submissionCode: null, checkReport: null } } as unknown as BountyDetail;
  const report = { version: 1, passed: true, checks: [{ id: 'a', passed: true }], checkedAt: 'now' };
  const paid = { report, payout: { status: 'paid', signature: 'SIG', explorerUrl: 'https://explorer/tx/SIG', lamports: 10_000_000 } };
  const active = { wallet: 'W', eligible: true, reason: null, proof: null, judgedBefore: false, busyElsewhere: false, claim: { bountyId: 'b1', status: 'active', checkReport: null } } as unknown as MyBountyStatus;

  it('is shown paid, with the code and the verdict, from the answer alone', () => {
    const next = withJudgePass(held, paid, '<p>hi</p>', '2026-10-11T19:14:15Z');
    expect(next.status).toBe('paid');
    expect(next.payout).toEqual({ signature: 'SIG', lamports: 10_000_000, sol: '0.01 SOL', at: '2026-10-11T19:14:15Z', wallet: 'W', explorerUrl: 'https://explorer/tx/SIG' });
    expect(next.claim).toMatchObject({ status: 'approved', submissionCode: '<p>hi</p>', checkReport: report });
  });

  it('is shown as paying, never as still to deliver, while the payout is not confirmed', () => {
    const next = withJudgePass(held, { report, payout: { status: 'paying', signature: null, explorerUrl: null, lamports: null } }, '<p>hi</p>', 'now');
    expect(next.status).toBe('paying');
    expect(next.payout).toBeNull();
    expect(next.claim?.status).toBe('submitted');
  });

  it('ends the learner`s active claim on that bounty and on no other', () => {
    expect(withJudgePassMine(active, 'b1', paid).claim?.status).toBe('approved');
    expect(withJudgePassMine(active, 'b2', paid)).toBe(active);
  });

  it('reaches every read of the bounty the page holds', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.bounty.detail('faq', 'en'), held);
    client.setQueryData(queryKeys.bounty.detail('other', 'en'), { ...held, id: 'b2' });
    client.setQueryData(queryKeys.bounty.mine('u1', 'b1'), active);
    await showJudgePass(client, 'b1', paid, '<p>hi</p>');
    expect(client.getQueryData<BountyDetail>(queryKeys.bounty.detail('faq', 'en'))?.status).toBe('paid');
    expect(client.getQueryData<BountyDetail>(queryKeys.bounty.detail('other', 'en'))?.status).toBe('claimed');
    expect(client.getQueryData<MyBountyStatus>(queryKeys.bounty.mine('u1', 'b1'))?.claim?.status).toBe('approved');
  });
});
