import { describe, expect, it } from 'vitest';
import type { Bounty } from '@/types/bounty';
import type { LearnerProfile } from '@/types/learnerProfile';
import { certificationFor, dayClaims, loopView } from './loopView';

const bounty = (slug: string, trail: string, minDays: number, rewardLamports: number, status: Bounty['status'] = 'open'): Bounty =>
  ({ id: slug, slug, title: slug, status, rewardLamports, rewardSol: `${rewardLamports / 1e9} SOL`, requirement: { program: 'itera-v2', unitId: 'u', trail, minDays, totalDays: 5 } }) as unknown as Bounty;

const profile = {
  certifications: [{ asset: 'a', verified: true, trail: 'Week 1 · HTML', daysDone: 3, totalDays: 5, tier: 'bronze' }],
  capabilities: {
    program: 'itera-v2',
    version: 1,
    total: 3,
    verifiedCount: 1,
    next: null,
    trails: [{ trail: 0, title: 'Week 1 · HTML' }],
    nodes: [
      { id: 'a', trail: 0, day: 1, title: 'A', requires: [], status: 'verified', proof: null },
      { id: 'b', trail: 0, day: 1, title: 'B', requires: [], status: 'open', proof: null },
      { id: 'c', trail: 0, day: 2, title: 'C', requires: [], status: 'open', proof: null },
    ],
  },
} as unknown as LearnerProfile;

describe('loopView', () => {
  it('splits open bounties into the ones this wallet can take and the ones a few stamped days away', () => {
    const view = loopView(profile, [
      bounty('html-1', 'Week 1 · HTML', 1, 3e7),
      bounty('html-3', 'Week 1 · HTML', 3, 5e7),
      bounty('html-5', 'Week 1 · HTML', 5, 1e7),
      bounty('css-3', 'Week 2 · CSS', 3, 8e7),
      bounty('paid', 'Week 1 · HTML', 1, 9e7, 'paid'),
    ]);
    expect(view.eligible.map((o) => o.bounty.slug)).toEqual(['html-3', 'html-1']);
    expect(view.almost.map((o) => [o.bounty.slug, o.missingDays])).toEqual([
      ['html-5', 2],
      ['css-3', 3],
    ]);
  });

  it('treats a wallet with no certification as zero days on every trail', () => {
    const view = loopView(null, [bounty('html-1', 'Week 1 · HTML', 1, 3e7)]);
    expect(view.eligible).toEqual([]);
    expect(view.almost[0].missingDays).toBe(1);
  });

  it('matches a trail attribute the chain truncated with an ellipsis', () => {
    const cert = certificationFor(profile, { program: 'itera-v2', unitId: 'u', trail: 'Week 1 ·…', minDays: 1, totalDays: 5 });
    expect(cert?.asset).toBe('a');
  });

  it('lists the claims of one day of one trail', () => {
    expect(dayClaims(profile.capabilities, 0, 1).map((n) => n.id)).toEqual(['a', 'b']);
    expect(dayClaims(profile.capabilities, 0, null)).toEqual([]);
    expect(dayClaims(null, 0, 1)).toEqual([]);
  });
});
