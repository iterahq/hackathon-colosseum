import { describe, expect, it } from 'vitest';
import { lamportsToSol, missionHref, optInErrorKey, parseMinDays } from './talent';

describe('talent utils', () => {
  it('writes lamports as SOL', () => {
    expect(lamportsToSol(0)).toBe('0');
    expect(lamportsToSol(20_000_000)).toBe('0.02');
    expect(lamportsToSol(1_500_000_000)).toBe('1.5');
  });
  it('builds the mission link with the wallet encoded', () => {
    expect(missionHref('AbC1')).toBe('/bounties/post?to=AbC1');
  });
  it('maps refusal codes to message keys', () => {
    expect(optInErrorKey('invalid_headline')).toBe('talent.optin.error.invalid_headline');
    expect(optInErrorKey('wallet_taken')).toBe('talent.optin.error.wallet_taken');
    expect(optInErrorKey(null)).toBe('talent.optin.error.generic');
    expect(optInErrorKey('boom')).toBe('talent.optin.error.generic');
  });
  it('reads a minimum of days from the query string', () => {
    expect(parseMinDays('3')).toBe(3);
    expect(parseMinDays('-1')).toBe(0);
    expect(parseMinDays(null)).toBe(0);
    expect(parseMinDays('x')).toBe(0);
  });
});
