import { describe, expect, it } from 'vitest';
import { contactKinds, parseCompany, parsePrivacy } from './privacy.service';

const WIRE = {
  wallet: 'Wallet1',
  public_profile: false,
  public_profile_source: 'new_account',
  profile_url: 'https://x/u/Wallet1',
  talent: { listed: true, contact: { email: 'ana@example.com', telegram: null, linkedin: null, link: 'https://ana.dev' }, companies_looked: 3, last_looked_at: '2026-10-12T07:00:00Z' },
  company: { is_company: true, via: 'funded_bounty', reveals_left_today: 7, reveals_per_day: 10 },
};

describe('parsePrivacy', () => {
  it('reads the choices and how many companies looked', () => {
    expect(parsePrivacy(WIRE)).toEqual({
      wallet: 'Wallet1',
      publicProfile: false,
      source: 'new_account',
      talentListed: true,
      contactKinds: ['email', 'link'],
      companiesLooked: 3,
      lastLookedAt: '2026-10-12T07:00:00Z',
      company: { isCompany: true, via: 'funded_bounty', revealsLeftToday: 7, revealsPerDay: 10 },
    });
  });

  it('keeps WHICH contacts exist and never a value of one', () => {
    const parsed = parsePrivacy(WIRE);
    expect(JSON.stringify(parsed)).not.toContain('ana@example.com');
    expect(JSON.stringify(parsed)).not.toContain('ana.dev');
    expect(contactKinds({ email: '', telegram: 'ana_dev', other: 'x' })).toEqual(['telegram']);
    expect(contactKinds(null)).toEqual([]);
  });

  it('answers null for a body that does not say whether the profile is public', () => {
    for (const body of [null, {}, { wallet: 'W' }, { public_profile: 'yes' }]) expect(parsePrivacy(body)).toBeNull();
  });

  it('a visitor or a learner is not a company', () => {
    expect(parseCompany(undefined)).toEqual({ isCompany: false, via: null, revealsLeftToday: 0, revealsPerDay: 0 });
    expect(parseCompany({ is_company: true, via: 'friend' }).via).toBeNull();
  });
});
