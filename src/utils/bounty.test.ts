import { describe, expect, it } from 'vitest';
import { checkDeliveryUrl, checkPostText, createErrorField, formatRemaining, isRewardInRange, isValidSlug, lamportsToSol, plural, safeHttpsUrl, slugify, solToLamports, sortBounties, statusTone, validatePostForm } from './bounty';

describe('solToLamports', () => {
  it('converts without float drift', () => {
    expect(solToLamports('0.1')).toBe(100_000_000);
    expect(solToLamports('0.001')).toBe(1_000_000);
    expect(solToLamports('0.123456789')).toBe(123_456_789);
    expect(solToLamports('0,5')).toBe(500_000_000);
    expect(solToLamports('1.1')).toBe(1_100_000_000);
  });
  it('refuses what is not a plain amount', () => {
    for (const bad of ['', 'abc', '-1', '0.1234567891', '1e3', '1.', '.5']) expect(solToLamports(bad)).toBeNull();
  });
  it('bounds the reward', () => {
    expect(isRewardInRange(1_000_000)).toBe(true);
    expect(isRewardInRange(999_999)).toBe(false);
    expect(isRewardInRange(500_000_000)).toBe(true);
    expect(isRewardInRange(500_000_001)).toBe(false);
  });
});

describe('slugs', () => {
  it('suggests a clean slug', () => {
    expect(slugify('Accessible FAQ in plain JavaScript!')).toBe('accessible-faq-in-plain-javascript');
    expect(slugify('  Café  ação ')).toBe('cafe-acao');
  });
  it('validates', () => {
    expect(isValidSlug('a-b-1')).toBe(true);
    for (const bad of ['', 'A', 'a--b', '-a', 'a-', 'a b']) expect(isValidSlug(bad)).toBe(false);
  });
});

describe('safeHttpsUrl', () => {
  it('keeps only https links', () => {
    expect(safeHttpsUrl('https://codepen.io/x')).toBe('https://codepen.io/x');
    expect(safeHttpsUrl('http://x.io')).toBeNull();
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
});

describe('board order', () => {
  it('puts open first, then in progress, paid, the rest', () => {
    const order = sortBounties([{ status: 'refunded' }, { status: 'paid' }, { status: 'claimed' }, { status: 'open' }, { status: 'open' }] as const).map((b) => b.status);
    expect(order).toEqual(['open', 'open', 'claimed', 'paid', 'refunded']);
  });
  it('maps tones', () => {
    expect(statusTone('open')).toBe('open');
    expect(statusTone('submitted')).toBe('progress');
    expect(statusTone('paid')).toBe('paid');
    expect(statusTone('expired')).toBe('muted');
  });
});

describe('formatRemaining', () => {
  it('shortens', () => {
    expect(formatRemaining(90_000)).toBe('1d 1h');
    expect(formatRemaining(3 * 3600 + 12 * 60)).toBe('3h 12min');
    expect(formatRemaining(14 * 60)).toBe('14min');
    expect(formatRemaining(-5)).toBe('0min');
  });
});

describe('createErrorField', () => {
  it('places every refusal on a field', () => {
    expect(createErrorField('slug_taken')).toBe('slug');
    expect(createErrorField('invalid_reward')).toBe('reward');
    expect(createErrorField('invalid_refund_address')).toBe('refund');
    expect(createErrorField('invalid_deadline')).toBe('deadline');
    expect(createErrorField('boom')).toBeNull();
    expect(createErrorField(null)).toBeNull();
  });
});

describe('checkDeliveryUrl', () => {
  it('names what is wrong', () => {
    expect(checkDeliveryUrl('')).toBe('empty');
    expect(checkDeliveryUrl('   ')).toBe('empty');
    expect(checkDeliveryUrl('codepen.io/you/pen/abc')).toBe('not_url');
    expect(checkDeliveryUrl('https://')).toBe('not_url');
    expect(checkDeliveryUrl('ftp://x.io/a')).toBe('not_url');
    expect(checkDeliveryUrl('http://example.com/x')).toBe('http');
    expect(checkDeliveryUrl('HTTP://example.com/x')).toBe('http');
    expect(checkDeliveryUrl(`https://x.io/${'a'.repeat(500)}`)).toBe('too_long');
  });
  it('accepts a plain https link, even with spaces around it', () => {
    expect(checkDeliveryUrl('https://codepen.io/you/pen/abc')).toBeNull();
    expect(checkDeliveryUrl('  https://codepen.io/you/pen/abc  ')).toBeNull();
    expect(checkDeliveryUrl(`https://x.io/${'a'.repeat(487)}`)).toBeNull();
  });
});

describe('plural', () => {
  const t = (key: string, vars: Record<string, string | number> = {}) => `${key}|${JSON.stringify(vars)}`;
  it('uses the one form only for exactly 1', () => {
    expect(plural(t, 'k', 1)).toBe('k.one|{"n":1}');
    expect(plural(t, 'k', 0)).toBe('k.many|{"n":0}');
    expect(plural(t, 'k', 2)).toBe('k.many|{"n":2}');
  });
  it('passes the other variables on', () => {
    expect(plural(t, 'k', 3, { trail: 'W1' })).toBe('k.many|{"n":3,"trail":"W1"}');
  });
});

describe('lamportsToSol', () => {
  it('prints exact decimals', () => {
    expect(lamportsToSol(0)).toBe('0');
    expect(lamportsToSol(1_000_000_000)).toBe('1');
    expect(lamportsToSol(120_005_000)).toBe('0.120005');
    expect(lamportsToSol(5_000)).toBe('0.000005');
  });
  it('round-trips with solToLamports', () => {
    for (const sol of ['0.05', '0.123456789', '2', '0.001']) expect(lamportsToSol(solToLamports(sol) ?? -1)).toBe(sol);
  });
});

describe('post form', () => {
  const ok = { sponsor: 'Acme Inc', title: 'Accessible FAQ page', summary: 'A small FAQ with keyboard support.', brief: 'x'.repeat(60), deliverable: 'A public link.', reward: '0.05', minDays: '2', expires: '7', claimHours: '24' };
  const ctx = { minRewardLamports: 1_000_000, maxRewardLamports: 500_000_000, maxExpiryDays: 30, maxClaimHours: 168, totalDays: 5 };
  it('checks the length of a text', () => {
    expect(checkPostText('title', 'short')).toBe('short');
    expect(checkPostText('title', 'x'.repeat(8))).toBeNull();
    expect(checkPostText('title', 'x'.repeat(91))).toBe('long');
    expect(checkPostText('sponsor', '  a  ')).toBe('short');
  });
  it('accepts a complete form and converts the numbers', () => {
    const check = validatePostForm(ok, ctx);
    expect(check.errors).toEqual({});
    expect(check).toMatchObject({ rewardLamports: 50_000_000, minDays: 2, expiresInDays: 7, claimHours: 24 });
  });
  it('flags each bad field', () => {
    const check = validatePostForm({ ...ok, sponsor: 'A', brief: 'x', reward: '0.0001', minDays: '6', expires: '31', claimHours: '0' }, ctx);
    expect(check.errors).toEqual({ sponsor: 'short', brief: 'short', reward: 'invalid', requirement: 'invalid', expires: 'invalid', claimHours: 'invalid' });
  });
  it('refuses a reward above the cap and a form with no trail', () => {
    expect(validatePostForm({ ...ok, reward: '0.6' }, ctx).errors.reward).toBe('invalid');
    expect(validatePostForm(ok, { ...ctx, totalDays: null }).errors.requirement).toBe('invalid');
  });
});
