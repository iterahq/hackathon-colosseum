import { describe, expect, it } from 'vitest';
import type { BountyStats } from '@/types/bounty';
import type { CircuitCounter } from '@/types/circuit';
import { paidHint, readAtLabel, stampsHint, usd } from './landingStats';

const t = (key: string, vars: Record<string, string | number> = {}) => `${key} ${JSON.stringify(vars)}`;

const stats = (over: Partial<BountyStats>): BountyStats =>
  ({ paidCount: 0, paidSol: '0 SOL', rehearsalPaidCount: 0, rehearsalPaidSol: '0 SOL', outsidePaidCount: 0, outsidePaidSol: '0 SOL', lockedSol: '0 SOL', openCount: 0, heldCount: 0, outsideSponsorCount: 0, ...over }) as BountyStats;

const counter = (over: Partial<CircuitCounter>): CircuitCounter =>
  ({ lamports: 0, stampsFunded: 0, purchases: 0, asOf: null, purchaseLamports: 0, sharePercent: 50, stampFeeLamports: 5000, outside: null, shop: null, treasuryExplorerUrl: null, authorityExplorerUrl: null, wallet: null, ...over }) as CircuitCounter;

describe('paidHint', () => {
  it('says nothing was paid', () => {
    expect(paidHint(stats({}), t)).toBe('bounty.stats.paidHint.none {}');
  });
  it('puts the team rehearsal inside the card with zero outsiders, singular', () => {
    expect(paidHint(stats({ paidCount: 1, rehearsalPaidCount: 1 }), t)).toBe('bounty.stats.paidHint.mixed.one {"n":1,"outside":0}');
  });
  it('counts several rehearsals next to the outside payouts', () => {
    expect(paidHint(stats({ paidCount: 3, rehearsalPaidCount: 2, outsidePaidCount: 1 }), t)).toBe('bounty.stats.paidHint.mixed.many {"n":2,"outside":1}');
  });
  it('names only outsiders when no rehearsal was paid', () => {
    expect(paidHint(stats({ paidCount: 2, outsidePaidCount: 2 }), t)).toBe('bounty.stats.paidHint.outside {}');
  });
});

describe('stampsHint', () => {
  it('states the share and the fee next to the purchase count', () => {
    expect(stampsHint(counter({ purchases: 1234 }), t, 'en-US')).toBe('landing.live.stampsHint {"purchases":"1,234","share":50,"fee":"5,000"}');
  });
});

describe('readAtLabel', () => {
  it('is empty when no read carries a time', () => {
    expect(readAtLabel([null, undefined, 'not a date'], 'en')).toBeNull();
  });
  it('takes the latest of the reads', () => {
    const label = readAtLabel(['2026-10-11T13:00:00Z', '2026-10-11T14:30:00Z'], 'en');
    expect(label).toMatch(/30/);
  });
});

describe('usd', () => {
  it('prints cents as dollars in both locales', () => {
    expect(usd(20, 'en')).toBe('US$ 0.20');
    expect(usd(1000, 'pt')).toBe('US$ 10,00');
  });
});
