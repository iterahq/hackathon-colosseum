import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { settleBountyStep, stepReflected } from './bountySettle';
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
