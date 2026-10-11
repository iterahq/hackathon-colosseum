import { describe, expect, it } from 'vitest';
import { detectInjectedWallets, isMobileBrowser } from './solanaWallets';

const signer = (flags: Record<string, boolean> = {}) => ({ signMessage: async () => new Uint8Array(), ...flags });

describe('detectInjectedWallets', () => {
  it('finds nothing on a page without a wallet', () => {
    expect(detectInjectedWallets({})).toEqual([]);
    expect(detectInjectedWallets(undefined)).toEqual([]);
  });

  it('names Phantom once even though it fills two namespaces', () => {
    const phantom = signer({ isPhantom: true });
    const found = detectInjectedWallets({ phantom: { solana: phantom }, solana: phantom });
    expect(found.map((w) => w.id)).toEqual(['phantom']);
    expect(found[0].provider).toBe(phantom);
  });

  it('lists Solflare and Backpack beside Phantom', () => {
    const found = detectInjectedWallets({
      phantom: { solana: signer({ isPhantom: true }) },
      solflare: signer({ isSolflare: true }),
      backpack: { solana: signer({ isBackpack: true }) },
    });
    expect(found.map((w) => w.name)).toEqual(['Phantom', 'Solflare', 'Backpack']);
  });

  it('offers an unknown wallet through the shared window.solana', () => {
    const found = detectInjectedWallets({ solana: signer() });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('other');
  });

  it('ignores objects that cannot sign', () => {
    expect(detectInjectedWallets({ solana: { connect: async () => undefined } })).toEqual([]);
  });
});

describe('isMobileBrowser', () => {
  it('reads the user agent first', () => {
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari' })).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130' })).toBe(false);
  });

  it('falls back to a coarse pointer with touch points', () => {
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 5 }, true)).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }, true)).toBe(false);
    expect(isMobileBrowser(undefined)).toBe(false);
  });
});
