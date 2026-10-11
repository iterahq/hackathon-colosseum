import { describe, expect, it } from 'vitest';
import { createErrorField, formatRemaining, isRewardInRange, isValidSlug, safeHttpsUrl, slugify, solToLamports, sortBounties, statusTone } from './bounty';

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
