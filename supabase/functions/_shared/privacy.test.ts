import { describe, expect, it } from 'vitest';
import { REVEALS_PER_DAY, companyVia, contactOf, parseContact, privateProfile, profileVisibility, revealVerdict, revealsLeft, walletIsPublic } from './privacy';

const CUTOFF = '2026-10-12T08:00:00Z';

describe('whether a profile is shown to others', () => {
  it('follows the choice, whatever the age of the account', () => {
    expect(profileVisibility({ chosen: true, createdAt: '2026-10-13T00:00:00Z', cutoff: CUTOFF })).toEqual({ public: true, source: 'chosen' });
    expect(profileVisibility({ chosen: false, createdAt: '2026-10-09T00:00:00Z', cutoff: CUTOFF })).toEqual({ public: false, source: 'chosen' });
  });

  it('keeps an account that existed before the cutoff visible, and starts a new one private', () => {
    expect(profileVisibility({ chosen: null, createdAt: '2026-10-09T20:54:26.9Z', cutoff: CUTOFF })).toEqual({ public: true, source: 'existing_account' });
    expect(profileVisibility({ chosen: null, createdAt: '2026-10-12T08:00:00Z', cutoff: CUTOFF })).toEqual({ public: false, source: 'new_account' });
    expect(profileVisibility({ chosen: null, createdAt: '2026-10-12T09:00:00Z', cutoff: CUTOFF })).toEqual({ public: false, source: 'new_account' });
  });

  it('answers private when it cannot tell', () => {
    expect(profileVisibility({ chosen: null, createdAt: '2026-10-09T00:00:00Z', cutoff: null }).public).toBe(false);
    expect(profileVisibility({ chosen: null, createdAt: null, cutoff: CUTOFF }).public).toBe(false);
    expect(profileVisibility({ chosen: null, createdAt: 'yesterday', cutoff: CUTOFF }).public).toBe(false);
    expect(profileVisibility({ chosen: null, createdAt: '2026-10-09T00:00:00Z', cutoff: 'soon' }).public).toBe(false);
  });

  it('hides a wallet when any account behind it is private, and shows a wallet nobody is behind', () => {
    const old = { chosen: null, createdAt: '2026-10-09T00:00:00Z', cutoff: CUTOFF };
    expect(walletIsPublic([old])).toBe(true);
    expect(walletIsPublic([old, { ...old, chosen: false }])).toBe(false);
    expect(walletIsPublic([])).toBe(true);
    expect(privateProfile('W')).toEqual({ wallet: 'W', cluster: 'devnet', private: true });
    expect(Object.keys(privateProfile('W'))).toEqual(['wallet', 'cluster', 'private']);
  });
});

