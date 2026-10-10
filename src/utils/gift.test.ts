import { describe, expect, it } from 'vitest';
import { captureRef, clearRef, giftActionUrl, giftBlinkUrl, giftLabel, inviteLink, pendingRef, shortWallet } from '@/utils/gift';

const WALLET = 'BNCkAhpDgLhzncCYNTnENCzRZDvo2iLPdUSMm89qBoqH';
const SUPABASE = 'https://nyzcbnnbffsizshiolbh.supabase.co';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('gift links', () => {
  it('names a learner by nickname, else by short wallet', () => {
    expect(shortWallet(WALLET)).toBe('BNCk…BoqH');
    expect(giftLabel('Duda', WALLET)).toBe('Duda');
    expect(giftLabel('  ', WALLET)).toBe('BNCk…BoqH');
    expect(giftLabel(null, WALLET)).toBe('BNCk…BoqH');
  });

  it('wraps the action url in a dial.to blink on devnet', () => {
    const action = giftActionUrl(`${SUPABASE}/`, WALLET);
    expect(action).toBe(`${SUPABASE}/functions/v1/action-gift?to=${WALLET}`);
    const blink = new URL(giftBlinkUrl(SUPABASE, WALLET));
    expect(blink.origin).toBe('https://dial.to');
    expect(blink.searchParams.get('action')).toBe(`solana-action:${action}`);
    expect(blink.searchParams.get('cluster')).toBe('devnet');
  });

  it('builds the invite link on the site root', () => {
    expect(inviteLink('https://site.example/', 'bcdf2345')).toBe('https://site.example/?ref=bcdf2345');
  });
});

describe('invite code kept through sign-in', () => {
  it('stores a valid code and returns it later', () => {
    const store = memoryStore();
    expect(captureRef('?ref=BCDF2345&x=1', store)).toBe('bcdf2345');
    expect(captureRef('', store)).toBe('bcdf2345');
    expect(pendingRef(store)).toBe('bcdf2345');
    clearRef(store);
    expect(pendingRef(store)).toBeNull();
  });

  it('ignores anything that is not a code', () => {
    const store = memoryStore();
    for (const search of ['?ref=', '?ref=ab', `?ref=${WALLET}`, '?ref=<script>', '?other=bcdf2345']) expect(captureRef(search, store)).toBeNull();
  });

  it('survives a storage that throws', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(captureRef('?ref=bcdf2345', broken)).toBe('bcdf2345');
    expect(pendingRef(broken)).toBeNull();
    expect(() => clearRef(broken)).not.toThrow();
  });
});
