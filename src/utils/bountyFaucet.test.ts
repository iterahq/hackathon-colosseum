import { describe, expect, it } from 'vitest';
import { resources } from '@/i18n';
import { parseSponsorFaucet } from '@/services/bounty.service';
import { faucetKey } from './bountyFaucet';

describe('sponsor faucet answers', () => {
  it('reads a sent drop', () => {
    expect(parseSponsorFaucet({ signature: 'S', lamports: 15_000_000, explorer_url: 'https://x/t' })).toEqual({ kind: 'sent', signature: 'S', explorerUrl: 'https://x/t', lamports: 15_000_000 });
  });
  it('reads each block and an unknown answer', () => {
    expect(parseSponsorFaucet({ blocked: 'already_claimed' })).toEqual({ kind: 'blocked', reason: 'already_claimed' });
    expect(parseSponsorFaucet({ blocked: 'not_needed' })).toEqual({ kind: 'blocked', reason: 'not_needed' });
    expect(parseSponsorFaucet({ blocked: 'weird' })).toEqual({ kind: 'blocked', reason: 'other' });
    expect(parseSponsorFaucet({})).toEqual({ kind: 'unavailable' });
  });
  it('has its own message, in both languages, for every answer', () => {
    const answers = [{ signature: 'S' }, { blocked: 'already_claimed' }, { blocked: 'not_needed' }, { blocked: 'no_wallet' }, { blocked: 'not_devnet' }, {}];
    const keys = answers.map((a) => faucetKey(parseSponsorFaucet(a)));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(resources.en[key], key).toBeTruthy();
      expect(resources.pt[key], key).toBeTruthy();
    }
  });
});
