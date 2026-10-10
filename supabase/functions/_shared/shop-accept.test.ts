import { describe, expect, it } from 'vitest';
import { currencyOffered, parseAccept, resolvedCurrencies } from './shop-accept.ts';

describe('shop accept', () => {
  it('reads the stored value and falls back on both', () => {
    expect(parseAccept('sol')).toBe('sol');
    expect(parseAccept('crystals')).toBe('crystals');
    expect(parseAccept('both')).toBe('both');
    expect(parseAccept('Sol')).toBe('both');
    expect(parseAccept('')).toBe('both');
    expect(parseAccept(undefined)).toBe('both');
    expect(parseAccept(null)).toBe('both');
  });

  it('offers a currency only when the global value allows it AND the item flag is on', () => {
    const open = { sol_enabled: true, crystals_enabled: true };
    expect(currencyOffered('both', open, 'sol')).toBe(true);
    expect(currencyOffered('both', open, 'crystals')).toBe(true);
    expect(currencyOffered('sol', open, 'sol')).toBe(true);
    expect(currencyOffered('sol', open, 'crystals')).toBe(false);
    expect(currencyOffered('crystals', open, 'sol')).toBe(false);
    expect(currencyOffered('crystals', open, 'crystals')).toBe(true);
  });

  it('an item flag off closes that currency whatever the global value says', () => {
    const solOnly = { sol_enabled: true, crystals_enabled: false };
    expect(currencyOffered('both', solOnly, 'crystals')).toBe(false);
    expect(currencyOffered('crystals', solOnly, 'crystals')).toBe(false);
    expect(currencyOffered('sol', solOnly, 'sol')).toBe(true);
    const neither = { sol_enabled: false, crystals_enabled: false };
    expect(currencyOffered('both', neither, 'sol')).toBe(false);
    expect(currencyOffered('both', neither, 'crystals')).toBe(false);
  });

  it('a missing flag reads as on', () => {
    expect(currencyOffered('both', {}, 'sol')).toBe(true);
    expect(currencyOffered('both', { sol_enabled: null }, 'sol')).toBe(true);
  });

  it('resolves both flags for a list', () => {
    expect(resolvedCurrencies('sol', { sol_enabled: true, crystals_enabled: true })).toEqual({ sol_enabled: true, crystals_enabled: false });
    expect(resolvedCurrencies('both', { sol_enabled: false, crystals_enabled: true })).toEqual({ sol_enabled: false, crystals_enabled: true });
  });
});
