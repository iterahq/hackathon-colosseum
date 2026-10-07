import { describe, it, expect } from 'vitest';
import { clearIteraStorage } from '@/utils/storageScope';
import {
  DFL_STATE_KEY,
  DFL_STATE_TTL_MS,
  consumeDflState,
  createDflState,
  unwrapNext,
  wrapNext,
} from '@/auth/dflState';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('storage key', () => {
  it('survives clearIteraStorage (sign-out in another tab)', () => {
    const n = createDflState(window.localStorage, 0);
    window.localStorage.setItem('itera.other', '1');
    clearIteraStorage();
    expect(window.localStorage.getItem('itera.other')).toBeNull();
    expect(consumeDflState(window.localStorage, 1, n)).toBe(true);
  });
});

describe('createDflState', () => {
  it('returns a 22 char base64url nonce and stores it with the time', () => {
    const s = memory();
    const n = createDflState(s, 1000);
    expect(n).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.parse(s.getItem(DFL_STATE_KEY)!)).toEqual({ nonce: n, at: 1000 });
  });

  it('a new start overwrites the old one', () => {
    const s = memory();
    const a = createDflState(s, 1);
    const b = createDflState(s, 2);
    expect(a).not.toBe(b);
    expect(consumeDflState(s, 3, a)).toBe(false);
  });

  it('still returns a nonce when storage throws, and consume fails closed', () => {
    const n = createDflState(throwing, 1);
    expect(n).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(consumeDflState(throwing, 2, n)).toBe(false);
  });
});

describe('consumeDflState', () => {
  it('accepts the matching nonce once; reuse is refused', () => {
    const s = memory();
    const n = createDflState(s, 0);
    expect(consumeDflState(s, 1, n)).toBe(true);
    expect(s.getItem(DFL_STATE_KEY)).toBeNull();
    expect(consumeDflState(s, 2, n)).toBe(false);
  });

  it('a mismatch refuses and still consumes the entry', () => {
    const s = memory();
    const n = createDflState(s, 0);
    expect(consumeDflState(s, 1, 'x'.repeat(22))).toBe(false);
    expect(s.getItem(DFL_STATE_KEY)).toBeNull();
    expect(consumeDflState(s, 2, n)).toBe(false);
  });

  it('expiry boundary: 60 minutes minus 1 ms passes, exactly 60 minutes does not', () => {
    const a = memory();
    const na = createDflState(a, 0);
    expect(consumeDflState(a, DFL_STATE_TTL_MS - 1, na)).toBe(true);
    const b = memory();
    const nb = createDflState(b, 0);
    expect(consumeDflState(b, DFL_STATE_TTL_MS, nb)).toBe(false);
    expect(b.getItem(DFL_STATE_KEY)).toBeNull();
  });

  it('refuses a start time in the future', () => {
    const s = memory();
    const n = createDflState(s, 5000);
    expect(consumeDflState(s, 1000, n)).toBe(false);
  });

  it('refuses when nothing is stored', () => {
    expect(consumeDflState(memory(), 1, 'a'.repeat(22))).toBe(false);
  });

  it.each(['{not json', 'null', '[]', '"s"', '{"nonce":1,"at":0}', '{"nonce":"a"}', '{"nonce":"a","at":"0"}'])(
    'malformed stored value %s refuses and is removed',
    (raw) => {
      const s = memory();
      s.setItem(DFL_STATE_KEY, raw);
      expect(consumeDflState(s, 1, 'a')).toBe(false);
      expect(s.getItem(DFL_STATE_KEY)).toBeNull();
    },
  );

  it.each([undefined, null, 5, {}, ['a']])('rejects a non-string nonce %s', (bad) => {
    const s = memory();
    createDflState(s, 0);
    expect(consumeDflState(s, 1, bad)).toBe(false);
    expect(s.getItem(DFL_STATE_KEY)).toBeNull();
  });
});

describe('wrapNext / unwrapNext', () => {
  const n = 'AbCdEfGhIjKlMnOpQrStUv';

  it('round-trips a path', () => {
    expect(wrapNext(n, '/program/x?a=1#h')).toBe(`/~${n}/program/x?a=1#h`);
    expect(unwrapNext(wrapNext(n, '/program/x'))).toEqual({ nonce: n, next: '/program/x' });
  });

  it('next exactly "/"', () => {
    expect(unwrapNext(wrapNext(n, '/'))).toEqual({ nonce: n, next: '/' });
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', ''])('wraps unsafe next %j as "/"', (bad) => {
    expect(wrapNext(n, bad)).toBe(`/~${n}/`);
  });

  it.each([`/~${'a'.repeat(22)}//evil.com`, `/~${'a'.repeat(22)}/\\evil.com`])(
    'a hostile next inside the wrapper falls back to "/"',
    (raw) => {
      expect(unwrapNext(raw)).toEqual({ nonce: 'a'.repeat(22), next: '/' });
    },
  );

  it.each([
    `/~${'a'.repeat(21)}/x`,
    `/~${'a'.repeat(23)}/x`,
    `/~${'a'.repeat(22)}`,
    `/~${'a'.repeat(22)}x`,
    `/~${'a+'.repeat(11)}/x`,
    `~${'a'.repeat(22)}/x`,
    '/program/x',
    '/',
    '',
  ])('rejects malformed %j', (raw) => {
    expect(unwrapNext(raw)).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(unwrapNext(null)).toBeNull();
    expect(unwrapNext(undefined)).toBeNull();
  });
});
