import { describe, expect, it } from 'vitest';
import { addressUrl, chainUrl, shortAddress, txUrl } from '@/lib/explorer';

describe('explorer links', () => {
  it('points to devnet', () => {
    expect(txUrl('sig1')).toBe('https://explorer.solana.com/tx/sig1?cluster=devnet');
    expect(addressUrl('A1')).toBe('https://explorer.solana.com/address/A1?cluster=devnet');
  });

  it('prefers the transaction and falls back to the asset', () => {
    expect(chainUrl('sig1', 'A1')).toContain('/tx/sig1');
    expect(chainUrl(null, 'A1')).toContain('/address/A1');
    expect(chainUrl(null, null)).toBeNull();
  });

  it('shortens long addresses only', () => {
    expect(shortAddress('7xKpQrstuvwxyz3Fa')).toBe('7xKp…3Fa');
    expect(shortAddress('abc')).toBe('abc');
  });
});