describe('the contact of a listing', () => {
  it('needs at least one, and takes each in its own shape', () => {
    expect(parseContact(undefined)).toEqual({ ok: false, error: 'contact_required' });
    expect(parseContact({})).toEqual({ ok: false, error: 'contact_required' });
    expect(parseContact({ email: '', telegram: null, link: '   ' })).toEqual({ ok: false, error: 'contact_required' });
    expect(parseContact('ana@example.com')).toEqual({ ok: false, error: 'contact_required' });
    expect(parseContact({ email: ' Ana.Silva+work@Example.com ' })).toEqual({ ok: true, value: { email: 'ana.silva+work@example.com', telegram: null, linkedin: null, link: null } });
    expect(parseContact({ telegram: '@Ana_Dev' })).toEqual({ ok: true, value: { email: null, telegram: 'ana_dev', linkedin: null, link: null } });
    expect(parseContact({ linkedin: 'https://www.linkedin.com/in/ana-silva-123/' })).toMatchObject({ ok: true, value: { linkedin: 'https://www.linkedin.com/in/ana-silva-123/' } });
    expect(parseContact({ link: 'https://ana.dev/contact' })).toMatchObject({ ok: true, value: { link: 'https://ana.dev/contact' } });
    expect(parseContact({ email: 'a@b.co', telegram: 'ana_dev', linkedin: 'https://www.linkedin.com/in/ana', link: 'https://ana.dev', phone: '+55 11 99999', is_company: true })).toEqual({
      ok: true,
      value: { email: 'a@b.co', telegram: 'ana_dev', linkedin: 'https://www.linkedin.com/in/ana', link: 'https://ana.dev' },
    });
  });

  it('refuses markup, quotes, spaces, control characters and anything that is not of the shape, naming the field', () => {
    const bad = (field: string, value: unknown) => expect(parseContact({ [field]: value })).toEqual({ ok: false, error: 'invalid_contact', field });
    bad('email', '<script>alert(1)</script>@x.com');
    bad('email', 'ana@example.com"><img src=x>');
    bad('email', 'ana @example.com');
    bad('email', 'ana@example');
    bad('email', 'ana@@example.com');
    bad('email', 'ana‮@example.com');
    bad('email', 'a@b.co\n bcc: x@y.z');
    bad('email', `${'a'.repeat(64)}@${'b'.repeat(60)}.com`);
    bad('email', 42);
    bad('telegram', 'ana');
    bad('telegram', 'https://t.me/ana_dev');
    bad('telegram', 'ana dev');
    bad('telegram', 'ana<b>dev');
    bad('linkedin', 'http://www.linkedin.com/in/ana');
    bad('linkedin', 'https://www.linkedin.com.evil.example/in/ana');
    bad('linkedin', 'https://evil.example/www.linkedin.com/in/ana');
    bad('linkedin', 'https://www.linkedin.com/in/ana?x=<script>');
    bad('link', 'javascript:alert(1)');
    bad('link', 'http://ana.dev');
    bad('link', 'https://user:pass@ana.dev');
    bad('link', 'https://localhost');
    bad('link', 'https://ana.dev/"onmouseover="x');
    bad('link', 'https://ana.dev/<svg>');
    bad('link', 'data:text/html;base64,AAAA');
    bad('link', `https://ana.dev/${'a'.repeat(200)}`);
    bad('link', { href: 'https://ana.dev' });
    // One bad field refuses the whole contact, even beside a good one.
    expect(parseContact({ email: 'a@b.co', link: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'invalid_contact', field: 'link' });
  });

  it('reads a stored row back, and a row with nothing as no contact', () => {
    expect(contactOf(null)).toBeNull();
    expect(contactOf({ email: null, telegram: null })).toBeNull();
    expect(contactOf({ email: 'a@b.co' })).toEqual({ email: 'a@b.co', telegram: null, linkedin: null, link: null });
  });
});

describe('who is shown a contact', () => {
  it('counts as a company only the staff of a sponsor tenant or a wallet that funded a bounty', () => {
    expect(companyVia({ staffOfSponsorTenant: false, fundedBounties: 0 })).toBeNull();
    expect(companyVia({ staffOfSponsorTenant: false, fundedBounties: 1 })).toBe('funded_bounty');
    expect(companyVia({ staffOfSponsorTenant: true, fundedBounties: 0 })).toBe('tenant_staff');
  });

  const base = { via: 'funded_bounty' as const, callerUserId: 'company', learnerUserId: 'learner', listed: true, hasContact: true, seenToday: [] as string[] };

  it('refuses a visitor, another learner, the learner themself, a wallet that is not listed and a listing without a contact', () => {
    expect(revealVerdict({ ...base, via: null })).toEqual({ ok: false, status: 403, error: 'not_a_company' });
    expect(revealVerdict({ ...base, via: null, listed: false })).toEqual({ ok: false, status: 403, error: 'not_a_company' });
    expect(revealVerdict({ ...base, callerUserId: 'learner' })).toEqual({ ok: false, status: 403, error: 'own_listing' });
    expect(revealVerdict({ ...base, listed: false })).toEqual({ ok: false, status: 404, error: 'not_listed' });
    expect(revealVerdict({ ...base, learnerUserId: null })).toEqual({ ok: false, status: 404, error: 'not_listed' });
    expect(revealVerdict({ ...base, hasContact: false })).toEqual({ ok: false, status: 404, error: 'no_contact' });
  });

  it('shows a company at most ten different learners a day; looking again at one of them is free', () => {
    expect(revealVerdict(base)).toEqual({ ok: true, via: 'funded_bounty', left: REVEALS_PER_DAY - 1 });
    const nine = Array.from({ length: 9 }, (_, index) => `l${index}`);
    expect(revealVerdict({ ...base, seenToday: nine })).toEqual({ ok: true, via: 'funded_bounty', left: 0 });
    const ten = [...nine, 'l9'];
    expect(revealVerdict({ ...base, seenToday: ten })).toEqual({ ok: false, status: 429, error: 'reveal_limit' });
    expect(revealVerdict({ ...base, learnerUserId: 'l3', seenToday: ten })).toEqual({ ok: true, via: 'funded_bounty', left: 0 });
    expect(revealVerdict({ ...base, seenToday: [...ten, ...ten] })).toMatchObject({ ok: false, error: 'reveal_limit' });
    expect(revealsLeft([])).toBe(10);
    expect(revealsLeft(['a', 'a', 'b'])).toBe(8);
    expect(revealsLeft(ten)).toBe(0);
  });
});
