import { describe, expect, it } from 'vitest';
import { capabilityOptions, certificationFacts, filterCards, listVerdict, orderCards, parseFilter, parseHeadline, type TalentCard } from './talent';

const card = (patch: Partial<TalentCard>): TalentCard => ({
  wallet: 'W',
  name: null,
  avatar: null,
  headline: null,
  stamped_days: 1,
  total_days: 15,
  certifications: 1,
  capabilities: [],
  bounties_paid: 0,
  bounties_paid_lamports: 0,
  last_stamp_at: null,
  profile_url: '/u/W',
  team_test: false,
  ...patch,
});

describe('parseHeadline', () => {
  it('trims and collapses whitespace', () => {
    expect(parseHeadline('  Builds   pages  ')).toEqual({ ok: true, value: 'Builds pages' });
  });
  it('treats empty and missing as no headline', () => {
    expect(parseHeadline(undefined)).toEqual({ ok: true, value: null });
    expect(parseHeadline('   ')).toEqual({ ok: true, value: null });
  });
  it('accepts 120 characters and refuses 121', () => {
    expect(parseHeadline('a'.repeat(120)).ok).toBe(true);
    expect(parseHeadline('a'.repeat(121))).toEqual({ ok: false, error: 'invalid_headline' });
  });
  it.each(['see https://x.com', 'www.site.com', 'me@mail.com', 'ping @someone', 'my site.io', 'a<b>c', 'tab\u0007bell'])('refuses %s', (text) => {
    expect(parseHeadline(text)).toEqual({ ok: false, error: 'invalid_headline' });
  });
  it('refuses a non-string', () => {
    expect(parseHeadline(42)).toEqual({ ok: false, error: 'invalid_headline' });
  });
  it('accepts plain text with accents and punctuation', () => {
    expect(parseHeadline('Estudo HTML e CSS, quero meu primeiro estágio.').ok).toBe(true);
  });
});

describe('listVerdict', () => {
  it('needs a wallet first', () => {
    expect(listVerdict(null, [{ stamped_days: 3, total_days: 5 }])).toEqual({ may_list: false, reason: 'no_wallet' });
  });
  it('needs one stamped day', () => {
    expect(listVerdict('W', [])).toEqual({ may_list: false, reason: 'nothing_proven' });
    expect(listVerdict('W', [{ stamped_days: 0, total_days: 5 }])).toEqual({ may_list: false, reason: 'nothing_proven' });
  });
  it('allows a wallet with a stamped day', () => {
    expect(listVerdict('W', [{ stamped_days: 1, total_days: 5 }])).toEqual({ may_list: true, reason: null });
  });
});

describe('certificationFacts', () => {
  it('counts stamped days from the list', () => {
    expect(certificationFacts({ stamped_days: [1, 2, 4], total_days: 5 })).toEqual({ stamped_days: 3, total_days: 5 });
  });
  it('falls back to days_done and zero', () => {
    expect(certificationFacts({ days_done: 2, total_days: 5 })).toEqual({ stamped_days: 2, total_days: 5 });
    expect(certificationFacts({})).toEqual({ stamped_days: 0, total_days: 0 });
  });
});

describe('filter and order', () => {
  it('parses a filter and ignores junk', () => {
    expect(parseFilter(new URLSearchParams('capability=html-tags&min_days=3'))).toEqual({ capability: 'html-tags', minDays: 3 });
    expect(parseFilter(new URLSearchParams('capability=BAD%20KEY&min_days=-1'))).toEqual({ capability: null, minDays: 0 });
  });
  it('filters by days and capability', () => {
    const cards = [card({ wallet: 'A', stamped_days: 1 }), card({ wallet: 'B', stamped_days: 4, capabilities: [{ key: 'html-tags', title: 'T' }] })];
    expect(filterCards(cards, { capability: null, minDays: 2 }).map((c) => c.wallet)).toEqual(['B']);
    expect(filterCards(cards, { capability: 'html-tags', minDays: 0 }).map((c) => c.wallet)).toEqual(['B']);
    expect(filterCards(cards, { capability: null, minDays: 0 })).toHaveLength(2);
  });
  it('puts real learners first, then days, then last stamp', () => {
    const ordered = orderCards([
      card({ wallet: 'T', team_test: true, stamped_days: 9 }),
      card({ wallet: 'B', stamped_days: 2, last_stamp_at: '2026-10-01' }),
      card({ wallet: 'C', stamped_days: 2, last_stamp_at: '2026-10-05' }),
      card({ wallet: 'D', stamped_days: 5 }),
    ]);
    expect(ordered.map((c) => c.wallet)).toEqual(['D', 'C', 'B', 'T']);
  });
  it('lists capability options in graph order', () => {
    const options = capabilityOptions([card({ capabilities: [{ key: 'b', title: 'B' }, { key: 'a', title: 'A' }] })], ['a', 'b']);
    expect(options.map((o) => o.key)).toEqual(['a', 'b']);
  });
});
