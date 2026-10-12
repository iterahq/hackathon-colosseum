import { describe, expect, it } from 'vitest';
import { toTeraOrigin } from './teraOrigin';

const proof = { asset: 'Asset1', page_url: 'https://x/c/Asset1', explorer_url: 'https://explorer/Asset1' };

describe('toTeraOrigin', () => {
  it('answers null for a Tera that says nothing about its origin', () => {
    for (const v of [null, {}, { origin: 'gift' }, { transferable: true }]) expect(toTeraOrigin(v)).toBeNull();
  });

  it('reads an earned Tera: bound to the wallet, with the day and the chest that gave it', () => {
    const o = toTeraOrigin({ origin: 'earned', transferable: false, proof, earned: { certification: 'Cert1', trail: 'Week 1 · HTML', day: 2, tier: 'rare', chest_id: 'c-1' } });
    expect(o).toEqual({ kind: 'earned', transferable: false, proof: { asset: 'Asset1', explorerUrl: 'https://explorer/Asset1' }, earned: { certification: 'Cert1', trail: 'Week 1 · HTML', day: 2, tier: 'rare', chestId: 'c-1' }, sponsor: null });
  });

  it('reads a bought Tera as transferable, and falls back to the asset of the object', () => {
    expect(toTeraOrigin({ origin: 'bought', transferable: true, asset: 'Asset2' })).toMatchObject({ kind: 'bought', transferable: true, proof: { asset: 'Asset2', explorerUrl: null }, earned: null, sponsor: null });
  });

  it('reads a sponsored Tera with its brand and bounty, and refuses a colour that is not a hex', () => {
    const o = toTeraOrigin({ origin: 'sponsor', transferable: false, proof, sponsor: { brand: 'Acme', accent: 'url(x)', bounty_slug: 'fix-nav', bounty_title: 'Fix the nav', payout_tx: 'sig' } });
    expect(o?.sponsor).toEqual({ brand: 'Acme', accent: '#F4EDE2', bountySlug: 'fix-nav', bountyTitle: 'Fix the nav', payoutTx: 'sig' });
    expect(toTeraOrigin({ origin: 'sponsor', sponsor: { brand: 'Acme', accent: '#ff8800' } })?.sponsor?.accent).toBe('#ff8800');
  });

  it('never lets an earned or sponsored Tera read as transferable, whatever the flag says', () => {
    expect(toTeraOrigin({ origin: 'earned', transferable: true })?.transferable).toBe(false);
    expect(toTeraOrigin({ origin: 'sponsor', transferable: true })?.transferable).toBe(false);
  });
});
